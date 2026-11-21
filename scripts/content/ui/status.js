// Inline status messages in the tagger (`data-state`: info|working|success|error).
import { $ } from "./shell.js";

function setStatus(element, message, statusState) {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = statusState;
  element.hidden = !message;
}

/** Status line in the Settings view (themes, backups, layout saves). */
export function setConfigStatus(message, statusState = "info") {
  setStatus($("#lm-config-status"), message, statusState);
}
