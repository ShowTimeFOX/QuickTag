"use strict";

const STORAGE_KEYS = {
  enabled: "lazymod_enabled",
  mode: "lazymod_domain_mode",
  domains: "lazymod_domains",
  siteBlacklist: "lazymod_site_blacklist",
};
const COMFYUI_URL = "http://127.0.0.1:8188/system_stats";
const siteToggle = document.querySelector("#site-toggle");
const siteHost = document.querySelector("#site-host");
const siteStatus = document.querySelector("#site-status");
const saveError = document.querySelector("#save-error");
const connectionStatus = document.querySelector("#connection-status");
const connectionIndicator = document.querySelector("#connection-indicator");
const connectionRefresh = document.querySelector("#connection-refresh");
const updateCard = document.querySelector("#update-card");
const updateVersion = document.querySelector("#update-version");
const updateIndicator = document.querySelector("#update-indicator");
const updateStatus = document.querySelector("#update-status");
const updateDownload = document.querySelector("#update-download");

let currentHostname = null;
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
  const [tabs, stored] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get([
      STORAGE_KEYS.enabled,
      STORAGE_KEYS.mode,
      STORAGE_KEYS.domains,
      STORAGE_KEYS.siteBlacklist,
    ]),
  ]);
  const activeTab = tabs[0];
  currentHostname = null;
  if (activeTab?.url) {
    try {
      const activeUrl = new URL(activeTab.url);
      if (["http:", "https:"].includes(activeUrl.protocol)) {
        currentHostname = activeUrl.hostname.toLowerCase();
      }
    } catch {
      currentHostname = null;
    }
  }

  if (!currentHostname) {
    siteHost.textContent = "Unavailable on this page";
    siteStatus.textContent = "Open a website to manage its override.";
    siteToggle.checked = false;
    siteToggle.disabled = true;
    return;
  }

  siteHost.textContent = currentHostname;
  const storedMode = stored[STORAGE_KEYS.mode];
  if (storedMode !== undefined && !["blacklist", "whitelist"].includes(storedMode)) {
    console.error("[QuickTag] Saved domain access mode is invalid; using blacklist.");
  }
  const savedDomains = stored[STORAGE_KEYS.domains] ?? [];
  const siteBlacklist = stored[STORAGE_KEYS.siteBlacklist] ?? [];
  if (
    !Array.isArray(savedDomains) ||
    !savedDomains.every((domain) => typeof domain === "string") ||
    !Array.isArray(siteBlacklist) ||
    !siteBlacklist.every((domain) => typeof domain === "string")
  ) {
    console.error("[QuickTag] Saved site access rules are invalid.");
    showSaveError("Saved site access rules are invalid.");
    siteToggle.checked = false;
    siteToggle.disabled = true;
    return;
  }

  const enabled = stored[STORAGE_KEYS.enabled] !== false;
  const mode = storedMode === "whitelist" ? "whitelist" : "blacklist";
  const normalizedDomains = savedDomains.map((domain) => domain.toLowerCase());
  const normalizedSiteBlacklist = siteBlacklist.map((domain) => domain.toLowerCase());
  const matchesSite = (domain) => {
    const normalizedDomain = domain.toLowerCase();
    return currentHostname === normalizedDomain ||
      currentHostname.endsWith(`.${normalizedDomain}`);
  };
  const blockedByExistingRules = mode === "whitelist"
    ? !normalizedDomains.some(matchesSite)
    : normalizedDomains.some(matchesSite);
  const blockedByOverride = normalizedSiteBlacklist.some(matchesSite);

  siteToggle.checked = enabled && !blockedByExistingRules && !blockedByOverride;
  siteToggle.disabled = !enabled || blockedByExistingRules;
  if (!enabled) {
    siteStatus.textContent = "QuickTag is disabled globally.";
  } else if (blockedByExistingRules) {
    siteStatus.textContent = "Blocked by existing access rules.";
  } else if (blockedByOverride) {
    siteStatus.textContent = "Disabled on this site.";
  } else {
    siteStatus.textContent = "Enabled on this site.";
  }
}

siteToggle.addEventListener("change", async () => {
  if (!currentHostname) return;
  siteToggle.disabled = true;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.siteBlacklist);
    const siteBlacklist = stored[STORAGE_KEYS.siteBlacklist] ?? [];
    if (
      !Array.isArray(siteBlacklist) ||
      !siteBlacklist.every((domain) => typeof domain === "string")
    ) {
      throw new Error("Saved per-site overrides are invalid.");
    }
    const nextBlacklist = siteToggle.checked
      ? siteBlacklist.filter((domain) => domain !== currentHostname)
      : [...new Set([...siteBlacklist, currentHostname])].sort((left, right) =>
          left.localeCompare(right),
        );
    await saveSettings({ [STORAGE_KEYS.siteBlacklist]: nextBlacklist });
    await loadSettings();
  } catch (error) {
    console.error("[QuickTag] Could not update the current site's override.", error);
    try {
      await loadSettings();
    } catch (loadError) {
      console.error("[QuickTag] Could not restore the current site's override.", loadError);
    }
    showSaveError(`Could not update this site: ${error.message}`);
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
  if (areaName !== "local") return;
  if (
    changes[STORAGE_KEYS.enabled] ||
    changes[STORAGE_KEYS.mode] ||
    changes[STORAGE_KEYS.domains] ||
    changes[STORAGE_KEYS.siteBlacklist]
  ) {
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
