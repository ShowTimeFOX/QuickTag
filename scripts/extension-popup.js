// Toolbar popup: global visibility, ComfyUI connection status, update check.
import { LOG_PREFIX, STORAGE_KEYS, MESSAGE_ACTIONS, COMFYUI_BASE_URL } from "./shared/constants.js";
import { onLocalStorageChange } from "./shared/storage.js";

const COMFYUI_STATUS_URL = `${COMFYUI_BASE_URL}/system_stats`;
const COMFYUI_HOST = new URL(COMFYUI_BASE_URL).host;
const CONNECTION_TIMEOUT_MS = 3500;

const globalToggle = document.querySelector("#global-toggle");
const globalStatus = document.querySelector("#global-status");
const saveError = document.querySelector("#save-error");
const connectionStatus = document.querySelector("#connection-status");
const connectionIndicator = document.querySelector("#connection-indicator");
const connectionRefresh = document.querySelector("#connection-refresh");
const updateCard = document.querySelector("#update-card");
const updateVersion = document.querySelector("#update-version");
const updateIndicator = document.querySelector("#update-indicator");
const updateStatus = document.querySelector("#update-status");
const updateDownload = document.querySelector("#update-download");

let updateUrl = null;

// --- Global visibility ---

function showSaveError(message = "") {
  saveError.textContent = message;
  saveError.hidden = !message;
}

async function saveSettings(values) {
  showSaveError();
  try {
    await chrome.storage.local.set(values);
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not save popup settings.`, error);
    showSaveError(`Could not save settings: ${error.message}`);
    throw error;
  }
}

async function loadSettings() {
  showSaveError();
  const stored = await chrome.storage.local.get(STORAGE_KEYS.enabled);
  const storedValue = stored[STORAGE_KEYS.enabled];
  if (storedValue !== undefined && typeof storedValue !== "boolean") {
    console.error(`${LOG_PREFIX} Saved global visibility setting is invalid.`);
    showSaveError("Saved global visibility setting is invalid.");
    globalToggle.disabled = true;
    return;
  }
  const enabled = storedValue !== false;
  globalToggle.checked = enabled;
  globalToggle.disabled = false;
  globalStatus.textContent = enabled ? "QuickTag is visible across all pages." : "QuickTag is hidden across all pages.";
}

globalToggle.addEventListener("change", async () => {
  globalToggle.disabled = true;
  try {
    await saveSettings({ [STORAGE_KEYS.enabled]: globalToggle.checked });
    await loadSettings();
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not update global visibility.`, error);
    try {
      await loadSettings();
    } catch (loadError) {
      console.error(`${LOG_PREFIX} Could not restore global visibility.`, loadError);
    }
    showSaveError(`Could not update global visibility: ${error.message}`);
  }
});

// --- ComfyUI connection ---

async function checkComfyUI() {
  connectionRefresh.disabled = true;
  connectionStatus.textContent = "Checking connection…";
  connectionIndicator.dataset.state = "checking";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
  try {
    const response = await fetch(COMFYUI_STATUS_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`ComfyUI returned HTTP ${response.status}.`);
    connectionIndicator.dataset.state = "connected";
    connectionStatus.textContent = `Connected · ${COMFYUI_HOST}`;
  } catch (error) {
    connectionIndicator.dataset.state = "disconnected";
    connectionStatus.textContent = error.name === "AbortError" ? "No response from ComfyUI" : "Not connected · start ComfyUI";
  } finally {
    clearTimeout(timeout);
    connectionRefresh.disabled = false;
  }
}

connectionRefresh.addEventListener("click", checkComfyUI);

// --- Updates ---

function showUpdateCheckFailure(message) {
  updateStatus.textContent = message;
  updateDownload.textContent = "Check again";
  updateDownload.disabled = false;
}

function showUpdateResult(update) {
  updateUrl = update.url;
  updateVersion.textContent = `Current version · ${update.currentVersion}`;
  updateIndicator.hidden = !update.available;
  updateCard.dataset.available = String(update.available);
  if (update.available) {
    updateStatus.textContent = `Version ${update.latestVersion} is ready to download.${update.notes ? ` ${update.notes}` : ""}`;
    updateDownload.textContent = `Download update ${update.latestVersion}`;
  } else {
    updateStatus.textContent = `You’re up to date · latest version ${update.latestVersion}`;
    updateDownload.textContent = "Check for updates";
  }
  updateDownload.disabled = false;
}

function checkForUpdates() {
  updateDownload.disabled = true;
  updateDownload.textContent = "Checking for updates…";
  updateStatus.textContent = "Checking GitHub…";
  updateVersion.textContent = `Current version · ${chrome.runtime.getManifest().version}`;
  updateIndicator.hidden = true;
  updateCard.dataset.available = "false";

  chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.checkUpdates }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      console.error(`${LOG_PREFIX} Could not request an update check.`, runtimeError);
      showUpdateCheckFailure("Could not contact the update service.");
      return;
    }
    if (!response?.success) {
      showUpdateCheckFailure(response?.error || "Could not check for updates.");
      return;
    }
    showUpdateResult(response.update);
  });
}

updateDownload.addEventListener("click", () => {
  if (updateUrl && !updateDownload.disabled) {
    chrome.tabs.create({ url: updateUrl }, () => {
      if (chrome.runtime.lastError) {
        console.error(`${LOG_PREFIX} Could not open the update page.`, chrome.runtime.lastError);
        updateStatus.textContent = "Could not open the GitHub release page.";
      }
    });
    return;
  }
  checkForUpdates();
});

// --- Startup ---

checkForUpdates();

onLocalStorageChange((changes) => {
  if (!changes[STORAGE_KEYS.enabled]) return;
  loadSettings().catch((error) => {
    console.error(`${LOG_PREFIX} Could not refresh popup settings.`, error);
    showSaveError(`Could not load settings: ${error.message}`);
  });
});

loadSettings()
  .then(checkComfyUI)
  .catch((error) => {
    console.error(`${LOG_PREFIX} Could not load popup settings.`, error);
    showSaveError(`Could not load settings: ${error.message}`);
    connectionStatus.textContent = "Connection status unavailable";
  });
