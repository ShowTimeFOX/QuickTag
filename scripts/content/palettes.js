// Tag pack state for the tagger: loading, selection, import/export, search.
// No shadow-DOM rendering here; see ui/palette-panel.js.
import { LOG_PREFIX, STORAGE_KEYS, DEFAULT_PALETTE_FILES } from "../shared/constants.js";
import { loadData, saveData } from "../shared/storage.js";
import { normalizePalettePack, firstPaletteLocation } from "../shared/palette.js";
import { formatTag } from "../shared/tags.js";
import { state } from "./state.js";
import { searchPack } from "./fuzzy-search.js";
import { downloadJsonFile, toSafeFileName } from "./page.js";

const EMPTY_LOCATION = { activeGroup: "", activeCategory: "" };

async function fetchDefaultPacks() {
  const packs = {};
  for (const [packId, filePath] of Object.entries(DEFAULT_PALETTE_FILES)) {
    try {
      const response = await fetch(chrome.runtime.getURL(filePath));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      packs[packId] = normalizePalettePack(await response.json(), filePath);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not load ${filePath}.`, error);
    }
  }
  return packs;
}

/**
 * Builds the initial palette state from storage. Default packs are added only
 * until `defaultPacksLoaded` is saved, so deleted defaults stay deleted.
 * Palettes saved by versions before tag packs (`folders`) are migrated into a
 * "My palettes" pack.
 */
export async function loadInitialPalettes() {
  const saved = await loadData(STORAGE_KEYS.palettes, null);
  const paletteData = await buildInitialPalettes(saved);
  // First initialization (or migration): save right away, so the editor page
  // can open default packs and deleted defaults are never re-added. Unknown
  // saved fields (e.g. legacy `folders`) are kept.
  if (!saved || saved.defaultPacksLoaded !== true) {
    const persisted = { ...(saved || {}), ...paletteData };
    await saveData(STORAGE_KEYS.palettes, persisted);
    return persisted;
  }
  return paletteData;
}

async function buildInitialPalettes(saved) {
  const defaultPacks = await fetchDefaultPacks();

  if (saved && saved.packs) {
    const packs = { ...saved.packs };
    if (saved.defaultPacksLoaded !== true) {
      Object.entries(defaultPacks).forEach(([packId, pack]) => {
        if (!packs[packId]) packs[packId] = pack;
      });
    }
    const activePackId = packs[saved.activePackId] ? saved.activePackId : Object.keys(packs)[0] || "";
    if (!activePackId) {
      return { ...saved, packs, defaultPacksLoaded: true, activePackId: "", ...EMPTY_LOCATION };
    }
    const activePack = packs[activePackId];
    const initialLocation = firstPaletteLocation(activePack);
    return {
      ...saved,
      packs,
      defaultPacksLoaded: true,
      activePackId,
      activeGroup: activePack.groups[saved.activeGroup] ? saved.activeGroup : initialLocation.activeGroup,
      activeCategory: activePack.groups[saved.activeGroup]?.[saved.activeCategory] ? saved.activeCategory : initialLocation.activeCategory,
    };
  }

  const packs = { ...defaultPacks };

  if (saved && saved.folders) {
    const legacyPack = normalizePalettePack({ name: "My palettes", groups: saved.folders }, "My palettes");
    packs["legacy-saved"] = legacyPack;
    const initialLocation = firstPaletteLocation(legacyPack);
    return {
      packs,
      defaultPacksLoaded: true,
      activePackId: "legacy-saved",
      activeGroup: legacyPack.groups[saved.activeFolder] ? saved.activeFolder : initialLocation.activeGroup,
      activeCategory: initialLocation.activeCategory,
    };
  }

  const activePackId = Object.keys(packs)[0] || "";
  const initialLocation = activePackId ? firstPaletteLocation(packs[activePackId]) : EMPTY_LOCATION;
  return { packs, defaultPacksLoaded: true, activePackId, ...initialLocation };
}

export function getActivePack() {
  return state.paletteData.packs[state.paletteData.activePackId];
}

/** Fire-and-forget save of the current palette state (selection changes). */
export function savePaletteData() {
  return saveData(STORAGE_KEYS.palettes, state.paletteData);
}

/** Saves `nextData` and only adopts it once storage accepted it. Throws. */
async function commitPaletteData(nextData) {
  await chrome.storage.local.set({ [STORAGE_KEYS.palettes]: nextData });
  state.paletteData = nextData;
}

function withActivePack(packs, activePackId) {
  const pack = packs[activePackId];
  return {
    ...state.paletteData,
    packs,
    activePackId,
    ...(pack ? firstPaletteLocation(pack) : EMPTY_LOCATION),
  };
}

/** Tags shown for the current group/category (or the whole group in flat view). */
export function getVisiblePaletteTags(flatView) {
  const activePack = getActivePack();
  if (!activePack) return [];
  const categories = activePack.groups[state.paletteData.activeGroup];
  const tags = flatView ? Object.values(categories).flat() : categories[state.paletteData.activeCategory] || [];
  return [...new Set(tags.map(formatTag).filter(Boolean))];
}

export function searchActivePack(query) {
  return searchPack(getActivePack(), formatTag(query), formatTag);
}

export function selectPack(packId) {
  if (!state.paletteData.packs[packId]) return false;
  state.paletteData = withActivePack(state.paletteData.packs, packId);
  savePaletteData();
  return true;
}

export function selectGroup(groupName) {
  state.paletteData.activeGroup = groupName;
  state.paletteData.activeCategory = Object.keys(getActivePack().groups[groupName])[0];
  savePaletteData();
}

export function selectCategory(categoryName) {
  state.paletteData.activeCategory = categoryName;
  savePaletteData();
}

/** Deletes the active pack and activates the first remaining one. Throws. */
export async function deleteActivePack() {
  const packs = { ...state.paletteData.packs };
  delete packs[state.paletteData.activePackId];
  await commitPaletteData(withActivePack(packs, Object.keys(packs)[0] || ""));
}

/** Imports a pack from a JSON file and activates it. Throws on invalid JSON. */
export async function importPackFile(file) {
  const pack = normalizePalettePack(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ""));
  const packId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await commitPaletteData(withActivePack({ ...state.paletteData.packs, [packId]: pack }, packId));
}

export function exportActivePack() {
  const pack = getActivePack();
  if (!pack) return;
  downloadJsonFile(`${toSafeFileName(pack.name) || "tag-pack"}.json`, { name: pack.name, groups: pack.groups });
}
