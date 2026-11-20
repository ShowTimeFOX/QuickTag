// Structural validators for saved data. Pure functions, no browser APIs.
import { DOCK_EDGES } from "./constants.js";

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isValidWindowPosition(position) {
  return isRecord(position) && typeof position.top === "string" && typeof position.left === "string";
}

/** Validates a per-origin layout saved under `lazymod_site_layout_<origin>`. */
export function isValidPageLayout(layout) {
  return (
    isRecord(layout) &&
    typeof layout.docked === "boolean" &&
    DOCK_EDGES.includes(layout.dockPosition) &&
    (layout.visible === undefined || typeof layout.visible === "boolean") &&
    (layout.position === undefined || isValidWindowPosition(layout.position))
  );
}

export function isValidGhostShortcut(shortcut) {
  return (
    isRecord(shortcut) &&
    ["ctrl", "alt", "shift", "meta"].every((key) => typeof shortcut[key] === "boolean") &&
    typeof shortcut.key === "string" &&
    Boolean(shortcut.key)
  );
}
