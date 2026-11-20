// Keyboard shortcuts: `{ ctrl, alt, shift, meta, key }` where `key` is the
// lower-cased `KeyboardEvent.key` ("a", "escape", "arrowup", …).
import { isRecord } from "./validation.js";

const MODIFIERS = ["ctrl", "alt", "shift", "meta"];

export function isValidShortcut(shortcut) {
  return isRecord(shortcut) && MODIFIERS.every((key) => typeof shortcut[key] === "boolean") && typeof shortcut.key === "string" && Boolean(shortcut.key);
}

export function hasModifier(shortcut) {
  return MODIFIERS.some((key) => shortcut[key]);
}

/** Returns a clean copy, or `fallback` when `raw` is not a valid shortcut. */
export function normalizeShortcut(raw, fallback) {
  if (!isValidShortcut(raw)) return { ...fallback };
  return { ctrl: raw.ctrl, alt: raw.alt, shift: raw.shift, meta: raw.meta, key: raw.key.toLowerCase() };
}

export function shortcutFromEvent(event) {
  return { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey, key: event.key.toLowerCase() };
}

function keyMatches(event, shortcutKey) {
  const key = event.key.toLowerCase();
  if (key === shortcutKey) return true;
  // macOS Option and some layouts turn Alt+letter into another character
  // (Option+A → "å"). For letter/digit shortcuts, fall back to the physical key.
  if (/^[a-z0-9]$/.test(shortcutKey) && !/^[a-z0-9]$/.test(key)) {
    return event.code === (/\d/.test(shortcutKey) ? `Digit${shortcutKey}` : `Key${shortcutKey.toUpperCase()}`);
  }
  return false;
}

export function matchesShortcut(event, shortcut) {
  return (
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.metaKey === shortcut.meta &&
    keyMatches(event, shortcut.key)
  );
}

const KEY_LABELS = { escape: "Esc", " ": "Space", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right" };

export function formatShortcut(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.meta) parts.push("Meta");
  const key = KEY_LABELS[shortcut.key] || (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1));
  return [...parts, key].join(" + ");
}

/** Keys that are only modifiers and can never complete a shortcut. */
export function isModifierKey(key) {
  return ["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"].includes(key);
}
