// Focus Mode layout configuration (stored as JSON in `lazymod_focus_layout`).
//
// {
//   "version": 1,
//   "activePreset": "default",
//   "presets": {
//     "<id>": {
//       "name": "Default",
//       "columns": "<CSS grid-template-columns>",
//       "rows": "<CSS grid-template-rows>",
//       "areas": ["topbar topbar", "image palette", "tags palette"],
//       "panels": { "<panel>": { "visible": true } }
//     }
//   }
// }
//
// `areas` uses the panel ids as CSS grid area names ("." is an empty cell);
// every row needs the same number of cells and each panel must form a
// rectangle. Hidden panels may stay in `areas`; their cells are left empty.
import { isRecord } from "./validation.js";

export const FOCUS_LAYOUT_VERSION = 1;
export const FOCUS_PANELS = Object.freeze(["topbar", "image", "tags", "palette"]);

const ALL_VISIBLE = () => Object.fromEntries(FOCUS_PANELS.map((panel) => [panel, { visible: true }]));

const DEFAULT_FOCUS_LAYOUT = Object.freeze({
  version: FOCUS_LAYOUT_VERSION,
  activePreset: "default",
  presets: {
    default: {
      name: "Default",
      columns: "minmax(280px, 2fr) minmax(320px, 3fr)",
      rows: "auto minmax(0, 1fr) minmax(0, 1.25fr)",
      areas: ["topbar topbar", "image palette", "tags palette"],
      panels: ALL_VISIBLE(),
    },
    "palette-wide": {
      name: "Wide palette",
      columns: "minmax(260px, 1fr) minmax(360px, 2fr)",
      rows: "auto minmax(0, 1fr)",
      areas: ["topbar topbar", "tags palette"],
      panels: { ...ALL_VISIBLE(), image: { visible: false } },
    },
    review: {
      name: "Image review",
      columns: "minmax(320px, 3fr) minmax(300px, 2fr)",
      rows: "auto minmax(0, 1.4fr) minmax(0, 1fr)",
      areas: ["topbar topbar", "image tags", "image palette"],
      panels: ALL_VISIBLE(),
    },
  },
});

export function createDefaultFocusLayout() {
  return structuredClone(DEFAULT_FOCUS_LAYOUT);
}

// Grid track lists: CSS lengths, fr, %, and functions such as minmax()/repeat().
// Checked again with CSS.supports() where the grid is applied.
const TRACK_LIST_PATTERN = /^[a-z0-9%.,()\s+-]{1,200}$/i;
const AREA_NAME_PATTERN = /^(?:[a-z][a-z0-9-]*|\.)$/;
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

function validateAreas(areas, presetId) {
  const where = `Preset "${presetId}"`;
  if (!Array.isArray(areas) || areas.length === 0 || areas.length > 12) {
    throw new Error(`${where}: "areas" must be a list of 1–12 row strings.`);
  }
  const grid = areas.map((row, index) => {
    if (typeof row !== "string" || !row.trim()) throw new Error(`${where}: area row ${index + 1} must be a non-empty string.`);
    return row.trim().split(/\s+/);
  });
  const width = grid[0].length;
  if (width > 12) throw new Error(`${where}: at most 12 columns are supported.`);
  grid.forEach((cells, index) => {
    if (cells.length !== width) throw new Error(`${where}: area row ${index + 1} has ${cells.length} cells; expected ${width}.`);
    cells.forEach((cell) => {
      if (!AREA_NAME_PATTERN.test(cell) || (cell !== "." && !FOCUS_PANELS.includes(cell))) {
        throw new Error(`${where}: unknown area "${cell}". Use ${FOCUS_PANELS.join(", ")}, or "." for an empty cell.`);
      }
    });
  });

  // Each named area must be a filled rectangle.
  const bounds = {};
  grid.forEach((cells, row) =>
    cells.forEach((cell, column) => {
      if (cell === ".") return;
      const box = (bounds[cell] ||= { top: row, bottom: row, left: column, right: column, count: 0 });
      box.top = Math.min(box.top, row);
      box.bottom = Math.max(box.bottom, row);
      box.left = Math.min(box.left, column);
      box.right = Math.max(box.right, column);
      box.count += 1;
    }),
  );
  Object.entries(bounds).forEach(([name, box]) => {
    if ((box.bottom - box.top + 1) * (box.right - box.left + 1) !== box.count) {
      throw new Error(`${where}: area "${name}" must form a rectangle.`);
    }
  });
  return { width, height: grid.length, placed: Object.keys(bounds) };
}

