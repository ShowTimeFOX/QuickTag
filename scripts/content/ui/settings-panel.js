// Settings view: active site profile summary, AI blacklist summary, editor
// shortcuts, and configuration backup / restore.
import { LOG_PREFIX, MESSAGE_ACTIONS } from "../../shared/constants.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { requestExtensionPage } from "../messaging.js";
import { addProfileForCurrentPage, getActiveSiteConfig, saveActiveProfileFields } from "../site-profiles.js";
import { DEFAULT_TAG_SEPARATOR, normalizeTagSeparator } from "../../shared/tags.js";
import { exportConfiguration, readBackupFile, replaceConfiguration, resetConfiguration } from "../config-backup.js";
import { $, shell } from "./shell.js";
import { setConfigStatus } from "./status.js";

const BLACKLIST_PREVIEW_COUNT = 6;
const RELOAD_DELAY_MS = 600;

export function renderActiveSiteBadge() {
  const badge = $("#lm-active-badge");
  badge.textContent = state.activeSiteKey;
  // The badge truncates long profile keys; the full key is in the tooltip.
  badge.title = `Active site profile: ${state.activeSiteKey}`;
}

export function renderSettingsUI() {
  const config = getActiveSiteConfig();
  $("#lm-settings-profile").textContent = state.activeSiteKey;
  $("#lm-settings-pattern").textContent = config.urlPattern || state.activeSiteKey;
  [
    ["#lm-settings-tag-selector", config.tagInputSelector],
    ["#lm-settings-img-selector", config.imgSelector],
    ["#lm-settings-link-selector", config.linkSelector],
  ].forEach(([selector, value]) => {
    const field = $(selector);
    field.textContent = value || "Not configured";
    field.title = value || "Not configured";
  });
  // Don't overwrite what the user is typing.
  const separatorInput = $("#lm-tag-separator");
  if (separatorInput !== shell.root.activeElement) {
    const separator = normalizeTagSeparator(config.tagSeparator);
    separatorInput.value = separator === DEFAULT_TAG_SEPARATOR ? "" : separator;
  }

  const blacklist = state.tagBlacklist;
  $("#lm-blacklist-count").textContent = `${blacklist.length} ${blacklist.length === 1 ? "tag" : "tags"} excluded`;
  const preview = blacklist.slice(0, BLACKLIST_PREVIEW_COUNT).join(", ");
  const remainingCount = blacklist.length - BLACKLIST_PREVIEW_COUNT;
  const previewElement = $("#lm-blacklist-preview");
  previewElement.textContent = preview ? `${preview}${remainingCount > 0 ? `, +${remainingCount} more` : ""}` : "No excluded tags";
  previewElement.title = blacklist.join(", ") || "No excluded tags";
}

function reloadPageSoon(message) {
  setConfigStatus(message, "success");
  setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
}

function initConfigBackup() {
  const configFileInput = $("#lm-config-file");

  $("#lm-export-config").onclick = async () => {
    try {
      await exportConfiguration();
      setConfigStatus("Configuration exported successfully.", "success");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not export the configuration.`, error);
      setConfigStatus(`Could not export configuration: ${error.message}`, "error");
    }
  };

  $("#lm-import-config").onclick = () => configFileInput.click();
  configFileInput.onchange = async () => {
    const file = configFileInput.files?.[0];
    if (!file) return;
    try {
      const data = await readBackupFile(file);
      if (!confirm("Import this configuration? It will replace all current QuickTag settings, palettes, and profiles. The current page will reload.")) {
        return;
      }
      await replaceConfiguration(data);
      reloadPageSoon("Configuration imported. Reloading this page…");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not import the configuration.`, error);
      setConfigStatus(`Could not import configuration: ${error.message}`, "error");
    } finally {
      configFileInput.value = "";
    }
  };

  $("#lm-reset-config").onclick = async () => {
    if (
      !confirm(
        "Restore QuickTag to its original state? This will permanently delete all saved QuickTag palettes, profiles, and settings. The current page will reload.",
      )
    ) {
      return;
    }
    try {
      await resetConfiguration();
      reloadPageSoon("QuickTag defaults restored. Reloading this page…");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not restore the default configuration.`, error);
      setConfigStatus(`Could not restore defaults: ${error.message}`, "error");
    }
  };
}

/** Saves the tag separator into this site's profile (a blank value means a space). */
async function saveTagSeparator() {
  const input = $("#lm-tag-separator");
  const value = input.value;
  const tagSeparator = value.trim() ? value : undefined;
  if (tagSeparator === getActiveSiteConfig().tagSeparator) return;
  try {
    await saveActiveProfileFields({ tagSeparator });
    setConfigStatus(tagSeparator ? `Tag separator "${tagSeparator}" saved for ${state.activeSiteKey}.` : `Tags are separated by spaces on ${state.activeSiteKey}.`, "success");
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not save the tag separator.`, error);
    setConfigStatus(`Could not save the tag separator: ${error.message}`, "error");
  }
}

export function initSettingsPanel() {
  $("#lm-add-current-site").onclick = () => {
    const saving = addProfileForCurrentPage();
    renderActiveSiteBadge();
    renderSettingsUI();
    saving.catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the site profile.`, error);
      alert(`Could not save the site profile: ${error.message}`);
    });
  };
  // Saved when the field is left or Enter is pressed (not on every keystroke).
  const separatorInput = $("#lm-tag-separator");
  separatorInput.addEventListener("change", saveTagSeparator);
  separatorInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") separatorInput.blur();
  });

  $("#lm-edit-site-configs").onclick = () => {
    requestExtensionPage({ action: MESSAGE_ACTIONS.openSiteConfigEditor }, "Could not open settings editor");
  };
  $("#lm-edit-blacklist").onclick = () => {
    requestExtensionPage({ action: MESSAGE_ACTIONS.openAiBlacklistEditor }, "Could not open AI blacklist editor");
  };

  initConfigBackup();

  on(EVENTS.siteProfilesChanged, () => {
    renderActiveSiteBadge();
    renderSettingsUI();
  });
  on(EVENTS.blacklistChanged, renderSettingsUI);
}
