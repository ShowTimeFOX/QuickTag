// Ghost mode: makes the tagger see-through. Either toggled, or (hold mode)
// active only while the ghost button or the keyboard shortcut is held.
import { STORAGE_KEYS, DEFAULT_GHOST_SHORTCUT } from "../../shared/constants.js";
import { loadData, saveData } from "../../shared/storage.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { $, shell } from "./shell.js";

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

const ghost = {
  holdMode: false,
  enabled: false,
  transientActive: false,
  shortcutHeld: false,
  buttonPointerId: null,
  shortcut: { ...DEFAULT_GHOST_SHORTCUT },
};

let ghostToggle;
let ghostShortcutButton;

export function formatGhostShortcut(shortcut) {
  const modifiers = [];
  if (shortcut.ctrl) modifiers.push("Ctrl");
  if (shortcut.alt) modifiers.push("Alt");
  if (shortcut.shift) modifiers.push("Shift");
  if (shortcut.meta) modifiers.push("Meta");
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key.replace(/^Arrow/, "");
  return [...modifiers, key].join(" + ");
}

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

export function cancelShortcutRecording() {
  if (!state.recordingGhostShortcut) return;
  state.recordingGhostShortcut = false;
  ghostShortcutButton.textContent = formatGhostShortcut(ghost.shortcut);
}

function matchesShortcut(event) {
  const { shortcut } = ghost;
  return (
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.metaKey === shortcut.meta &&
    event.key.toLowerCase() === shortcut.key
  );
}

function recordShortcut(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    cancelShortcutRecording();
    return;
  }
  if (MODIFIER_KEYS.includes(event.key)) return;
  if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    ghostShortcutButton.textContent = "Use a modifier + key";
    return;
  }
  ghost.shortcut = {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: event.key.toLowerCase(),
  };
  state.recordingGhostShortcut = false;
  ghostShortcutButton.textContent = formatGhostShortcut(ghost.shortcut);
  saveData(STORAGE_KEYS.ghostShortcut, ghost.shortcut);
}

// Capture phase on document, so the shortcut also works while page or
// tagger inputs have focus.
function handleKeydown(event) {
  if (!state.extensionEnabled) return;
  if (state.recordingGhostShortcut) {
    recordShortcut(event);
    return;
  }
  if (!matchesShortcut(event)) return;
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
  ghostShortcutButton = $("#lm-ghost-shortcut");
  const ghostHoldCheckbox = $("#lm-ghost-hold");

  const savedGhostMode = await loadData(STORAGE_KEYS.ghostMode, false);
  const savedHoldMode = await loadData(STORAGE_KEYS.ghostHoldMode, false);
  const savedShortcut = await loadData(STORAGE_KEYS.ghostShortcut, DEFAULT_GHOST_SHORTCUT);
  ghost.holdMode = Boolean(savedHoldMode);
  ghost.enabled = Boolean(savedGhostMode) && !ghost.holdMode;
  ghost.shortcut = {
    ctrl: Boolean(savedShortcut?.ctrl),
    alt: Boolean(savedShortcut?.alt),
    shift: Boolean(savedShortcut?.shift),
    meta: Boolean(savedShortcut?.meta),
    key: typeof savedShortcut?.key === "string" ? savedShortcut.key.toLowerCase() : DEFAULT_GHOST_SHORTCUT.key,
  };

  updateGhostUI();
  ghostHoldCheckbox.checked = ghost.holdMode;
  ghostShortcutButton.textContent = formatGhostShortcut(ghost.shortcut);

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

  ghostShortcutButton.onclick = () => {
    state.recordingGhostShortcut = true;
    ghostShortcutButton.textContent = "Press shortcut…";
    ghostShortcutButton.focus();
  };

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keyup", handleKeyup, true);
  window.addEventListener("blur", releaseGhostMode);

  on(EVENTS.extensionHidden, () => {
    releaseGhostMode();
    cancelShortcutRecording();
  });
}
