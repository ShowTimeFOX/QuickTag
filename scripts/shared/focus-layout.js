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
