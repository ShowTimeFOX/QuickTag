// Site profile and AI blacklist state for the current page.
import { LOG_PREFIX, STORAGE_KEYS, DEFAULT_AI_BLACKLIST, FALLBACK_SITE_KEY, createDefaultSiteConfigs } from "../shared/constants.js";
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

function profileMatchesUrl(configs, key, url) {
  const config = configs[key];
  if (!config || key === FALLBACK_SITE_KEY) return false;
  try {
    return new RegExp(config.urlPattern || key, "i").test(url);
  } catch {
    return false;
  }
}

/**
 * The profile to use for `configs` on this page: the current one while it
 * still exists and matches the URL (so a profile the user just added or
 * edited stays active through storage echoes and the page watcher), otherwise
 * the first matching profile.
 */
function resolveActiveSiteKey(configs) {
  const url = window.location.href;
  return profileMatchesUrl(configs, state.activeSiteKey, url) ? state.activeSiteKey : detectSiteKey(configs, url);
}

/** Re-detects the profile for the current URL; returns true if it changed. */
export function refreshActiveSiteKey() {
  const detected = resolveActiveSiteKey(state.siteConfigs);
  if (detected === state.activeSiteKey) return false;
  state.activeSiteKey = detected;
  return true;
}

export async function saveSiteConfigs(siteConfigs) {
  state.siteConfigs = siteConfigs;
  await chrome.storage.local.set({ [STORAGE_KEYS.siteConfigs]: siteConfigs });
  emit(EVENTS.siteProfilesChanged);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/**
 * Creates (if needed) and activates the profile for this site: every page on
 * the current host, including its port (e.g. "localhost:8080"). A new profile
 * starts from the ".*" selectors, which were working on this page so far. It
 * is moved to the front so it wins over broader patterns on the next load.
 */
export function addProfileForCurrentPage() {
  const key = window.location.host || window.location.origin;
  const fallback = getFallbackSiteConfig() || {};
  const profile = state.siteConfigs[key] || {
    urlPattern: `^[a-z][a-z0-9+.-]*://${escapeRegExp(key)}(?:[/?#]|$)`,
    tagInputSelector: fallback.tagInputSelector || "",
    imgSelector: fallback.imgSelector || "",
    linkSelector: fallback.linkSelector || "",
    isXPath: false,
  };
  const rest = Object.fromEntries(Object.entries(state.siteConfigs).filter(([profileKey]) => profileKey !== key));
  state.activeSiteKey = key;
  return saveSiteConfigs({ [key]: profile, ...rest });
}

/**
 * Saves fields (selectors, tag separator) into the current page's profile.
 * On the ".*" fallback, this site's profile is created first, so a change
 * made for one site never changes every site.
 */
export async function saveActiveProfileFields(fields) {
  if (state.activeSiteKey === FALLBACK_SITE_KEY || !state.siteConfigs[state.activeSiteKey]) await addProfileForCurrentPage();
  const key = state.activeSiteKey;
  await saveSiteConfigs({ ...state.siteConfigs, [key]: { ...state.siteConfigs[key], ...fields } });
  return key;
}

/** Keeps profiles and blacklist in sync with edits made in other tabs/pages. */
export function watchSiteProfileStorage() {
  onLocalStorageChange((changes) => {
    const updatedConfigs = changes[STORAGE_KEYS.siteConfigs]?.newValue;
    if (updatedConfigs) {
      state.siteConfigs = updatedConfigs;
      state.activeSiteKey = resolveActiveSiteKey(updatedConfigs);
      emit(EVENTS.siteProfilesChanged);
    }
    const updatedBlacklist = changes[STORAGE_KEYS.aiBlacklist]?.newValue;
    if (Array.isArray(updatedBlacklist)) {
      state.tagBlacklist = normalizeTagList(updatedBlacklist);
      emit(EVENTS.blacklistChanged);
    }
  });
}
