// AI suggestions panel in the tagger: threshold, Analyze button, suggested
// tag chips, and Add all / Remove all. The analysis itself and its results
// live in ../ai-analysis.js (shared with the Focus Mode palette).
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { loadData } from "../../shared/storage.js";
import { on, EVENTS } from "../events.js";
import { getMainTags, setMainTags } from "../page.js";
import {
  getAnalysisPhase,
  getAnalysisStatus,
  getLastThreshold,
  getSuggestedEntries,
  getSuggestedTags,
  hasSuggestions,
  initAiAnalysis,
  isScoreList,
  setThreshold,
  startAnalysis,
} from "../ai-analysis.js";
import { $, setIconPath, ICON_PATHS } from "./shell.js";
import { createTagChip, syncChipStates } from "./chips.js";
import { setAiStatus } from "./status.js";

let thresholdInput;
let analyzeButton;
let lastValidThreshold = "";

function updateThresholdStatus() {
  if (!isScoreList() && hasSuggestions() && getLastThreshold() !== null && Number(thresholdInput.value) !== getLastThreshold()) {
    setAiStatus("Threshold changed. Analyze the image again to refresh tags.", "info");
  }
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
  const entries = getSuggestedEntries();

  if (entries.length === 0) {
    container.textContent = isScoreList() ? "No tags above threshold." : "No tags returned above the WD14 threshold.";
    addAllButton.style.display = "none";
    return;
  }

  const mainTags = getMainTags();
  entries.forEach(([tag, score]) => container.appendChild(createTagChip(tag, { isActive: mainTags.includes(tag), score })));
  addAllButton.style.display = "inline-flex";
  updateAiToggleButton();
}

function toggleAllSuggestions() {
  const current = getMainTags();
  const suggestedTags = getSuggestedTags();
  if (!suggestedTags.length) return;
  const shouldRemove = suggestedTags.every((tag) => current.includes(tag));
  const suggestedSet = new Set(suggestedTags);
  setMainTags(shouldRemove ? current.filter((tag) => !suggestedSet.has(tag)) : [...current, ...suggestedTags.filter((tag) => !current.includes(tag))]);
  updateAiToggleButton();
}

function setAnalyzeButtonBusy(busy) {
  analyzeButton.disabled = busy;
  if (busy) analyzeButton.setAttribute("aria-busy", "true");
  else analyzeButton.removeAttribute("aria-busy");
  analyzeButton.querySelector("span").textContent = busy ? "Analyzing…" : "Analyze image";
}

/** Renders the shared analysis state (started here or in Focus Mode). */
function renderAnalysis() {
  const phase = getAnalysisPhase();
  const { message, state: statusState } = getAnalysisStatus();
  setAnalyzeButtonBusy(phase === "busy");
  if (message) setAiStatus(message, statusState);
  if (phase === "busy" || phase === "error") {
    // Same as before: no chips while analyzing or after a failure.
    $("#lm-ai-chips").replaceChildren();
    $("#lm-add-all-ai").style.display = "none";
  } else if (phase === "done") {
    renderAiChips();
    updateThresholdStatus();
  }
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
  lastValidThreshold = thresholdInput.value;
  initAiAnalysis({ threshold: Number(thresholdInput.value) });

  thresholdInput.oninput = () => {
    if (thresholdInput.value === "" || !thresholdInput.validity.valid) return;
    lastValidThreshold = thresholdInput.value;
    setThreshold(lastValidThreshold);
    updateThresholdStatus();
  };

  thresholdInput.onblur = () => {
    if (!thresholdInput.validity.valid) thresholdInput.value = lastValidThreshold;
    lastValidThreshold = thresholdInput.value;
    setThreshold(lastValidThreshold);
    chrome.storage.local.set({ [STORAGE_KEYS.aiThreshold]: Number(lastValidThreshold) }).catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the AI threshold.`, error);
      setAiStatus(`Could not save AI threshold: ${error.message}`, "error");
    });
    updateThresholdStatus();
  };

  analyzeButton.onclick = startAnalysis;
  $("#lm-add-all-ai").onclick = toggleAllSuggestions;

  on(EVENTS.aiSuggestionsChanged, renderAnalysis);
  on(EVENTS.tagsChanged, () => {
    syncChipStates($("#lm-ai-chips"), getMainTags());
    updateAiToggleButton();
  });
  on(EVENTS.blacklistChanged, () => {
    if (hasSuggestions()) renderAiChips();
  });
}
