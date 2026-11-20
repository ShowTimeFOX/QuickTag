// Site profile and AI blacklist state for the current page.
import { LOG_PREFIX, STORAGE_KEYS, DEFAULT_AI_BLACKLIST, FALLBACK_SITE_KEY, NEW_SITE_PROFILE_SELECTORS, createDefaultSiteConfigs } from "../shared/constants.js";
import { loadData, onLocalStorageChange } from "../shared/storage.js";
import { detectSiteKey } from "../shared/site-configs.js";
import { normalizeTagList } from "../shared/tags.js";
import { state } from "./state.js";
import { emit, EVENTS } from "./events.js";

export async function loadSiteProfileState() {
  let blacklist = await loadData(STORAGE_KEYS.aiBlacklist, DEFAULT_AI_BLACKLIST);
  if (!Array.isArray(blacklist)) {
    console.error(`${LOG_PREFIX} Saved AI blacklist is not an array; using the built-in list.`);
    blacklist = DEFAULT_AI_BLACKLIST;
  }
  state.tagBlacklist = normalizeTagList(blacklist);
  state.siteConfigs = await loadData(STORAGE_KEYS.siteConfigs, createDefaultSiteConfigs());
  state.activeSiteKey = detectSiteKey(state.siteConfigs, window.location.href);
}

/** The profile for the active site, falling back to the ".*" profile. */
export function getActiveSiteConfig() {
  return state.siteConfigs[state.activeSiteKey] || state.siteConfigs[FALLBACK_SITE_KEY];
}

export function getFallbackSiteConfig() {
  return state.siteConfigs[FALLBACK_SITE_KEY];
}

/** Re-detects the profile for the current URL; returns true if it changed. */
export function refreshActiveSiteKey() {
  const detected = detectSiteKey(state.siteConfigs, window.location.href);
  if (detected === state.activeSiteKey) return false;
  state.activeSiteKey = detected;
  return true;
}

export async function saveSiteConfigs(siteConfigs) {
  state.siteConfigs = siteConfigs;
  await chrome.storage.local.set({ [STORAGE_KEYS.siteConfigs]: siteConfigs });
  emit(EVENTS.siteProfilesChanged);
}

/** Creates (if needed) and activates a profile matching the current host+path. */
export function addProfileForCurrentPage() {
  const host = window.location.hostname;
  const safePath = window.location.pathname.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  const patternKey = `${host}${safePath}`;
  if (!state.siteConfigs[patternKey]) {
    state.siteConfigs[patternKey] = {
      urlPattern: patternKey,
      ...NEW_SITE_PROFILE_SELECTORS,
      isXPath: false,
    };
  }
  state.activeSiteKey = patternKey;
  return saveSiteConfigs(state.siteConfigs);
}

/** Keeps profiles and blacklist in sync with edits made in other tabs/pages. */
export function watchSiteProfileStorage() {
  onLocalStorageChange((changes) => {
    const updatedConfigs = changes[STORAGE_KEYS.siteConfigs]?.newValue;
    if (updatedConfigs) {
      state.siteConfigs = updatedConfigs;
      state.activeSiteKey = detectSiteKey(updatedConfigs, window.location.href);
      emit(EVENTS.siteProfilesChanged);
    }
    const updatedBlacklist = changes[STORAGE_KEYS.aiBlacklist]?.newValue;
    if (Array.isArray(updatedBlacklist)) {
      state.tagBlacklist = normalizeTagList(updatedBlacklist);
      emit(EVENTS.blacklistChanged);
    }
  });
}
