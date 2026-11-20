// AI suggestions: sends the page image to ComfyUI (via the background script)
// and lists suggested tags, minus the AI blacklist.
import { LOG_PREFIX, STORAGE_KEYS, MESSAGE_ACTIONS } from "../../shared/constants.js";
import { loadData } from "../../shared/storage.js";
import { formatTag } from "../../shared/tags.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { getMainTags, getTargetImageURL, setMainTags } from "../page.js";
import { $, setIconPath, ICON_PATHS } from "./shell.js";
import { createTagChip, syncChipStates } from "./chips.js";
import { setAiStatus } from "./status.js";

const analysis = {
  /**
   * WD14 returns an array of tags already filtered by threshold. An object of
   * `{ tag: score }` is also supported and filtered locally by threshold.
   */
  rawTags: {},
  activeId: null,
  lastThreshold: null,
  lastValidThreshold: "",
};

let thresholdInput;
let analyzeButton;

function hasResults() {
  return Array.isArray(analysis.rawTags) ? analysis.rawTags.length > 0 : Object.keys(analysis.rawTags).length > 0;
}

function updateThresholdStatus() {
  if (
    Array.isArray(analysis.rawTags) &&
    analysis.rawTags.length > 0 &&
    analysis.lastThreshold !== null &&
    Number(thresholdInput.value) !== analysis.lastThreshold
  ) {
    setAiStatus("Threshold changed. Analyze the image again to refresh tags.", "info");
  }
}

function refreshForThreshold() {
  if (Array.isArray(analysis.rawTags)) updateThresholdStatus();
  else if (Object.keys(analysis.rawTags).length > 0) renderAiChips();
}

function getFilteredEntries() {
  const isAllowed = (tag) => !state.tagBlacklist.includes(formatTag(tag));
  if (Array.isArray(analysis.rawTags)) {
    return analysis.rawTags.filter(isAllowed).map((tag) => [tag, null]);
  }
  const threshold = parseFloat(thresholdInput.value);
  return Object.entries(analysis.rawTags).filter(([tag, score]) => score >= threshold && isAllowed(tag));
}

function updateAiToggleButton() {
  const button = $("#lm-add-all-ai");
  const tags = [...$("#lm-ai-chips").querySelectorAll(".lazymod-chip")].map((chip) => chip.dataset.tag).filter(Boolean);
  if (tags.length === 0) return;
  const mainTags = new Set(getMainTags());
  const allActive = tags.every((tag) => mainTags.has(tag));
  button.querySelector("span").textContent = allActive ? "Remove all" : "Add all";
  button.title = allActive ? "Remove all suggested tags" : "Add all suggested tags";
  button.setAttribute("aria-pressed", String(allActive));
  setIconPath(button, allActive ? ICON_PATHS.minus : ICON_PATHS.plus, ".lazymod-action-icon path");
}

function renderAiChips() {
  const container = $("#lm-ai-chips");
  const addAllButton = $("#lm-add-all-ai");
  container.replaceChildren();
  const entries = getFilteredEntries();

  if (entries.length === 0) {
    container.textContent = Array.isArray(analysis.rawTags) ? "No tags returned above the WD14 threshold." : "No tags above threshold.";
    addAllButton.style.display = "none";
    return;
  }

  const mainTags = getMainTags();
  entries.forEach(([tag, score]) => {
    const cleanTag = formatTag(tag);
    container.appendChild(createTagChip(cleanTag, { isActive: mainTags.includes(cleanTag), score }));
  });

  addAllButton.style.display = "inline-flex";
  addAllButton.onclick = () => {
    const current = getMainTags();
    const suggestedTags = [...new Set(entries.map(([tag]) => formatTag(tag)).filter(Boolean))];
    const shouldRemove = suggestedTags.every((tag) => current.includes(tag));
    const suggestedSet = new Set(suggestedTags);
    setMainTags(shouldRemove ? current.filter((tag) => !suggestedSet.has(tag)) : [...current, ...suggestedTags.filter((tag) => !current.includes(tag))]);
    updateAiToggleButton();
  };
  updateAiToggleButton();
}

function setAnalyzeButtonBusy(busy) {
  analyzeButton.disabled = busy;
  if (busy) analyzeButton.setAttribute("aria-busy", "true");
  else analyzeButton.removeAttribute("aria-busy");
  analyzeButton.querySelector("span").textContent = busy ? "Analyzing…" : "Analyze image";
}

function analyzeImage() {
  const container = $("#lm-ai-chips");
  const imgUrl = getTargetImageURL();
  if (!imgUrl) {
    setAiStatus("No image found on this page.", "error");
    return;
  }

  const analysisId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const requestedThreshold = Number(thresholdInput.value || analysis.lastValidThreshold);
  analysis.activeId = analysisId;
  analysis.rawTags = [];
  container.replaceChildren();
  setAnalyzeButtonBusy(true);
  setAiStatus("Connecting to ComfyUI...", "working");

  chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.analyzeImage, analysisId, imgUrl, threshold: requestedThreshold }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    setAnalyzeButtonBusy(false);
    if (analysisId !== analysis.activeId) return;
    analysis.activeId = null;
    if (runtimeError) {
      setAiStatus(`Could not start analysis: ${runtimeError.message}`, "error");
      return;
    }
    if (response?.success && Array.isArray(response.data)) {
      analysis.rawTags = response.data;
      analysis.lastThreshold = requestedThreshold;
      renderAiChips();
      setAiStatus(`Fetched ${response.data.length} tags using threshold ${requestedThreshold.toFixed(2)}.`, "success");
      updateThresholdStatus();
    } else {
      container.replaceChildren();
      setAiStatus(`Analysis failed: ${response?.error || "ComfyUI returned an invalid response."}`, "error");
    }
  });
}

export async function initAiPanel() {
  thresholdInput = $("#lm-threshold");
  analyzeButton = $("#lm-fetch-ai");
  // Hidden until there are suggestions (CSSOM; see tabs.js for why).
  $("#lm-add-all-ai").style.display = "none";

  const savedThreshold = Number(await loadData(STORAGE_KEYS.aiThreshold, thresholdInput.value));
  if (Number.isFinite(savedThreshold) && savedThreshold >= Number(thresholdInput.min) && savedThreshold <= Number(thresholdInput.max)) {
    thresholdInput.value = String(savedThreshold);
  } else {
    console.warn(`${LOG_PREFIX} Saved AI threshold is invalid; using the default value.`);
  }
  analysis.lastValidThreshold = thresholdInput.value;

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === MESSAGE_ACTIONS.analysisProgress && request.analysisId === analysis.activeId) {
      setAiStatus(request.message, "working");
    }
  });

  thresholdInput.oninput = () => {
    if (thresholdInput.value === "" || !thresholdInput.validity.valid) return;
    analysis.lastValidThreshold = thresholdInput.value;
    refreshForThreshold();
  };

  thresholdInput.onblur = () => {
    if (!thresholdInput.validity.valid) thresholdInput.value = analysis.lastValidThreshold;
    analysis.lastValidThreshold = thresholdInput.value;
    chrome.storage.local.set({ [STORAGE_KEYS.aiThreshold]: Number(analysis.lastValidThreshold) }).catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the AI threshold.`, error);
      setAiStatus(`Could not save AI threshold: ${error.message}`, "error");
    });
    refreshForThreshold();
  };

  analyzeButton.onclick = analyzeImage;

  on(EVENTS.tagsChanged, () => {
    syncChipStates($("#lm-ai-chips"), getMainTags());
    updateAiToggleButton();
  });
  on(EVENTS.blacklistChanged, () => {
    if (hasResults()) renderAiChips();
  });
}
