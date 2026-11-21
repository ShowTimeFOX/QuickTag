// File Hub (Assets tab) model: catalogue normalization, search and sort,
// version comparison, and validation of downloaded tag packs.
// Pure functions plus Web Crypto; used by the background script (downloads)
// and the content script (Assets panel). No DOM access.
import { FILE_HUB, FILE_HUB_BASE_URL } from "./constants.js";
import { isRecord, isSafeKey, hasUnsafeKeys } from "./validation.js";
import { isValidPaletteGroups, normalizePalettePack } from "./palette.js";

/** File types QuickTag can install. Other packages are listed as unsupported. */
export const HUB_INSTALLABLE_TYPES = Object.freeze(["json"]);

export const HUB_SORT_MODES = Object.freeze({
  updated: "Recently updated",
  newest: "Newest",
  score: "Top rated",
  downloads: "Most downloaded",
  name: "Name (A–Z)",
});

const PACKAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_PACKAGES = 2000;
const MAX_TAGS_PER_PACKAGE = 20;

// Limits for an installed tag pack (a pack larger than this is not a
// palette anyone can use in the tagger).
const PACK_LIMITS = Object.freeze({ groups: 200, categoriesPerGroup: 200, tags: 50000, tagLength: 200, nameLength: 200 });

function text(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function time(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isLoopback(url) {
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

/**
 * Download URLs must be https. Plain http is accepted only on loopback, and
 * only when the hub itself is on loopback (the browser tests' mock hub).
 */
export function isAllowedHubUrl(value, hubBaseUrl = FILE_HUB_BASE_URL) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && isLoopback(url) && isLoopback(new URL(hubBaseUrl));
}

/** One catalogue entry with known fields only and safe types, or null. */
export function normalizeHubPackage(raw, hubBaseUrl = FILE_HUB_BASE_URL) {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!PACKAGE_ID_PATTERN.test(id) || !isSafeKey(id)) return null;
  const name = text(raw.name, 120);
  if (!name) return null;
  const assetId = typeof raw.assetId === "number" || typeof raw.assetId === "string" ? String(raw.assetId) : "";
  const sha256 = typeof raw.sha256 === "string" ? raw.sha256.trim().toLowerCase() : "";
  const downloadUrl = typeof raw.downloadUrl === "string" && isAllowedHubUrl(raw.downloadUrl, hubBaseUrl) ? raw.downloadUrl : "";
  return {
    id,
    name,
    version: text(raw.version, 40) || "0.0.0",
    author: text(raw.author, 80),
    description: text(raw.description, 1000),
    targetApp: text(raw.targetApp, 40).toLowerCase(),
    targetAppName: text(raw.targetAppName, 60),
    category: text(raw.category, 40).toLowerCase(),
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags.map((tag) => text(tag, 40)).filter(Boolean))].slice(0, MAX_TAGS_PER_PACKAGE) : [],
    fileType: text(raw.fileType, 20).toLowerCase(),
    fileName: text(raw.fileName, 200),
    fileSize: count(raw.fileSize),
    assetId: ASSET_ID_PATTERN.test(assetId) ? assetId : "",
    downloadUrl,
    sha256: SHA256_PATTERN.test(sha256) ? sha256 : "",
    downloads: count(raw.downloads),
    score: count(raw.score),
    createdAt: time(raw.createdAt),
    updatedAt: time(raw.updatedAt) || time(raw.createdAt),
  };
}

/**
 * Validates the `GET /api/v1/packages` response. Invalid entries and
 * packages for other apps are dropped. Throws if the response is unusable.
 */
export function normalizeHubCatalogue(raw, hubBaseUrl = FILE_HUB_BASE_URL) {
  if (!isRecord(raw) || !Array.isArray(raw.packages)) {
    throw new Error("File Hub returned an unexpected response.");
  }
  const seen = new Set();
  const packages = [];
  for (const entry of raw.packages.slice(0, MAX_PACKAGES)) {
    const item = normalizeHubPackage(entry, hubBaseUrl);
    if (!item || seen.has(item.id) || (item.targetApp && item.targetApp !== FILE_HUB.appId)) continue;
    seen.add(item.id);
    packages.push(item);
  }
  return { generatedAt: time(raw.generatedAt), packages };
}

/** One `lazymod_hub_packages` entry. */
export function isValidHubInstallRecord(record) {
  return isRecord(record) && typeof record.packId === "string" && Boolean(record.packId) && typeof record.version === "string";
}

export function isInstallableHubPackage(item) {
  return HUB_INSTALLABLE_TYPES.includes(item.fileType) && Boolean(item.assetId || item.downloadUrl);
}

// GitHub release downloads redirect to these hosts.
const GITHUB_ASSET_ORIGINS = Object.freeze(["https://release-assets.githubusercontent.com", "https://objects.githubusercontent.com"]);

/** Host permission patterns needed to download a package (`https://host/*`). */
export function hubPermissionOrigins(item, hubBaseUrl = FILE_HUB_BASE_URL) {
  const origins = new Set();
  for (const url of hubDownloadUrls(item, hubBaseUrl)) {
    const { origin, hostname } = new URL(url);
    origins.add(origin);
    if (hostname === "github.com") GITHUB_ASSET_ORIGINS.forEach((assetOrigin) => origins.add(assetOrigin));
  }
  return [...origins].map((origin) => `${origin}/*`);
}

