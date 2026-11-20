// Thin wrappers around chrome.storage.local, shared by every context.
import { LOG_PREFIX } from "./constants.js";

/** Reads one key, returning `fallback` when it is missing or storage fails. */
export async function loadData(key, fallback) {
  try {
    const result = await chrome.storage.local.get([key]);
    return result[key] !== undefined ? result[key] : fallback;
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not read ${key} from storage.`, error);
    return fallback;
  }
}

/** Writes one key. Failures are logged, not thrown (fire-and-forget saves). */
export async function saveData(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not save ${key} to storage.`, error);
  }
}

/** Calls `callback(changes)` for every change in the `local` storage area. */
export function onLocalStorageChange(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") callback(changes);
  });
}
