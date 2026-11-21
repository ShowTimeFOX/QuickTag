// AI suggestion state shared by the tagger's AI panel and the Focus Mode
// palette: sends the page image to ComfyUI (via the background script) and
// keeps the suggested tags, minus the AI blacklist. No DOM; every change
// emits `aiSuggestionsChanged`, so both views stay in sync.
import { MESSAGE_ACTIONS } from "../shared/constants.js";
import { formatTag } from "../shared/tags.js";
import { state } from "./state.js";
import { emit, EVENTS } from "./events.js";
import { getTargetImageURL } from "./page.js";

const analysis = {
  /**
   * WD14 returns an array of tags already filtered by threshold. An object of
   * `{ tag: score }` is also supported and filtered locally by threshold.
   */
  rawTags: {},
  activeId: null,
  /** "idle" (never run), "busy", "done", or "error". */
  phase: "idle",
  threshold: 0.35,
  lastThreshold: null,
  status: { message: "", state: "info" },
};

function changed() {
  emit(EVENTS.aiSuggestionsChanged, { phase: analysis.phase });
}

function setStatus(message, statusState) {
  analysis.status = { message, state: statusState };
  changed();
}

export function getAnalysisPhase() {
  return analysis.phase;
}

export function getAnalysisStatus() {
  return { ...analysis.status };
}

export function isScoreList() {
  return !Array.isArray(analysis.rawTags);
}

export function hasSuggestions() {
  return Array.isArray(analysis.rawTags) ? analysis.rawTags.length > 0 : Object.keys(analysis.rawTags).length > 0;
}

export function getThreshold() {
  return analysis.threshold;
}

export function getLastThreshold() {
  return analysis.lastThreshold;
}

/** The threshold the next analysis uses (and that filters score lists). */
export function setThreshold(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === analysis.threshold) return;
  analysis.threshold = number;
  if (isScoreList() && hasSuggestions()) changed();
}

/** Suggested tags allowed by the blacklist (and threshold for score lists): `[[tag, score|null]]`. */
export function getSuggestedEntries() {
  const isAllowed = (tag) => !state.tagBlacklist.includes(formatTag(tag));
  if (Array.isArray(analysis.rawTags)) return analysis.rawTags.filter(isAllowed).map((tag) => [formatTag(tag), null]);
  return Object.entries(analysis.rawTags)
    .filter(([tag, score]) => score >= analysis.threshold && isAllowed(tag))
    .map(([tag, score]) => [formatTag(tag), score]);
}

export function getSuggestedTags() {
  return [...new Set(getSuggestedEntries().map(([tag]) => tag).filter(Boolean))];
}

/** Starts WD14 analysis of the page image; progress and results arrive as events. */
export function startAnalysis() {
  const imgUrl = getTargetImageURL();
  if (!imgUrl) {
    setStatus("No image found on this page.", "error");
    return;
  }
  const analysisId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const requestedThreshold = analysis.threshold;
  analysis.activeId = analysisId;
  analysis.rawTags = [];
  analysis.phase = "busy";
  setStatus("Connecting to ComfyUI...", "working");

  chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.analyzeImage, analysisId, imgUrl, threshold: requestedThreshold }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    if (analysisId !== analysis.activeId) return;
    analysis.activeId = null;
    if (runtimeError) {
      analysis.phase = "error";
      setStatus(`Could not start analysis: ${runtimeError.message}`, "error");
      return;
    }
    if (response?.success && Array.isArray(response.data)) {
      analysis.rawTags = response.data;
      analysis.lastThreshold = requestedThreshold;
      analysis.phase = "done";
      setStatus(`Fetched ${response.data.length} tags using threshold ${requestedThreshold.toFixed(2)}.`, "success");
    } else {
      analysis.phase = "error";
      setStatus(`Analysis failed: ${response?.error || "ComfyUI returned an invalid response."}`, "error");
    }
  });
}

export function initAiAnalysis({ threshold }) {
  setThreshold(threshold);
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === MESSAGE_ACTIONS.analysisProgress && request.analysisId === analysis.activeId) {
      setStatus(request.message, "working");
    }
  });
}
