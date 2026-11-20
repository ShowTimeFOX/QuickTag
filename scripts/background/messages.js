// Runtime message router for the background script.
import { LOG_PREFIX, MESSAGE_ACTIONS } from "../shared/constants.js";
import { checkForUpdate } from "./updates.js";
import { analyzeImageWithWd14 } from "./comfyui.js";
import { getHubCatalogue, downloadHubPackage } from "./file-hub.js";

const EDITOR_PAGE = "pages/palette-editor.html";

function sendAnalysisProgress(tabId, analysisId, message) {
  if (!Number.isInteger(tabId) || typeof analysisId !== "string") return;
  chrome.tabs.sendMessage(tabId, { action: MESSAGE_ACTIONS.analysisProgress, analysisId, message }).catch((error) => {
    console.debug(`${LOG_PREFIX} Analysis progress could not be delivered.`, error);
  });
}

function openExtensionTab(path, sendResponse) {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) }, (tab) => {
    const error = chrome.runtime.lastError;
    sendResponse(error ? { success: false, error: error.message } : { success: true, tabId: tab.id });
  });
}

/** Resolves the editor URL for an "open … editor" action, or null if invalid. */
function getEditorPath(request) {
  switch (request.action) {
    case MESSAGE_ACTIONS.openSiteConfigEditor:
      return `${EDITOR_PAGE}?mode=site-configs`;
    case MESSAGE_ACTIONS.openAiBlacklistEditor:
      return `${EDITOR_PAGE}?mode=ai-blacklist`;
    case MESSAGE_ACTIONS.openPaletteEditor:
      if (typeof request.packId !== "string" || !request.packId) return null;
      return `${EDITOR_PAGE}?packId=${encodeURIComponent(request.packId)}`;
    default:
      return null;
  }
}

const EDITOR_ACTIONS = [MESSAGE_ACTIONS.openPaletteEditor, MESSAGE_ACTIONS.openSiteConfigEditor, MESSAGE_ACTIONS.openAiBlacklistEditor];

/** `chrome.runtime.onMessage` handler. Returns true when it responds async. */
export function handleMessage(request, sender, sendResponse) {
  if (request.action === MESSAGE_ACTIONS.checkUpdates) {
    checkForUpdate()
      .then((update) => sendResponse({ success: true, update }))
      .catch((error) => {
        console.error(`${LOG_PREFIX} Could not check for updates.`, error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === MESSAGE_ACTIONS.analyzeImage) {
    const tabId = sender.tab?.id;
    const reportProgress = (message) => sendAnalysisProgress(tabId, request.analysisId, message);
    analyzeImageWithWd14(request.imgUrl, request.threshold, reportProgress)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === MESSAGE_ACTIONS.fileHubCatalogue) {
    getHubCatalogue({ force: request.force === true })
      .then((catalogue) => sendResponse({ success: true, catalogue }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === MESSAGE_ACTIONS.fileHubDownload) {
    downloadHubPackage(request.packageId)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === MESSAGE_ACTIONS.openAboutPage) {
    openExtensionTab("pages/about.html", sendResponse);
    return true;
  }

  if (EDITOR_ACTIONS.includes(request.action)) {
    const editorPath = getEditorPath(request);
    if (!editorPath) {
      sendResponse({ success: false, error: "Invalid palette ID." });
      return false;
    }
    openExtensionTab(editorPath, sendResponse);
    return true;
  }

  return false;
}
