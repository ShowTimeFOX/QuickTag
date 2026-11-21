// AI suggestion settings: the confidence threshold (Settings › AI suggestions).
// The analysis is in ../ai-analysis.js; its results appear as the AI group in
// the tagger palette (palette-panel.js) and the Focus Mode palette.
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { loadData } from "../../shared/storage.js";
import { initAiAnalysis, setThreshold } from "../ai-analysis.js";
import { $ } from "./shell.js";
import { setConfigStatus } from "./status.js";

export async function initAiSettings() {
  const thresholdInput = $("#lm-threshold");
  const savedThreshold = Number(await loadData(STORAGE_KEYS.aiThreshold, thresholdInput.value));
  if (Number.isFinite(savedThreshold) && savedThreshold >= Number(thresholdInput.min) && savedThreshold <= Number(thresholdInput.max)) {
    thresholdInput.value = String(savedThreshold);
  } else {
    console.warn(`${LOG_PREFIX} Saved AI threshold is invalid; using the default value.`);
  }
  let lastValidThreshold = thresholdInput.value;
  initAiAnalysis({ threshold: Number(thresholdInput.value) });

  thresholdInput.oninput = () => {
    if (thresholdInput.value === "" || !thresholdInput.validity.valid) return;
    lastValidThreshold = thresholdInput.value;
    setThreshold(lastValidThreshold);
  };
  thresholdInput.onblur = () => {
    if (!thresholdInput.validity.valid) thresholdInput.value = lastValidThreshold;
    lastValidThreshold = thresholdInput.value;
    setThreshold(lastValidThreshold);
    chrome.storage.local.set({ [STORAGE_KEYS.aiThreshold]: Number(lastValidThreshold) }).catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the AI threshold.`, error);
      setConfigStatus(`Could not save AI threshold: ${error.message}`, "error");
    });
  };
}
