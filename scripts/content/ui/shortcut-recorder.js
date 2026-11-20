// "Click, then press a shortcut" buttons (ghost mode, Focus Mode settings).
//
// While recording, one capture-phase listener on `window` takes every keydown
// first (and stops it), so no other QuickTag or page shortcut fires; other
// keyboard features also check `state.recordingShortcut`. Only one recorder
// is active at a time. Escape cancels.
import { formatShortcut, hasModifier, isModifierKey, shortcutFromEvent } from "../../shared/shortcuts.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";

let active = null;

function finish(recorder) {
  window.removeEventListener("keydown", handleKeydown, true);
  state.recordingShortcut = false;
  active = null;
  recorder.render();
}

function handleKeydown(event) {
  const recorder = active;
  if (!recorder) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.key === "Escape") {
    finish(recorder);
    return;
  }
  if (isModifierKey(event.key)) return;
  const shortcut = shortcutFromEvent(event);
  if (recorder.requireModifier && !hasModifier(shortcut)) {
    recorder.button.textContent = "Use a modifier + key";
    return;
  }
  finish(recorder);
  recorder.onRecorded(shortcut);
  recorder.render();
}

export function cancelShortcutRecording() {
  if (active) finish(active);
}

/**
 * Turns `button` into a shortcut recorder.
 * `getShortcut()` returns the current shortcut for the label;
 * `onRecorded(shortcut)` saves a new one.
 */
export function createShortcutRecorder(button, { getShortcut, onRecorded, requireModifier = true }) {
  const recorder = {
    button,
    requireModifier,
    onRecorded,
    render() {
      if (active !== recorder) button.textContent = formatShortcut(getShortcut());
      button.setAttribute("aria-pressed", String(active === recorder));
    },
  };
  button.addEventListener("click", () => {
    if (active === recorder) return;
    cancelShortcutRecording();
    active = recorder;
    state.recordingShortcut = true;
    button.textContent = requireModifier ? "Press shortcut…" : "Press a key…";
    button.setAttribute("aria-pressed", "true");
    button.focus();
    window.addEventListener("keydown", handleKeydown, true);
  });
  recorder.render();
  return recorder;
}

on(EVENTS.extensionHidden, cancelShortcutRecording);
