// Messages from the content script to the background script.
import { LOG_PREFIX } from "../shared/constants.js";

/**
 * Asks the background script to open an extension page. Failures are reported
 * with an alert prefixed by `failureLabel` (e.g. "Could not open the editor").
 */
export function requestExtensionPage(message, failureLabel) {
  chrome.runtime.sendMessage(message, (response) => {
    const runtimeError = chrome.runtime.lastError;
    const error = runtimeError ? runtimeError.message : response?.success ? null : response?.error || "Unknown error";
    if (!error) return;
    console.error(`${LOG_PREFIX} ${failureLabel}.`, error);
    alert(`${failureLabel}: ${error}`);
  });
}
