// Update check against the public GitHub Gist holding `update.json`.
// Sets a "NEW" toolbar badge when a newer version is published.
import { LOG_PREFIX } from "../shared/constants.js";

const UPDATE_GIST_ID = "30eeb54c1474ffedee3eae97d10eb715";
const UPDATE_GIST_URL = `https://api.github.com/gists/${UPDATE_GIST_ID}`;
const RELEASES_PATH = "/ShowTimeFOX/QuickTag/releases/latest";
const CHECK_INTERVAL_MINUTES = 360;
export const UPDATE_ALARM_NAME = "quicktag-update-check";

let pendingCheck = null;

export function compareVersions(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    if (!match) throw new Error(`Invalid update version: ${value}`);
    return match.slice(1).map(Number);
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

async function fetchUpdateMetadata() {
  const response = await fetch(UPDATE_GIST_URL, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GitHub update check failed with HTTP ${response.status}.`);
  }

  const gist = await response.json();
  const metadataText = gist.files?.["update.json"]?.content;
  if (typeof metadataText !== "string") {
    throw new Error("The update Gist does not contain update.json.");
  }
  const metadata = JSON.parse(metadataText);
  if (!metadata || typeof metadata.version !== "string" || typeof metadata.url !== "string") {
    throw new Error("The GitHub update metadata is invalid.");
  }
  return metadata;
}

/** Only the project's GitHub releases page is accepted as an update link. */
function validateReleaseUrl(url) {
  const releaseUrl = new URL(url);
  if (
    releaseUrl.protocol !== "https:" ||
    releaseUrl.hostname !== "github.com" ||
    releaseUrl.pathname !== RELEASES_PATH ||
    releaseUrl.search ||
    releaseUrl.hash
  ) {
    throw new Error("The update URL must point to the QuickTag GitHub releases page.");
  }
  return releaseUrl;
}

async function updateBadge(available, latestVersion) {
  await chrome.action.setBadgeText({ text: available ? "NEW" : "" });
  if (available) {
    await chrome.action.setBadgeBackgroundColor({ color: "#e97943" });
    await chrome.action.setTitle({ title: `QuickTag LazyMod — update ${latestVersion} available` });
  } else {
    await chrome.action.setTitle({ title: "QuickTag LazyMod" });
  }
}

async function runUpdateCheck() {
  const metadata = await fetchUpdateMetadata();
  const releaseUrl = validateReleaseUrl(metadata.url);
  const currentVersion = chrome.runtime.getManifest().version;
  const available = compareVersions(metadata.version, currentVersion) > 0;
  await updateBadge(available, metadata.version);
  return {
    currentVersion,
    latestVersion: metadata.version,
    available,
    url: releaseUrl.href,
    notes: typeof metadata.notes === "string" ? metadata.notes : "",
  };
}

/** Checks for an update; concurrent callers share one in-flight request. */
export async function checkForUpdate() {
  if (pendingCheck) return pendingCheck;
  pendingCheck = runUpdateCheck();
  try {
    return await pendingCheck;
  } finally {
    pendingCheck = null;
  }
}

export function scheduleUpdateChecks() {
  chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  checkForUpdate().catch((error) => {
    console.warn(`${LOG_PREFIX} Automatic update check failed.`, error);
  });
}

export function handleUpdateAlarm(alarm) {
  if (alarm.name !== UPDATE_ALARM_NAME) return;
  checkForUpdate().catch((error) => {
    console.warn(`${LOG_PREFIX} Scheduled update check failed.`, error);
  });
}
