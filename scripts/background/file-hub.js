// File Hub requests for the Assets tab. They run here, not in the content
// script: the download endpoints send no CORS headers, and page CSPs and
// CORS rules do not apply to the extension's own background requests.
//
// The content script only sends a package id. The download URL, size, and
// checksum always come from the catalogue fetched here.
import { FILE_HUB, FILE_HUB_BASE_URL } from "../shared/constants.js";
import { hubDownloadUrls, hubPermissionOrigins, isAllowedHubUrl, isInstallableHubPackage, normalizeHubCatalogue, parseHubPack, sha256Hex } from "../shared/file-hub.js";

let cached = null; // { fetchedAt, catalogue }

/** Connection and HTTP failures; the next download source is tried after these. */
function retryableError(message) {
  return Object.assign(new Error(message), { retryable: true });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FILE_HUB.requestTimeoutMs);
  try {
    return await fetch(url, { ...options, credentials: "omit", redirect: "follow", signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw retryableError("File Hub did not respond in time. Try again later.");
    throw retryableError(`Could not connect to File Hub. Check your internet connection. (${error.message})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the body, stopping as soon as it exceeds `maxBytes`. */
async function readLimited(response, maxBytes, label) {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`The ${label} is larger than the ${Math.round(maxBytes / 1024)} KB limit.`);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`The ${label} is larger than the ${Math.round(maxBytes / 1024)} KB limit.`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => {});
      throw new Error(`The ${label} is larger than the ${Math.round(maxBytes / 1024)} KB limit.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The catalogue of QuickTag packages, cached briefly. `force` skips both caches. */
export async function getHubCatalogue({ force = false } = {}) {
  if (!force && cached && Date.now() - cached.fetchedAt < FILE_HUB.catalogueTtlMs) return cached.catalogue;
  const url = new URL(FILE_HUB.cataloguePath, FILE_HUB_BASE_URL);
  url.searchParams.set("app", FILE_HUB.appId);
  const response = await fetchWithTimeout(url.href, { cache: force ? "no-cache" : "default", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`File Hub returned HTTP error ${response.status}.`);
  const bytes = await readLimited(response, FILE_HUB.maxCatalogueBytes, "package list");
  let raw;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("File Hub returned a package list that is not valid JSON.");
  }
  const catalogue = normalizeHubCatalogue(raw);
  cached = { fetchedAt: Date.now(), catalogue };
  return catalogue;
}

/** Host permissions (of `hubPermissionOrigins`) that are not granted. */
async function missingHubPermissions(item) {
  if (!chrome.permissions?.contains) return [];
  const missing = [];
  for (const origin of hubPermissionOrigins(item)) {
    const granted = await chrome.permissions.contains({ origins: [origin] }).catch(() => true);
    if (!granted) missing.push(origin);
  }
  return missing;
}

/**
 * Opens the permission page. permissions.request() only works during a user
 * gesture in an extension page (not in a content script or the background),
 * so the user confirms there; the result goes back to `tabId`.
 */
export async function openPermissionPrompt({ origins, tabId, packageId, purpose }) {
  const params = new URLSearchParams({ origins: JSON.stringify(origins), packageId, purpose });
  if (Number.isInteger(tabId)) params.set("tabId", String(tabId));
  const url = chrome.runtime.getURL(`pages/permissions.html?${params}`);
  try {
    await chrome.windows.create({ url, type: "popup", width: 480, height: 460 });
  } catch {
    await chrome.tabs.create({ url });
  }
}

/** Origins still missing for a package, for reopening the permission page. */
export async function getMissingHubPermissions(packageId) {
  const item = (await getHubCatalogue()).packages.find((entry) => entry.id === packageId);
  return item ? missingHubPermissions(item) : [];
}

async function downloadFrom(url, item) {
  if (!isAllowedHubUrl(url)) throw new Error("The package download address is not allowed.");
  const response = await fetchWithTimeout(url, { cache: "no-store" });
  if (!response.ok) throw retryableError(`The download failed with HTTP error ${response.status}.`);
  if (response.url && !isAllowedHubUrl(response.url)) throw new Error("The download was redirected to an address that is not allowed.");
  const bytes = await readLimited(response, FILE_HUB.maxPackageBytes, "package file");
  if (item.sha256) {
    const actual = await sha256Hex(bytes);
    if (actual !== item.sha256) throw new Error("The downloaded file does not match its SHA-256 checksum. It was not installed.");
  } else if (item.fileSize && bytes.byteLength !== item.fileSize) {
    throw new Error("The downloaded file size does not match the package information. It was not installed.");
  }
  return bytes;
}

/**
 * Downloads, verifies, and validates a package. Resolves to `{ pack, item, verified }`.
 * If host access is missing (Firefox lets users withhold it), the permission
 * page opens and the error carries `permission: true` and the origins.
 */
export async function downloadHubPackage(packageId, { tabId, purpose = "install" } = {}) {
  if (typeof packageId !== "string" || !packageId) throw new Error("Invalid package ID.");
  let item = (await getHubCatalogue()).packages.find((entry) => entry.id === packageId);
  if (!item) item = (await getHubCatalogue({ force: true })).packages.find((entry) => entry.id === packageId);
  if (!item) throw new Error("This package is no longer available on File Hub.");
  if (!isInstallableHubPackage(item)) throw new Error(`QuickTag cannot install ${item.fileType ? `${item.fileType.toUpperCase()} ` : ""}packages.`);
  if (item.fileSize > FILE_HUB.maxPackageBytes) throw new Error(`The package is larger than the ${Math.round(FILE_HUB.maxPackageBytes / 1024)} KB limit.`);

  const missing = await missingHubPermissions(item);
  if (missing.length) {
    await openPermissionPrompt({ origins: missing, tabId, packageId, purpose }).catch(() => {});
    const hosts = missing.map((origin) => new URL(origin.replace("/*", "/")).host).join(", ");
    throw Object.assign(new Error(`QuickTag needs access to ${hosts} to download File Hub packages.`), { permission: true, origins: missing });
  }

  let lastError = null;
  for (const url of hubDownloadUrls(item)) {
    try {
      const bytes = await downloadFrom(url, item);
      return { pack: parseHubPack(bytes, item.name), item, verified: Boolean(item.sha256) };
    } catch (error) {
      lastError = error;
      // A file that downloaded but failed verification or validation is not
      // retried from another source.
      if (!error.retryable) break;
    }
  }
  throw lastError || new Error("This package has no download address.");
}
