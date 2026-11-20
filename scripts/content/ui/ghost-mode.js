// Ghost mode: makes the tagger see-through. Either toggled, or (hold mode)
// active only while the ghost button or the keyboard shortcut is held.
import { STORAGE_KEYS, DEFAULT_GHOST_SHORTCUT } from "../../shared/constants.js";
import { loadData, saveData } from "../../shared/storage.js";
import { matchesShortcut, normalizeShortcut } from "../../shared/shortcuts.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { $, shell } from "./shell.js";
import { createShortcutRecorder } from "./shortcut-recorder.js";

const ghost = {
  holdMode: false,
  enabled: false,
  transientActive: false,
  shortcutHeld: false,
  buttonPointerId: null,
  shortcut: { ...DEFAULT_GHOST_SHORTCUT },
};

let ghostToggle;

function updateGhostUI() {
  const active = ghost.holdMode ? ghost.transientActive : ghost.enabled;
  shell.windowEl.classList.toggle("ghost-mode", active);
  ghostToggle.setAttribute("aria-pressed", String(active));
  ghostToggle.title = ghost.holdMode ? "Hold to activate ghost mode" : active ? "Turn off ghost mode" : "Turn on ghost mode";
}

function setGhostMode(enabled) {
  ghost.enabled = enabled;
  updateGhostUI();
  saveData(STORAGE_KEYS.ghostMode, ghost.enabled);
}

function updateTransientGhostMode() {
  const active = ghost.buttonPointerId !== null || ghost.shortcutHeld;
  if (!ghost.holdMode || ghost.transientActive === active) return;
  ghost.transientActive = active;
  updateGhostUI();
}

function releaseGhostButton() {
  ghost.buttonPointerId = null;
  updateTransientGhostMode();
}

export function releaseGhostMode() {
  ghost.shortcutHeld = false;
  releaseGhostButton();
}

// Capture phase on document, so the shortcut also works while page or
// tagger inputs have focus. Recording is handled by shortcut-recorder.js.
function handleKeydown(event) {
  if (!state.extensionEnabled || state.recordingShortcut || !matchesShortcut(event, ghost.shortcut)) return;
  event.preventDefault();
  event.stopPropagation();
  if (ghost.holdMode) {
    ghost.shortcutHeld = true;
    updateTransientGhostMode();
  } else {
    setGhostMode(!ghost.enabled);
  }
}

function handleKeyup(event) {
  if (!state.extensionEnabled || !ghost.shortcutHeld) return;
  const key = event.key.toLowerCase();
  const { shortcut } = ghost;
  if (
    key === shortcut.key ||
    (shortcut.ctrl && key === "control") ||
    (shortcut.alt && key === "alt") ||
    (shortcut.shift && key === "shift") ||
    (shortcut.meta && key === "meta")
  ) {
    ghost.shortcutHeld = false;
    updateTransientGhostMode();
  }
}

export async function initGhostMode() {
  ghostToggle = $("#lm-ghost-toggle");
  const ghostHoldCheckbox = $("#lm-ghost-hold");

  const savedGhostMode = await loadData(STORAGE_KEYS.ghostMode, false);
  const savedHoldMode = await loadData(STORAGE_KEYS.ghostHoldMode, false);
  const savedShortcut = await loadData(STORAGE_KEYS.ghostShortcut, DEFAULT_GHOST_SHORTCUT);
  ghost.holdMode = Boolean(savedHoldMode);
  ghost.enabled = Boolean(savedGhostMode) && !ghost.holdMode;
  ghost.shortcut = normalizeShortcut(savedShortcut, DEFAULT_GHOST_SHORTCUT);

  updateGhostUI();
  ghostHoldCheckbox.checked = ghost.holdMode;
  createShortcutRecorder($("#lm-ghost-shortcut"), {
    getShortcut: () => ghost.shortcut,
    onRecorded: (shortcut) => {
      ghost.shortcut = shortcut;
      saveData(STORAGE_KEYS.ghostShortcut, shortcut);
    },
  });

  ghostHoldCheckbox.onchange = () => {
    ghost.holdMode = ghostHoldCheckbox.checked;
    ghost.transientActive = false;
    ghost.shortcutHeld = false;
    ghost.buttonPointerId = null;
    if (ghost.holdMode) {
      ghost.enabled = false;
      saveData(STORAGE_KEYS.ghostMode, false);
    }
    saveData(STORAGE_KEYS.ghostHoldMode, ghost.holdMode);
    updateGhostUI();
  };

  ghostToggle.onpointerdown = (event) => {
    if (!ghost.holdMode || event.button !== 0) return;
    event.preventDefault();
    ghost.buttonPointerId = event.pointerId;
    ghostToggle.setPointerCapture(event.pointerId);
    updateTransientGhostMode();
  };
  ghostToggle.onpointerup = (event) => {
    if (ghost.buttonPointerId === event.pointerId) releaseGhostButton();
  };
  ghostToggle.onpointercancel = releaseGhostButton;
  ghostToggle.onlostpointercapture = (event) => {
    if (ghost.buttonPointerId === event.pointerId) releaseGhostButton();
  };
  ghostToggle.onclick = () => {
    if (!ghost.holdMode) setGhostMode(!ghost.enabled);
  };

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keyup", handleKeyup, true);
  window.addEventListener("blur", releaseGhostMode);
  on(EVENTS.extensionHidden, releaseGhostMode);
}