/** A host permission pattern the permission page accepts: https, or http on loopback. */
export function isValidPermissionOrigin(value) {
  return typeof value === "string" && /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:127\.0\.0\.1|localhost))(?::\d{1,5})?\/\*$/i.test(value);
}

/** Download sources in order: the hub endpoint (needs an asset id), then `downloadUrl`. */
export function hubDownloadUrls(item, hubBaseUrl = FILE_HUB_BASE_URL) {
  const urls = [];
  if (item.assetId) urls.push(new URL(`${FILE_HUB.downloadPath}${encodeURIComponent(item.assetId)}`, hubBaseUrl).href);
  if (item.downloadUrl) urls.push(item.downloadUrl);
  return urls;
}

function versionParts(version) {
  const match = /^v?(\d+(?:\.\d+)*)/i.exec(String(version).trim());
  return match ? match[1].split(".").map(Number) : null;
}

/** Compares dotted numeric versions ("1.2.10" > "1.2.9"); -1, 0, or 1. */
export function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  if (!left || !right) return a === b ? 0 : String(a).localeCompare(String(b), "en", { numeric: true }) < 0 ? -1 : 1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return difference < 0 ? -1 : 1;
  }
  return 0;
}

/** Every word of `query` must appear in the name, author, or description. */
export function filterHubPackages(packages, { query = "", category = "" } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return packages.filter((item) => {
    if (category && item.category !== category) return false;
    const haystack = `${item.name}\n${item.author}\n${item.description}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
const SORTERS = {
  updated: (a, b) => b.updatedAt - a.updatedAt || byName(a, b),
  newest: (a, b) => b.createdAt - a.createdAt || byName(a, b),
  score: (a, b) => b.score - a.score || b.downloads - a.downloads || byName(a, b),
  downloads: (a, b) => b.downloads - a.downloads || b.score - a.score || byName(a, b),
  name: byName,
};

/**
 * File Hub page for a package. The hub has no per-package address yet, so
 * this opens its list filtered to QuickTag and the package's category, where
 * the package is listed. Change only this function when a deep link exists.
 */
export function hubPackageUrl(item, hubBaseUrl = FILE_HUB_BASE_URL) {
  const url = new URL("index.html", hubBaseUrl);
  url.searchParams.set("app", FILE_HUB.appId);
  if (item.category) url.searchParams.set("category", item.category);
  return url.href;
}

/**
 * A short outline of a validated pack for previews: groups, categories, tag
 * counts, and the first tags of each category.
 */
export function summarizePack(pack, { categories: maxCategories = 24, tags: maxTags = 12 } = {}) {
  const groups = Object.entries(pack.groups).map(([group, categories]) => ({ group, categories: Object.entries(categories) }));
  const summary = { name: pack.name, groupCount: groups.length, categoryCount: 0, tagCount: 0, categories: [], hiddenCategories: 0 };
  for (const { group, categories } of groups) {
    for (const [category, tags] of categories) {
      summary.categoryCount += 1;
      summary.tagCount += tags.length;
      if (summary.categories.length < maxCategories) {
        summary.categories.push({ group, category, count: tags.length, tags: tags.slice(0, maxTags) });
      } else {
        summary.hiddenCategories += 1;
      }
    }
  }
  return summary;
}

export function sortHubPackages(packages, mode) {
  return [...packages].sort(SORTERS[mode] || SORTERS.updated);
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Parses a downloaded tag pack strictly: valid UTF-8 JSON, no unsafe keys at
 * any depth, an explicit `groups` object in the documented format, and size
 * limits. Returns a normalized pack or throws a user-facing error.
 */
export function parseHubPack(bytes, fallbackName) {
  let raw;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("The package file is not valid JSON.");
  }
  if (hasUnsafeKeys(raw)) throw new Error("The package file contains unsafe keys (__proto__, constructor, or prototype).");
  if (!isRecord(raw) || !isRecord(raw.groups) || !isValidPaletteGroups(raw.groups)) {
    throw new Error('The package file is not a QuickTag tag pack (it needs a "groups" object of categories with tag lists).');
  }
  if (raw.name !== undefined && typeof raw.name !== "string") throw new Error("The tag pack name must be a string.");

  const groups = Object.entries(raw.groups);
  let tagCount = 0;
  if (groups.length > PACK_LIMITS.groups) throw new Error(`The tag pack has more than ${PACK_LIMITS.groups} groups.`);
  for (const [groupName, categories] of groups) {
    const entries = Array.isArray(categories) ? [[groupName, categories]] : Object.entries(categories);
    if (groupName.length > PACK_LIMITS.nameLength || entries.length > PACK_LIMITS.categoriesPerGroup) throw new Error("The tag pack has too many categories or names that are too long.");
    for (const [categoryName, tags] of entries) {
      tagCount += tags.length;
      if (categoryName.length > PACK_LIMITS.nameLength || tags.some((tag) => tag.length > PACK_LIMITS.tagLength)) throw new Error("The tag pack has names or tags that are too long.");
    }
  }
  if (tagCount > PACK_LIMITS.tags) throw new Error(`The tag pack has more than ${PACK_LIMITS.tags} tags.`);

  const pack = normalizePalettePack({ name: raw.name?.slice(0, PACK_LIMITS.nameLength), groups: raw.groups }, fallbackName);
  return { name: pack.name, groups: pack.groups };
}
