chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze_image") {
    const tabId = sender.tab?.id;
    const reportProgress = (message) =>
      sendAnalysisProgress(tabId, request.analysisId, message);
    fetchAndTag(request.imgUrl, request.threshold, reportProgress)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Wymagane dla asynchronicznego sendResponse
  }

  if (request.action === "open_about_page") {
    chrome.tabs.create({ url: chrome.runtime.getURL("about.html") }, (tab) => {
      const error = chrome.runtime.lastError;
      sendResponse(
        error
          ? { success: false, error: error.message }
          : { success: true, tabId: tab.id },
      );
    });
    return true;
  }

  if (
    request.action === "open_palette_editor" ||
    request.action === "open_site_config_editor" ||
    request.action === "open_ai_blacklist_editor"
  ) {
    if (
      request.action === "open_palette_editor" &&
      (typeof request.packId !== "string" || !request.packId)
    ) {
      sendResponse({ success: false, error: "Invalid palette ID." });
      return false;
    }

    const editorPath =
      request.action === "open_site_config_editor"
        ? "palette-editor.html?mode=site-configs"
        : request.action === "open_ai_blacklist_editor"
          ? "palette-editor.html?mode=ai-blacklist"
        : `palette-editor.html?packId=${encodeURIComponent(request.packId)}`;
    const editorUrl = chrome.runtime.getURL(editorPath);
    chrome.tabs.create({ url: editorUrl }, (tab) => {
      const error = chrome.runtime.lastError;
      sendResponse(
        error
          ? { success: false, error: error.message }
          : { success: true, tabId: tab.id },
      );
    });
    return true;
  }
});

const COMFYUI_BASE_URL = "http://127.0.0.1:8188";
const WD14_NODE_TYPE = "WD14Tagger|pysssss";

function sendAnalysisProgress(tabId, analysisId, message) {
  if (!Number.isInteger(tabId) || typeof analysisId !== "string") return;
  chrome.tabs
    .sendMessage(tabId, { action: "analysis_progress", analysisId, message })
    .catch((error) => {
      console.debug("[QuickTag] Analysis progress could not be delivered.", error);
    });
}

async function comfyRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${COMFYUI_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(
      `Could not connect to ComfyUI at ${COMFYUI_BASE_URL}. Check that ComfyUI is running. (${error.message})`,
    );
  }
  if (!response.ok) {
    const details = (await response.text()).slice(0, 240);
    throw new Error(
      `ComfyUI returned HTTP error ${response.status}${details ? `: ${details}` : ""}`,
    );
  }
  return response;
}

function getNodeDefault(nodeSchema, inputName, fallback) {
  const input = nodeSchema.input?.required?.[inputName];
  return input?.[1]?.default ?? fallback;
}

function getModelName(nodeSchema) {
  const modelInput = nodeSchema.input?.required?.model;
  const models = Array.isArray(modelInput?.[0]) ? modelInput[0] : [];
  const preferred = getNodeDefault(nodeSchema, "model", "wd-v1-4-moat-tagger-v2");
  if (models.length === 0) {
    throw new Error("The WD14 node did not provide a model list.");
  }
  return models.includes(preferred) ? preferred : models[0];
}

function getWorkflowError(historyEntry) {
  const messages = historyEntry.status?.messages;
  if (!Array.isArray(messages)) return null;
  const errorMessage = messages.find(
    ([type]) => type === "execution_error" || type === "execution_interrupted",
  )?.[1];
  if (!errorMessage) return null;
  return errorMessage.exception_message || errorMessage.message || JSON.stringify(errorMessage);
}

function extractWd14Tags(historyEntry) {
  const output = historyEntry.outputs?.["2"];
  const rawTags = output?.tags;
  if (!Array.isArray(rawTags) && typeof rawTags !== "string") {
    throw new Error("ComfyUI did not return a list of tags from the WD14 node.");
  }
  const tagEntries = Array.isArray(rawTags)
    ? rawTags.flat(Infinity)
    : typeof rawTags === "string"
      ? [rawTags]
      : [];
  const cleanTags = [
    ...new Set(
      tagEntries
        .flatMap((tag) => String(tag).split(","))
        .map((tag) => tag.trim().replace(/\\([()])/g, "$1"))
        .filter(Boolean),
    ),
  ];
  return cleanTags;
}

