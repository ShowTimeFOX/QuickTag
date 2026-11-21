// Tag pack (palette) model: normalization and validation.
//
// A pack is `{ name: string, groups: { [group]: { [category]: string[] } } }`.
// Older formats are accepted: `folders` instead of `groups`, groups given
// directly at the top level, and groups that are a flat tag array (these
// become a single "General" category).
import { isRecord, isSafeKey, orderedObject } from "./validation.js";

const PACK_META_KEYS = ["name", "activeFolder", "activeGroup", "activeCategory"];

function getSourceGroups(rawData) {
  return rawData.groups || rawData.folders || Object.fromEntries(Object.entries(rawData).filter(([key]) => !PACK_META_KEYS.includes(key)));
}

/** Converts raw JSON into a normalized pack, or throws a user-facing error. */
export function normalizePalettePack(rawData, fallbackName) {
  if (!isRecord(rawData)) {
    throw new Error("Palette JSON must contain an object.");
  }

  const sourceGroups = getSourceGroups(rawData);
  if (!isRecord(sourceGroups)) {
    throw new Error("No folder groups were found in the palette JSON.");
  }

  const groups = {};
  // Unsafe keys (`__proto__`, ...) are skipped: assigning them would change
  // the prototype of the new objects.
  Object.entries(sourceGroups).forEach(([groupName, rawCategories]) => {
    if (!isSafeKey(groupName)) return;
    if (Array.isArray(rawCategories)) {
      groups[groupName] = { General: rawCategories.filter((tag) => typeof tag === "string") };
      return;
    }
    if (!rawCategories || typeof rawCategories !== "object") return;

    const categories = {};
    Object.entries(rawCategories).forEach(([categoryName, rawTags]) => {
      if (isSafeKey(categoryName) && Array.isArray(rawTags)) {
        categories[categoryName] = rawTags.filter((tag) => typeof tag === "string");
      }
    });
    if (Object.keys(categories).length > 0) groups[groupName] = categories;
  });

  if (Object.keys(groups).length === 0) {
    throw new Error("The palette does not contain any groups or tags.");
  }

  return {
    name: typeof rawData.name === "string" && rawData.name.trim() ? rawData.name.trim() : fallbackName,
    groups,
  };
}

/** Returns the first group and its first category of a normalized pack. */
export function firstPaletteLocation(pack) {
  const activeGroup = Object.keys(pack.groups)[0];
  return {
    activeGroup,
    activeCategory: Object.keys(pack.groups[activeGroup])[0],
  };
}

/** Strict check used for backups: every group/category must be well formed. */
export function isValidPaletteGroups(groups) {
  if (!isRecord(groups) || Object.keys(groups).length === 0) return false;
  return Object.values(groups).every((categories) => {
    if (Array.isArray(categories)) {
      return categories.every((tag) => typeof tag === "string");
    }
    return (
      isRecord(categories) &&
      Object.keys(categories).length > 0 &&
      Object.values(categories).every((tags) => Array.isArray(tags) && tags.every((tag) => typeof tag === "string"))
    );
  });
}

export function isValidPalettePack(pack) {
  if (!isRecord(pack)) return false;
  return (pack.name === undefined || typeof pack.name === "string") && isValidPaletteGroups(getSourceGroups(pack));
}

// --- Order in storage ---
// Chrome's storage.local returns object keys sorted alphabetically, which
// reordered packs, groups, and categories after a save. Stored palette data
// carries explicit order arrays: `packOrder` on the palette data, and
// `groupOrder` / `categoryOrder` on each pack. Write with `encode…`, read with
// `decode…`; in memory, object key order is the order.

export function encodePack(pack) {
  if (!isRecord(pack) || !isRecord(pack.groups)) return pack;
  return {
    ...pack,
    groupOrder: Object.keys(pack.groups),
    categoryOrder: Object.fromEntries(Object.entries(pack.groups).map(([group, categories]) => [group, isRecord(categories) ? Object.keys(categories) : []])),
  };
}

export function decodePack(pack) {
  if (!isRecord(pack) || !isRecord(pack.groups)) return pack;
  const { groupOrder, categoryOrder, ...rest } = pack;
  const groups = orderedObject(pack.groups, groupOrder);
  return {
    ...rest,
    groups: Object.fromEntries(Object.entries(groups).map(([group, categories]) => [group, isRecord(categories) ? orderedObject(categories, categoryOrder?.[group]) : categories])),
  };
}

export function encodePaletteData(data) {
  if (!isRecord(data) || !isRecord(data.packs)) return data;
  return { ...data, packOrder: Object.keys(data.packs), packs: Object.fromEntries(Object.entries(data.packs).map(([packId, pack]) => [packId, encodePack(pack)])) };
}

export function decodePaletteData(data) {
  if (!isRecord(data) || !isRecord(data.packs)) return data;
  const { packOrder, ...rest } = data;
  const packs = orderedObject(data.packs, packOrder);
  return { ...rest, packs: Object.fromEntries(Object.entries(packs).map(([packId, pack]) => [packId, decodePack(pack)])) };
}

/** Pack JSON as exported to a file and shown in the editor. */
export function serializePalettePack(pack) {
  return JSON.stringify({ name: pack.name, groups: pack.groups }, null, 2);
}
