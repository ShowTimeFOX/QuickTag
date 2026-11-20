// Image analysis through a local ComfyUI server with the WD14 Tagger node.
// Flow: check node → fetch image → upload → submit workflow → poll history.
import { COMFYUI_BASE_URL, WD14_NODE_TYPE } from "../shared/constants.js";

const DEFAULT_WD14_MODEL = "wd-v1-4-moat-tagger-v2";
const POLL_INTERVAL_MS = 800;
const ANALYSIS_TIMEOUT_MS = 15 * 60 * 1000;
// Workflow node ids: 1 loads the uploaded image, 2 runs WD14 on it.
const TAGGER_NODE_ID = "2";
const EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

async function comfyRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${COMFYUI_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(`Could not connect to ComfyUI at ${COMFYUI_BASE_URL}. Check that ComfyUI is running. (${error.message})`);
  }
  if (!response.ok) {
    const details = (await response.text()).slice(0, 240);
    throw new Error(`ComfyUI returned HTTP error ${response.status}${details ? `: ${details}` : ""}`);
  }
  return response;
}

function getNodeDefault(nodeSchema, inputName, fallback) {
  return nodeSchema.input?.required?.[inputName]?.[1]?.default ?? fallback;
}

function getModelName(nodeSchema) {
  const modelInput = nodeSchema.input?.required?.model;
  const models = Array.isArray(modelInput?.[0]) ? modelInput[0] : [];
  const preferred = getNodeDefault(nodeSchema, "model", DEFAULT_WD14_MODEL);
  if (models.length === 0) {
    throw new Error("The WD14 node did not provide a model list.");
  }
  return models.includes(preferred) ? preferred : models[0];
}

function getWorkflowError(historyEntry) {
  const messages = historyEntry.status?.messages;
  if (!Array.isArray(messages)) return null;
  const errorMessage = messages.find(([type]) => type === "execution_error" || type === "execution_interrupted")?.[1];
  if (!errorMessage) return null;
  return errorMessage.exception_message || errorMessage.message || JSON.stringify(errorMessage);
}

function extractWd14Tags(historyEntry) {
  const rawTags = historyEntry.outputs?.[TAGGER_NODE_ID]?.tags;
  if (!Array.isArray(rawTags) && typeof rawTags !== "string") {
    throw new Error("ComfyUI did not return a list of tags from the WD14 node.");
  }
  const tagEntries = Array.isArray(rawTags) ? rawTags.flat(Infinity) : [rawTags];
  return [
    ...new Set(
      tagEntries
        .flatMap((tag) => String(tag).split(","))
        .map((tag) => tag.trim().replace(/\\([()])/g, "$1"))
        .filter(Boolean),
    ),
  ];
}

async function getTaggerSchema() {
  const response = await comfyRequest(`/object_info/${encodeURIComponent(WD14_NODE_TYPE)}`);
  const nodeSchema = (await response.json())[WD14_NODE_TYPE];
  if (!nodeSchema) {
    throw new Error("ComfyUI node WD14Tagger|pysssss was not found. Install ComfyUI-WD14-Tagger and restart ComfyUI.");
  }
  return nodeSchema;
}

async function fetchImage(imgUrl) {
  let response;
  try {
    response = await fetch(imgUrl);
  } catch (error) {
    throw new Error(`Could not fetch the image from the page: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch the image from the page (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The fetched image is empty.");
  return blob;
}

/** Uploads the image to ComfyUI's input folder; returns the LoadImage input. */
async function uploadImage(blob) {
  const extension = EXTENSION_BY_MIME_TYPE[blob.type] || "png";
  const form = new FormData();
  form.append("image", blob, `quicktag-${crypto.randomUUID()}.${extension}`);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await comfyRequest("/upload/image", { method: "POST", body: form });
  const uploaded = await response.json();
  if (typeof uploaded.name !== "string" || !uploaded.name) {
    throw new Error("ComfyUI did not return the uploaded image name.");
  }
  return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
}

function buildWorkflow(imageInput, nodeSchema, threshold) {
  return {
    1: {
      class_type: "LoadImage",
      inputs: { image: imageInput },
    },
    [TAGGER_NODE_ID]: {
      class_type: WD14_NODE_TYPE,
      inputs: {
        image: ["1", 0],
        model: getModelName(nodeSchema),
        threshold,
        character_threshold: Number(getNodeDefault(nodeSchema, "character_threshold", 0.85)),
        replace_underscore: Boolean(getNodeDefault(nodeSchema, "replace_underscore", false)),
        trailing_comma: false,
        exclude_tags: "",
      },
    },
  };
}

async function submitWorkflow(workflow) {
  const response = await comfyRequest("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
  });
  const promptData = await response.json();
  if (promptData.node_errors && Object.keys(promptData.node_errors).length > 0) {
    throw new Error(`ComfyUI rejected the WD14 workflow: ${JSON.stringify(promptData.node_errors)}`);
  }
  if (typeof promptData.prompt_id !== "string" || !promptData.prompt_id) {
    throw new Error("ComfyUI did not return an analysis job ID.");
  }
  return promptData.prompt_id;
}

async function isPromptRunning(promptId) {
  const queue = await (await comfyRequest("/queue")).json();
  return (queue.queue_running || []).some((item) => (Array.isArray(item) ? item[1] === promptId : item.prompt_id === promptId));
}

async function waitForTags(promptId, reportProgress) {
  const historyPath = `/history/${encodeURIComponent(promptId)}`;
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  let analysisStarted = false;
  reportProgress("Waiting for ComfyUI...");

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const history = await (await comfyRequest(historyPath)).json();
    const historyEntry = history[promptId];
    if (historyEntry) {
      const workflowError = getWorkflowError(historyEntry);
      if (workflowError) throw new Error(`WD14 analysis failed: ${workflowError}`);
      if (historyEntry.status?.status_str === "error") {
        throw new Error("ComfyUI interrupted WD14 analysis without providing details.");
      }
      if (historyEntry.outputs?.[TAGGER_NODE_ID]) {
        reportProgress("Fetching tags...");
        return extractWd14Tags(historyEntry);
      }
    }

    if (!analysisStarted) {
      analysisStarted = await isPromptRunning(promptId);
      if (analysisStarted) reportProgress("Analyzing image with WD14...");
    }
  }

  throw new Error("ComfyUI analysis exceeded the 15-minute time limit.");
}

/** Runs WD14 on `imgUrl` and resolves to a list of tag strings. */
export async function analyzeImageWithWd14(imgUrl, requestedThreshold, reportProgress) {
  if (typeof imgUrl !== "string" || !imgUrl) {
    throw new Error("No image URL was found for analysis.");
  }
  const threshold = Number(requestedThreshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Invalid tag confidence threshold.");
  }

  reportProgress("Connecting to ComfyUI...");
  const nodeSchema = await getTaggerSchema();

  reportProgress("Fetching image...");
  const blob = await fetchImage(imgUrl);

  reportProgress("Uploading image to ComfyUI...");
  const imageInput = await uploadImage(blob);

  reportProgress("Preparing WD14 Tagger...");
  const workflow = buildWorkflow(imageInput, nodeSchema, threshold);

  reportProgress("Starting WD14 analysis...");
  const promptId = await submitWorkflow(workflow);
  return waitForTags(promptId, reportProgress);
}
