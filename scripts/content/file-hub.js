// File Hub install state for the Assets tab (no DOM; see ui/assets-panel.js).
//
// Network requests go through the background script (background/file-hub.js),
// which also verifies and validates package files. This module records which
// hub packages are installed (`lazymod_hub_packages`) and commits packs into
// the palette state.
import { MESSAGE_ACTIONS, STORAGE_KEYS } from "../shared/constants.js";
import { loadData } from "../shared/storage.js";
import { isRecord, isSafeKey } from "../shared/validation.js";
import { compareVersions, isInstallableHubPackage, isValidHubInstallRecord } from "../shared/file-hub.js";
import { state } from "./state.js";
import { emit, EVENTS } from "./events.js";
import { installPalettePack } from "./palettes.js";

/** Pack ids of hub installs; ids from the catalogue are [A-Za-z0-9_-]. */
const hubPackId = (packageId) => `hub-${packageId}`;

async function sendMessage(message) {
  let response;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (error) {
    throw new Error(`The extension background is not available. Reload the page and try again. (${error.message})`);
  }
  if (!response?.success) {
    throw Object.assign(new Error(response?.error || "Unknown error."), { permission: response?.permission === true, origins: response?.origins || [] });
  }
  return response;
}

export async function fetchHubCatalogue({ force = false } = {}) {
  return (await sendMessage({ action: MESSAGE_ACTIONS.fileHubCatalogue, force })).catalogue;
}

/**
 * Downloads and validates a package (same checks as installing) without
 * saving anything; resolves to `{ pack, verified }` for a contents preview.
 */
export async function previewHubPackage(item) {
  const { pack, verified } = await sendMessage({ action: MESSAGE_ACTIONS.fileHubDownload, packageId: item.id, purpose: "preview" });
  return { pack, verified };
}

/** Reopens the permission page for a package (from an "Allow access" click). */
export async function requestHubPermission(item, purpose) {
  return sendMessage({ action: MESSAGE_ACTIONS.fileHubRequestPermission, packageId: item.id, purpose });
}

/** Saved install records, without malformed entries. */
export async function loadHubInstalls() {
  const saved = await loadData(STORAGE_KEYS.hubPackages, {});
  if (!isRecord(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter(([id, record]) => isSafeKey(id) && isValidHubInstallRecord(record)));
}

/** Deletes the install records of `packId`; resolves to the removed records (for undo). */
export async function removeHubRecordsForPack(packId) {
  const installs = await loadHubInstalls();
  const removed = Object.fromEntries(Object.entries(installs).filter(([, record]) => record.packId === packId));
  if (!Object.keys(removed).length) return removed;
  const kept = Object.fromEntries(Object.entries(installs).filter(([, record]) => record.packId !== packId));
  await chrome.storage.local.set({ [STORAGE_KEYS.hubPackages]: kept });
  return removed;
}

export async function restoreHubRecords(records) {
  if (!records || !Object.keys(records).length) return;
  const installs = await loadHubInstalls();
  await chrome.storage.local.set({ [STORAGE_KEYS.hubPackages]: { ...installs, ...records } });
}

/**
 * `available`, `installed`, `update` (a newer version is on the hub), or
 * `unsupported`. A record whose pack was deleted counts as not installed.
 */
export function getHubInstallStatus(item, installs) {
  const record = installs[item.id];
  const installed = Boolean(record && state.paletteData?.packs?.[record.packId]);
  if (installed) {
    return { status: compareVersions(item.version, record.version) > 0 ? "update" : "installed", installedVersion: record.version };
  }
  return { status: isInstallableHubPackage(item) ? "available" : "unsupported", installedVersion: "" };
}

/**
 * Downloads a package (verified and validated by the background script),
 * adds or replaces its tag pack, and records the install. Returns
 * `{ packName, verified }`. Throws user-facing errors.
 */
export async function installHubPackage(item) {
  const { pack, item: verifiedItem, verified } = await sendMessage({ action: MESSAGE_ACTIONS.fileHubDownload, packageId: item.id, purpose: "install" });
  const installs = await loadHubInstalls();
  const previous = installs[item.id];
  const packId = previous && state.paletteData.packs[previous.packId] ? previous.packId : hubPackId(item.id);
  await installPalettePack(packId, pack);

  // Drop records whose packs were deleted since.
  const nextInstalls = Object.fromEntries(Object.entries(installs).filter(([, record]) => state.paletteData.packs[record.packId]));
  nextInstalls[item.id] = {
    packId,
    version: verifiedItem.version,
    sha256: verifiedItem.sha256,
    name: verifiedItem.name,
    installedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.hubPackages]: nextInstalls });
  emit(EVENTS.paletteChanged, { source: "assets" });
  return { packName: state.paletteData.packs[packId].name, verified };
}