function validateTrackList(value, label, presetId) {
  if (typeof value !== "string" || !TRACK_LIST_PATTERN.test(value.trim())) {
    throw new Error(`Preset "${presetId}": "${label}" must be a CSS grid track list such as "minmax(0, 1fr) 2fr".`);
  }
  return value.trim();
}

function normalizePreset(raw, presetId) {
  if (!isRecord(raw)) throw new Error(`Preset "${presetId}" must be an object.`);
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 60) : presetId;
  const { placed } = validateAreas(raw.areas, presetId);
  const columns = validateTrackList(raw.columns, "columns", presetId);
  const rows = validateTrackList(raw.rows, "rows", presetId);

  if (raw.panels !== undefined && !isRecord(raw.panels)) throw new Error(`Preset "${presetId}": "panels" must be an object.`);
  const panels = {};
  FOCUS_PANELS.forEach((panel) => {
    const config = raw.panels?.[panel];
    if (config !== undefined && (!isRecord(config) || (config.visible !== undefined && typeof config.visible !== "boolean"))) {
      throw new Error(`Preset "${presetId}": panel "${panel}" must be { "visible": true|false }.`);
    }
    const visible = config?.visible !== false && placed.includes(panel);
    panels[panel] = { visible };
  });
  Object.keys(raw.panels || {}).forEach((panel) => {
    if (!FOCUS_PANELS.includes(panel)) throw new Error(`Preset "${presetId}": unknown panel "${panel}".`);
  });
  if (!FOCUS_PANELS.some((panel) => panels[panel].visible)) {
    throw new Error(`Preset "${presetId}" must show at least one panel.`);
  }
  return { name, columns, rows, areas: raw.areas.map((row) => row.trim().split(/\s+/).join(" ")), panels };
}

/**
 * Validates and normalizes a layout configuration; throws user-facing errors.
 * A panel that is not placed in `areas` is treated as hidden.
 */
export function normalizeFocusLayout(raw) {
  if (!isRecord(raw)) throw new Error("The Focus Mode layout must be a JSON object.");
  if (raw.version !== undefined && raw.version !== FOCUS_LAYOUT_VERSION) {
    throw new Error(`Unsupported layout version ${raw.version}; expected ${FOCUS_LAYOUT_VERSION}.`);
  }
  if (!isRecord(raw.presets) || Object.keys(raw.presets).length === 0) {
    throw new Error('The layout needs a "presets" object with at least one preset.');
  }
  const presets = {};
  Object.entries(raw.presets).forEach(([presetId, preset]) => {
    if (!PRESET_ID_PATTERN.test(presetId)) {
      throw new Error(`Preset id "${presetId}" must use lowercase letters, digits, and hyphens (max 40).`);
    }
    presets[presetId] = normalizePreset(preset, presetId);
  });
  const activePreset = typeof raw.activePreset === "string" && presets[raw.activePreset] ? raw.activePreset : Object.keys(presets)[0];
  return { version: FOCUS_LAYOUT_VERSION, activePreset, presets };
}

export function isValidFocusLayout(raw) {
  try {
    normalizeFocusLayout(raw);
    return true;
  } catch {
    return false;
  }
}

// --- Layout editing (Focus Mode "Customize") ---
// Pure functions on a normalized preset; each returns a new preset, or null
// when the edit is not possible. Results stay valid layouts: swapping two
// panel names keeps every area a rectangle, and resizing only scales `fr`
// factors (minimums in minmax() are kept).

const FR_FACTOR = 1.25;
const FR_RANGE = Object.freeze({ min: 0.25, max: 8 });
const DIRECTIONS = Object.freeze({ left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] });

/** Top-level tracks of a track list: "minmax(0, 1fr) 2fr" → ["minmax(0, 1fr)", "2fr"]. */
export function splitTrackList(value) {
  const tracks = [];
  let depth = 0;
  let current = "";
  for (const char of value.trim()) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) tracks.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tracks.push(current);
  return tracks;
}

const areaGrid = (preset) => preset.areas.map((row) => row.split(" "));

/** Row/column bounds of a placed panel, or null. */
export function panelBounds(preset, panelId) {
  let box = null;
  areaGrid(preset).forEach((cells, row) =>
    cells.forEach((cell, column) => {
      if (cell !== panelId) return;
      box ||= { top: row, bottom: row, left: column, right: column };
      box.top = Math.min(box.top, row);
      box.bottom = Math.max(box.bottom, row);
      box.left = Math.min(box.left, column);
      box.right = Math.max(box.right, column);
    }),
  );
  return box;
}

