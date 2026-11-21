// Configuration backup: export, validated import, and restore defaults.
// Functions throw user-facing errors; the settings panel shows them.
import {
  STORAGE_KEYS,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY_PREFIX,
  THEME_NAMES,
  HEX_COLOR_PATTERN,
  DOCK_EDGES,
  SCALE_RANGE,
  AI_THRESHOLD_RANGE,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from "../shared/constants.js";
import { isRecord, isStringArray, isValidPageLayout, isValidWindowPosition } from "../shared/validation.js";
import { isValidShortcut } from "../shared/shortcuts.js";
import { isValidFocusLayout } from "../shared/focus-layout.js";
import { isValidPalettePack, isValidPaletteGroups } from "../shared/palette.js";
import { isValidSiteConfigs } from "../shared/site-configs.js";
import { downloadJsonFile } from "./page.js";
import { isValidHubInstallRecord } from "../shared/file-hub.js";

function isInRange(value, { min, max }) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function isValidPaletteData(palettes) {
  if (isRecord(palettes?.packs)) {
    return (
      typeof palettes.activePackId === "string" &&
      (Object.keys(palettes.packs).length === 0 || isRecord(palettes.packs[palettes.activePackId])) &&
      Object.values(palettes.packs).every(isValidPalettePack)
    );
  }
  return isValidPaletteGroups(palettes?.folders);
}

// Each rule: [storage key, validator, error message]. Validators only run for
// keys present in the backup.
const VALIDATION_RULES = [
  [STORAGE_KEYS.aiBlacklist, isStringArray, "The AI blacklist in this backup is invalid."],
  [STORAGE_KEYS.siteConfigs, isValidSiteConfigs, "The site profiles in this backup are invalid."],
  [STORAGE_KEYS.builtinPaletteOverride, isValidPalettePack, "The built-in palette in this backup is invalid."],
  [STORAGE_KEYS.palettes, isValidPaletteData, "The palettes in this backup are invalid."],
  ...[STORAGE_KEYS.enabled, LEGACY_STORAGE_KEYS.docked, STORAGE_KEYS.ghostMode, STORAGE_KEYS.ghostHoldMode, STORAGE_KEYS.reducedEffects].map((key) => [
    key,
    (value) => typeof value === "boolean",
    `The ${key} setting in this backup is invalid.`,
  ]),
  [LEGACY_STORAGE_KEYS.domainMode, (value) => ["blacklist", "whitelist"].includes(value), "The domain access mode in this backup is invalid."],
  [LEGACY_STORAGE_KEYS.domains, isStringArray, "The domain list in this backup is invalid."],
  [LEGACY_STORAGE_KEYS.siteBlacklist, isStringArray, "The per-site blacklist in this backup is invalid."],
  [STORAGE_KEYS.theme, (value) => typeof value === "string" && THEME_NAMES.includes(value), "The selected theme in this backup is invalid."],
  [STORAGE_KEYS.customAccent, (value) => typeof value === "string" && HEX_COLOR_PATTERN.test(value), "The custom accent color in this backup is invalid."],
  [LEGACY_STORAGE_KEYS.dockPosition, (value) => DOCK_EDGES.includes(value), "The docking position in this backup is invalid."],
  [STORAGE_KEYS.scale, (value) => isInRange(value, SCALE_RANGE), "The window scale in this backup is invalid."],
  [STORAGE_KEYS.aiThreshold, (value) => isInRange(value, AI_THRESHOLD_RANGE), "The AI threshold in this backup is invalid."],
  [STORAGE_KEYS.ghostShortcut, isValidShortcut, "The ghost mode shortcut in this backup is invalid."],
  [
    STORAGE_KEYS.focusSettings,
    (settings) =>
      isRecord(settings) &&
      isValidShortcut(settings.toggleShortcut) &&
      isValidShortcut(settings.closeShortcut) &&
      typeof settings.strictCapture === "boolean",
    "The Focus Mode settings in this backup are invalid.",
  ],
  [STORAGE_KEYS.focusLayout, isValidFocusLayout, "The Focus Mode layout in this backup is invalid."],
  [STORAGE_KEYS.focusPrefs, isRecord, "The Focus Mode preferences in this backup are invalid."],
  [
    STORAGE_KEYS.hubPackages,
    (installs) => isRecord(installs) && Object.values(installs).every(isValidHubInstallRecord),
    "The installed File Hub packages in this backup are invalid.",
  ],
  [STORAGE_KEYS.windowPosition, isValidWindowPosition, "The window position in this backup is invalid."],
  [
    STORAGE_KEYS.windowSize,
    (size) => isRecord(size) && Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0,
    "The window size in this backup is invalid.",
  ],
];

export function validateConfigData(data) {
  if (!isRecord(data)) throw new Error("The backup data must be a JSON object.");
  if (Object.keys(data).some((key) => !key.startsWith(STORAGE_KEY_PREFIX))) {
    throw new Error("The backup contains unsupported storage keys.");
  }

  for (const [key, isValid, message] of VALIDATION_RULES) {
    if (data[key] !== undefined && !isValid(data[key])) throw new Error(message);
  }

  const layoutKeys = Object.keys(data).filter((key) => key.startsWith(STORAGE_KEYS.siteLayoutPrefix));
  if (!layoutKeys.every((key) => isValidPageLayout(data[key]))) {
    throw new Error("The per-site window layouts in this backup are invalid.");
  }
}

export async function exportConfiguration() {
  const data = await chrome.storage.local.get(null);
  const exportedAt = new Date().toISOString();
  downloadJsonFile(`quicktag-config-${exportedAt.replace(/[:.]/g, "-")}.json`, {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data,
  });
}

/** Parses and validates a backup file; returns the storage data it contains. */
export async function readBackupFile(file) {
  const backup = JSON.parse(await file.text());
  if (!isRecord(backup) || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    throw new Error("This is not a supported QuickTag configuration backup.");
  }
  validateConfigData(backup.data);
  return backup.data;
}

/** Replaces all extension storage, rolling back to the previous data on failure. */
export async function replaceConfiguration(data) {
  const previousData = await chrome.storage.local.get(null);
  try {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(data);
  } catch (error) {
    try {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(previousData);
    } catch (restoreError) {
      throw new Error(`Import failed (${error.message}), and restoring the previous configuration also failed (${restoreError.message}).`);
    }
    throw error;
  }
}

export function resetConfiguration() {
  return chrome.storage.local.clear();
}
