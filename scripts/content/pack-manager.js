// Installed-pack management shared by the pack browser and the Assets tab:
// uninstall with undo, and search across all installed packs. No DOM.
import { state } from "./state.js";
import { emit, EVENTS } from "./events.js";
import { removePack, restorePack } from "./palettes.js";
import { removeHubRecordsForPack, restoreHubRecords } from "./file-hub.js";

/**
 * Removes a pack and its File Hub install record. Resolves to a removal
 * object for `undoUninstall`. The active pack falls back to a neighbor.
 */
export async function uninstallPack(packId, source) {
  const removal = await removePack(packId);
  removal.hubRecords = await removeHubRecordsForPack(packId);
  emit(EVENTS.paletteChanged, { source });
  return removal;
}

export async function undoUninstall(removal, source) {
  await restorePack(removal);
  await restoreHubRecords(removal.hubRecords);
  emit(EVENTS.paletteChanged, { source });
}

/** Pack id → File Hub record, from `loadHubInstalls()` output. */
export function hubRecordsByPack(installs) {
  return new Map(Object.values(installs).map((record) => [record.packId, record]));
}

// Lower-cased search data, rebuilt only when a pack object is replaced
// (palette state replaces packs instead of mutating them).
const indexCache = new WeakMap();

function packIndex(pack) {
  let index = indexCache.get(pack);
  if (!index) {
    const groups = Object.entries(pack.groups || {});
    index = {
      name: String(pack.name || "").toLowerCase(),
      groups: groups.map(([name]) => [name, name.toLowerCase()]),
      categories: groups.flatMap(([, categories]) => Object.keys(categories).map((name) => [name, name.toLowerCase()])),
      tags: groups.flatMap(([, categories]) => Object.values(categories).flat()).map((tag) => [tag, tag.toLowerCase()]),
    };
    index.tagCount = index.tags.length;
    indexCache.set(pack, index);
  }
  return index;
}

export function describePack(packId, pack, hubRecords) {
  const index = packIndex(pack);
  const hub = hubRecords.get(packId);
  return {
    source: hub ? "File Hub" : "Local",
    version: hub?.version || "",
    groupCount: index.groups.length,
    tagCount: index.tagCount,
  };
}

// Earlier entries rank first: name matches, then metadata, then contents.
const MATCH_KINDS = ["name", "source", "group", "category", "tag"];

function findMatch(index, meta, query) {
  if (index.name.includes(query)) return { kind: "name", text: "" };
  const metaText = `${meta.source} ${meta.version}`.toLowerCase();
  if (metaText.includes(query)) return { kind: "source", text: meta.version ? `${meta.source} ${meta.version}` : meta.source };
  for (const [kind, key] of [["group", "groups"], ["category", "categories"], ["tag", "tags"]]) {
    const hit = index[key].find(([, lower]) => lower.includes(query));
    if (hit) return { kind, text: hit[0] };
  }
  return null;
}

/**
 * Installed packs matching `query` (case-insensitive substring of the name,
 * File Hub metadata, group, category, or tag names). An empty query lists
 * every pack in stored order. Never modifies the packs.
 */
export function searchInstalledPacks(query, hubRecords) {
  const packs = Object.entries(state.paletteData?.packs || {});
  const needle = query.trim().toLowerCase();
  const results = [];
  packs.forEach(([packId, pack], order) => {
    const meta = describePack(packId, pack, hubRecords);
    const match = needle ? findMatch(packIndex(pack), meta, needle) : { kind: "name", text: "" };
    if (match) results.push({ packId, pack, meta, match, order, startsWith: packIndex(pack).name.startsWith(needle) });
  });
  if (!needle) return results;
  return results.sort(
    (a, b) => MATCH_KINDS.indexOf(a.match.kind) - MATCH_KINDS.indexOf(b.match.kind) || Number(b.startsWith) - Number(a.startsWith) || a.order - b.order,
  );
}
