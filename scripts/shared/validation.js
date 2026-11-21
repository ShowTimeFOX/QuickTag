// Structural validators for saved data. Pure functions, no browser APIs.
import { DOCK_EDGES } from "./constants.js";

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Keys that must never be copied from untrusted JSON into an object. */
export const UNSAFE_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

export function isSafeKey(key) {
  return !UNSAFE_KEYS.includes(key);
}

/** True if any object key at any depth is an unsafe key (`JSON.parse` keeps `__proto__` as an own key). */
export function hasUnsafeKeys(value, depth = 0) {
  if (depth > 64) return true;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeKeys(item, depth + 1));
  if (value === null || typeof value !== "object") return false;
  return Object.keys(value).some((key) => !isSafeKey(key) || hasUnsafeKeys(value[key], depth + 1));
}

/**
 * A copy of `object` with keys in `order` first (only keys that exist), then
 * any other keys in their current order. Chrome's storage.local returns object
 * keys sorted, so stored order arrays restore the intended order. (Integer-like
 * keys such as "2024" always come first in JavaScript objects.)
 */
export function orderedObject(object, order) {
  if (!isRecord(object)) return object;
  const keys = Object.keys(object);
  const ordered = Array.isArray(order) ? order.filter((key, index) => typeof key === "string" && Object.hasOwn(object, key) && order.indexOf(key) === index) : [];
  const rest = keys.filter((key) => !ordered.includes(key));
  return Object.fromEntries([...ordered, ...rest].map((key) => [key, object[key]]));
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
