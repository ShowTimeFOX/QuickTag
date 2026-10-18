"use strict";

const STORAGE_KEYS = {
  enabled: "lazymod_enabled",
  mode: "lazymod_domain_mode",
  domains: "lazymod_domains",
};
const COMFYUI_URL = "http://127.0.0.1:8188/system_stats";
const enabledToggle = document.querySelector("#enabled-toggle");
const enabledStatus = document.querySelector("#enabled-status");
const domainMode = document.querySelector("#domain-mode");
const modeHint = document.querySelector("#mode-hint");
const domainForm = document.querySelector("#domain-form");
const domainInput = document.querySelector("#domain-input");
const domainList = document.querySelector("#domain-list");
const emptyList = document.querySelector("#empty-list");
const domainError = document.querySelector("#domain-error");
const saveError = document.querySelector("#save-error");
const connectionStatus = document.querySelector("#connection-status");
const connectionIndicator = document.querySelector("#connection-indicator");
const connectionRefresh = document.querySelector("#connection-refresh");
const updateCard = document.querySelector("#update-card");
const updateVersion = document.querySelector("#update-version");
const updateIndicator = document.querySelector("#update-indicator");
const updateStatus = document.querySelector("#update-status");
const updateDownload = document.querySelector("#update-download");

let domains = [];
let updateUrl = null;

function showSaveError(message = "") {
  saveError.textContent = message;
  saveError.hidden = !message;
}

function showDomainError(message = "") {
  domainError.textContent = message;
  domainError.hidden = !message;
}

function normalizeDomain(input) {
  const value = input.trim();
  if (!value) throw new Error("Enter a domain name.");
  let parsed;
  try {
    parsed = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("Enter a valid domain, such as example.com.");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Enter a domain only, without a port, path, or query.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || !hostname.includes(".")) {
    throw new Error("Enter a public domain name, such as example.com.");
  }
  return hostname;
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

function renderDomains() {
  domainList.replaceChildren();
  emptyList.hidden = domains.length > 0;
  emptyList.textContent = domains.length
    ? ""
    : domainMode.value === "whitelist"
      ? "No allowed domains yet. The tagger is blocked on every site."
      : "No blocked domains. The tagger is allowed on every site.";

  for (const domain of domains) {
    const item = document.createElement("li");
    item.className = "domain-item";
    const name = document.createElement("span");
    name.textContent = domain;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-domain";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${domain}`);
    remove.title = `Remove ${domain}`;
    remove.addEventListener("click", () => {
      updateDomains(domains.filter((entry) => entry !== domain)).catch(() => {});
    });
    item.append(name, remove);
    domainList.append(item);
  }
}

function updateModeDescription() {
  const whitelist = domainMode.value === "whitelist";
  modeHint.textContent = whitelist
    ? "Only listed domains and their subdomains can show the tagger."
    : "Listed domains and their subdomains will be blocked.";
  renderDomains();
}

async function updateDomains(nextDomains) {
  const updatedDomains = [...new Set(nextDomains)].sort((left, right) => left.localeCompare(right));
  await saveSettings({ [STORAGE_KEYS.domains]: updatedDomains });
  domains = updatedDomains;
  renderDomains();
}

async function loadSettings() {
  showSaveError();
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.enabled,
    STORAGE_KEYS.mode,
    STORAGE_KEYS.domains,
  ]);

  enabledToggle.checked = stored[STORAGE_KEYS.enabled] !== false;
  enabledStatus.textContent = enabledToggle.checked ? "Enabled globally" : "Disabled globally";
  const storedMode = stored[STORAGE_KEYS.mode];
  if (storedMode !== undefined && !["blacklist", "whitelist"].includes(storedMode)) {
    console.error("[QuickTag] Saved domain access mode is invalid; using blacklist.");
  }
  domainMode.value = ["blacklist", "whitelist"].includes(storedMode)
    ? storedMode
    : "blacklist";
  const savedDomains = stored[STORAGE_KEYS.domains] ?? [];
  if (!Array.isArray(savedDomains) || !savedDomains.every((domain) => typeof domain === "string")) {
    console.error("[QuickTag] Saved domain rules are invalid.");
    domains = [];
    showSaveError("Saved domain rules are invalid. Correct the list before using it.");
  } else {
    domains = [...new Set(savedDomains.map((domain) => domain.toLowerCase()))].sort(
      (left, right) => left.localeCompare(right),
    );
  }
  updateModeDescription();
}

enabledToggle.addEventListener("change", async () => {
  enabledStatus.textContent = enabledToggle.checked ? "Enabled globally" : "Disabled globally";
  try {
    await saveSettings({ [STORAGE_KEYS.enabled]: enabledToggle.checked });
  } catch {
    enabledToggle.checked = !enabledToggle.checked;
    enabledStatus.textContent = enabledToggle.checked ? "Enabled globally" : "Disabled globally";
  }
});

domainMode.addEventListener("change", async () => {
  updateModeDescription();
  try {
    await saveSettings({ [STORAGE_KEYS.mode]: domainMode.value });
  } catch {
    loadSettings().catch((error) => {
      console.error("[QuickTag] Could not restore domain mode after a save failure.", error);
      showSaveError(`Could not reload settings: ${error.message}`);
    });
  }
});

domainForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showDomainError();
  let domain;
  try {
    domain = normalizeDomain(domainInput.value);
  } catch (error) {
    showDomainError(error.message);
    return;
  }
  if (domains.includes(domain)) {
    showDomainError(`${domain} is already in the list.`);
    return;
  }
  try {
    await updateDomains([...domains, domain]);
    domainInput.value = "";
  } catch {}
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
    changes[STORAGE_KEYS.domains]
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