/** The visible panel next to `panelId` in a direction (left/right/up/down), or null. */
export function neighborPanel(preset, panelId, direction) {
  const box = panelBounds(preset, panelId);
  const step = DIRECTIONS[direction];
  if (!box || !step) return null;
  const grid = areaGrid(preset);
  const row = step[0] < 0 ? box.top - 1 : step[0] > 0 ? box.bottom + 1 : Math.floor((box.top + box.bottom) / 2);
  const column = step[1] < 0 ? box.left - 1 : step[1] > 0 ? box.right + 1 : Math.floor((box.left + box.right) / 2);
  const cell = grid[row]?.[column];
  return cell && cell !== "." && cell !== panelId && preset.panels[cell]?.visible ? cell : null;
}

/** Swaps the places of two panels. */
export function swapPanels(preset, first, second) {
  if (!first || !second || first === second || !panelBounds(preset, first) || !panelBounds(preset, second)) return null;
  const areas = areaGrid(preset).map((cells) => cells.map((cell) => (cell === first ? second : cell === second ? first : cell)).join(" "));
  return { ...structuredClone(preset), areas };
}

/**
 * Makes a panel larger (+1) or smaller (-1) along "columns" (width) or
 * "rows" (height) by scaling the fr factors of the tracks it spans. Not
 * possible when the panel spans every track, the tracks have no fr factor,
 * or the list uses repeat().
 */
export function resizePanel(preset, panelId, axis, direction) {
  const box = panelBounds(preset, panelId);
  if (!box || (axis !== "columns" && axis !== "rows")) return null;
  const tracks = splitTrackList(preset[axis]);
  const [start, end] = axis === "columns" ? [box.left, box.right] : [box.top, box.bottom];
  const count = axis === "columns" ? areaGrid(preset)[0].length : preset.areas.length;
  if (tracks.length !== count || tracks.some((track) => /^repeat\(/i.test(track)) || end - start + 1 >= count) return null;
  let changed = false;
  const next = tracks.map((track, index) => {
    if (index < start || index > end) return track;
    return track.replace(/(\d*\.?\d+)fr/i, (match, number) => {
      const scaled = Math.round(Math.min(FR_RANGE.max, Math.max(FR_RANGE.min, Number(number) * (direction > 0 ? FR_FACTOR : 1 / FR_FACTOR))) * 100) / 100;
      if (scaled !== Number(number)) changed = true;
      return `${scaled}fr`;
    });
  });
  return changed ? { ...structuredClone(preset), [axis]: next.join(" ") } : null;
}

/** A preset id derived from `name` that is not used in `layout` yet. */
export function uniquePresetId(layout, name) {
  const base =
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "custom";
  let id = /^[a-z0-9]/.test(base) ? base : `layout-${base}`.slice(0, 32);
  for (let suffix = 2; layout.presets[id]; suffix += 1) id = `${base.slice(0, 32)}-${suffix}`;
  return id;
}

/** Adds `preset` under a new name and selects it; returns the new layout. */
export function addPresetCopy(layout, preset, name) {
  const trimmed = String(name || "").trim().slice(0, 60) || "Custom layout";
  const presetId = uniquePresetId(layout, trimmed);
  return normalizeFocusLayout({ ...layout, activePreset: presetId, presets: { ...layout.presets, [presetId]: { ...structuredClone(preset), name: trimmed } } });
}

/** Ids of the built-in presets; they cannot be deleted (Reset to defaults restores them). */
export const BUILT_IN_PRESET_IDS = Object.freeze(Object.keys(DEFAULT_FOCUS_LAYOUT.presets));

export function isCustomPreset(presetId) {
  return !BUILT_IN_PRESET_IDS.includes(presetId);
}

/**
 * Removes a user-saved preset. If it was active, "default" (or the first
 * remaining built-in, else the first remaining preset) becomes active.
 * Returns null for built-in presets and for the last remaining preset.
 */
export function removePreset(layout, presetId) {
  if (!layout.presets[presetId] || !isCustomPreset(presetId) || Object.keys(layout.presets).length < 2) return null;
  const presets = { ...layout.presets };
  delete presets[presetId];
  const remaining = Object.keys(presets);
  const fallback = presets.default ? "default" : remaining.find((id) => !isCustomPreset(id)) || remaining[0];
  return normalizeFocusLayout({ ...layout, presets, activePreset: layout.activePreset === presetId ? fallback : layout.activePreset });
}
