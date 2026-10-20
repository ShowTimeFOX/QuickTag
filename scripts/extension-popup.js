"use strict";

const STORAGE_KEYS = {
  enabled: "lazymod_enabled",
};
const COMFYUI_URL = "http://127.0.0.1:8188/system_stats";
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

function showSaveError(message = "") {
  saveError.textContent = message;
  saveError.hidden = !message;
}

async function saveSettings(values) {
  showSaveError();
  try {
    await chrome.storage.local.set(values);
  } catch (error) {
    console.error("[QuickTag] Could not save popup settings.", error);
    showSaveError(`Could not save settings: ${error.message}`);
    throw error;
  }
}

async function loadSettings() {
  showSaveError();
  const stored = await chrome.storage.local.get(STORAGE_KEYS.enabled);
  const enabled = stored[STORAGE_KEYS.enabled] !== false;
  if (stored[STORAGE_KEYS.enabled] !== undefined && typeof stored[STORAGE_KEYS.enabled] !== "boolean") {
    console.error("[QuickTag] Saved global visibility setting is invalid.");
    showSaveError("Saved global visibility setting is invalid.");
    globalToggle.disabled = true;
    return;
  }
  globalToggle.checked = enabled;
  globalToggle.disabled = false;
  globalStatus.textContent = enabled
    ? "QuickTag is visible across all pages."
    : "QuickTag is hidden across all pages.";
}

globalToggle.addEventListener("change", async () => {
  globalToggle.disabled = true;
  try {
    await saveSettings({ [STORAGE_KEYS.enabled]: globalToggle.checked });
    await loadSettings();
  } catch (error) {
    console.error("[QuickTag] Could not update global visibility.", error);
    try {
      await loadSettings();
    } catch (loadError) {
      console.error("[QuickTag] Could not restore global visibility.", loadError);
    }
    showSaveError(`Could not update global visibility: ${error.message}`);
  }
});

async function checkComfyUI() {
  connectionRefresh.disabled = true;
  connectionStatus.textContent = "Checking connection…";
  connectionIndicator.dataset.state = "checking";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(COMFYUI_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`ComfyUI returned HTTP ${response.status}.`);
    }
    connectionIndicator.dataset.state = "connected";
    connectionStatus.textContent = "Connected · 127.0.0.1:8188";
  } catch (error) {
    connectionIndicator.dataset.state = "disconnected";
    connectionStatus.textContent = error.name === "AbortError"
      ? "No response from ComfyUI"
      : "Not connected · start ComfyUI";
  } finally {
    clearTimeout(timeout);
    connectionRefresh.disabled = false;
  }
}

connectionRefresh.addEventListener("click", checkComfyUI);

function checkForUpdates() {
  updateDownload.disabled = true;
  updateDownload.textContent = "Checking for updates…";
  updateStatus.textContent = "Checking GitHub…";
  updateVersion.textContent = `Current version · ${chrome.runtime.getManifest().version}`;
  updateIndicator.hidden = true;
  updateCard.dataset.available = "false";

  chrome.runtime.sendMessage({ action: "check_updates" }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      updateStatus.textContent = "Could not contact the update service.";
      updateDownload.textContent = "Check again";
      updateDownload.disabled = false;
      console.error("[QuickTag] Could not request an update check.", runtimeError);
      return;
    }
    if (!response?.success) {
      updateStatus.textContent = response?.error || "Could not check for updates.";
      updateDownload.textContent = "Check again";
      updateDownload.disabled = false;
      return;
    }

    const { update } = response;
    updateUrl = update.url;
    updateVersion.textContent = `Current version · ${update.currentVersion}`;
    updateIndicator.hidden = !update.available;
    updateCard.dataset.available = String(update.available);
    if (update.available) {
      updateStatus.textContent = `Version ${update.latestVersion} is ready to download.${update.notes ? ` ${update.notes}` : ""}`;
      updateDownload.textContent = `Download update ${update.latestVersion}`;
      updateDownload.disabled = false;
    } else {
      updateStatus.textContent = `You’re up to date · latest version ${update.latestVersion}`;
      updateDownload.textContent = "Check for updates";
      updateDownload.disabled = false;
    }
  });
}

updateDownload.addEventListener("click", () => {
  if (updateUrl && !updateDownload.disabled) {
    chrome.tabs.create({ url: updateUrl }, () => {
      if (chrome.runtime.lastError) {
        console.error("[QuickTag] Could not open the update page.", chrome.runtime.lastError);
        updateStatus.textContent = "Could not open the GitHub release page.";
      }
    });
    return;
  }
  checkForUpdates();
});

checkForUpdates();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEYS.enabled]) {
    loadSettings().catch((error) => {
      console.error("[QuickTag] Could not refresh popup settings.", error);
      showSaveError(`Could not load settings: ${error.message}`);
    });
  }
});

loadSettings()
  .then(checkComfyUI)
  .catch((error) => {
    console.error("[QuickTag] Could not load popup settings.", error);
    showSaveError(`Could not load settings: ${error.message}`);
    connectionStatus.textContent = "Connection status unavailable";
  });