async function fetchAndTag(imgUrl, requestedThreshold, reportProgress) {
  if (typeof imgUrl !== "string" || !imgUrl) {
    throw new Error("No image URL was found for analysis.");
  }
  const threshold = Number(requestedThreshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Invalid tag confidence threshold.");
  }

  reportProgress("Connecting to ComfyUI...");
  const nodeInfoUrl = `/object_info/${encodeURIComponent(WD14_NODE_TYPE)}`;
  const nodeInfoResponse = await comfyRequest(nodeInfoUrl);
  const objectInfo = await nodeInfoResponse.json();
  const nodeSchema = objectInfo[WD14_NODE_TYPE];
  if (!nodeSchema) {
    throw new Error(
      "ComfyUI node WD14Tagger|pysssss was not found. Install ComfyUI-WD14-Tagger and restart ComfyUI.",
    );
  }

  reportProgress("Fetching image...");
  let imgRes;
  try {
    imgRes = await fetch(imgUrl);
  } catch (error) {
    throw new Error(`Could not fetch the image from the page: ${error.message}`);
  }
  if (!imgRes.ok) {
    throw new Error(`Could not fetch the image from the page (HTTP ${imgRes.status}).`);
  }
  const blob = await imgRes.blob();
  if (blob.size === 0) throw new Error("The fetched image is empty.");

  reportProgress("Uploading image to ComfyUI...");
  const extensionByMimeType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/bmp": "bmp",
  };
  const extension = extensionByMimeType[blob.type] || "png";
  const imageName = `quicktag-${crypto.randomUUID()}.${extension}`;
  const uploadForm = new FormData();
  uploadForm.append("image", blob, imageName);
  uploadForm.append("type", "input");
  uploadForm.append("overwrite", "true");
  const uploadResponse = await comfyRequest("/upload/image", {
    method: "POST",
    body: uploadForm,
  });
  const uploadedImage = await uploadResponse.json();
  if (typeof uploadedImage.name !== "string" || !uploadedImage.name) {
    throw new Error("ComfyUI did not return the uploaded image name.");
  }

  reportProgress("Preparing WD14 Tagger...");
  const imageInput = uploadedImage.subfolder
    ? `${uploadedImage.subfolder}/${uploadedImage.name}`
    : uploadedImage.name;
  const workflow = {
    "1": {
      class_type: "LoadImage",
      inputs: { image: imageInput },
    },
    "2": {
      class_type: WD14_NODE_TYPE,
      inputs: {
        image: ["1", 0],
        model: getModelName(nodeSchema),
        threshold,
        character_threshold: Number(
          getNodeDefault(nodeSchema, "character_threshold", 0.85),
        ),
        replace_underscore: Boolean(
          getNodeDefault(nodeSchema, "replace_underscore", false),
        ),
        trailing_comma: false,
        exclude_tags: "",
      },
    },
  };

  reportProgress("Starting WD14 analysis...");
  const clientId = crypto.randomUUID();
  const promptResponse = await comfyRequest("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  const promptData = await promptResponse.json();
  if (promptData.node_errors && Object.keys(promptData.node_errors).length > 0) {
    throw new Error(`ComfyUI rejected the WD14 workflow: ${JSON.stringify(promptData.node_errors)}`);
  }
  if (typeof promptData.prompt_id !== "string" || !promptData.prompt_id) {
    throw new Error("ComfyUI did not return an analysis job ID.");
  }

  const historyPath = `/history/${encodeURIComponent(promptData.prompt_id)}`;
  const deadline = Date.now() + 15 * 60 * 1000;
  let analysisStarted = false;
  reportProgress("Waiting for ComfyUI...");

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const historyResponse = await comfyRequest(historyPath);
    const history = await historyResponse.json();
    const historyEntry = history[promptData.prompt_id];
    if (historyEntry) {
      const workflowError = getWorkflowError(historyEntry);
      if (workflowError) throw new Error(`WD14 analysis failed: ${workflowError}`);
      if (historyEntry.status?.status_str === "error") {
        throw new Error("ComfyUI interrupted WD14 analysis without providing details.");
      }
      if (historyEntry.outputs?.["2"]) {
        reportProgress("Fetching tags...");
        return extractWd14Tags(historyEntry);
      }
    }

    if (!analysisStarted) {
      const queueResponse = await comfyRequest("/queue");
      const queue = await queueResponse.json();
      analysisStarted = (queue.queue_running || []).some((item) =>
        Array.isArray(item)
          ? item[1] === promptData.prompt_id
          : item.prompt_id === promptData.prompt_id,
      );
      if (analysisStarted) reportProgress("Analyzing image with WD14...");
    }
  }

  throw new Error("ComfyUI analysis exceeded the 15-minute time limit.");
}
