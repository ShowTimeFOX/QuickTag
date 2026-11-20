// Focus Mode: a full-viewport tagging workspace inside the tagger's Shadow DOM.
//
// - Panels (top bar, image, tags, palette) are placed on a CSS grid described
//   by the layout JSON (shared/focus-layout.js, `lazymod_focus_layout`).
// - Shortcuts (default Alt+A toggle, Esc close) and their capture priority
//   come from `lazymod_focus_settings`; view preferences from
//   `lazymod_focus_prefs`.
// - The close shortcut first dismisses the topmost open menu or dialog
//   (see pushDismissable), and only then exits Focus Mode.
// - Panels get an `api` object instead of importing this module.
import { LOG_PREFIX, STORAGE_KEYS, DEFAULT_FOCUS_SETTINGS, DEFAULT_FOCUS_PREFS, FOCUS_TAG_VIEWS, FOCUS_IMAGE_ZOOMS, FOCUS_SCALE_RANGE } from "../../shared/constants.js";
import { loadData, saveData, onLocalStorageChange } from "../../shared/storage.js";
import { isRecord } from "../../shared/validation.js";
import { matchesShortcut, normalizeShortcut } from "../../shared/shortcuts.js";
import { FOCUS_PANELS, createDefaultFocusLayout, normalizeFocusLayout } from "../../shared/focus-layout.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { initFocusTags, loadFromPage } from "../focus-tags.js";
import { $, shell } from "./shell.js";
import { el } from "./dom.js";
import { createFocusTopbar } from "./focus-topbar.js";
import { createFocusImagePanel } from "./focus-image.js";
import { createFocusTagsPanel } from "./focus-tags-panel.js";
import { createFocusPalettePanel } from "./focus-palette.js";
import { createLayoutDialog } from "./focus-layout-dialog.js";
import { createLayoutEditor } from "./focus-layout-editor.js";
import { initFocusSettings } from "./focus-settings.js";

// Theme tokens copied from the tagger window, whose theme rules are scoped to
// #lazymod-window. Copying the computed values keeps Focus Mode in sync with
// every theme, including the custom accent.
const THEME_VARIABLES = [
  "--lm-bg",
  "--lm-surface",
  "--lm-surface-raised",
  "--lm-border",
  "--lm-text",
  "--lm-muted",
  "--lm-accent",
  "--lm-accent-soft",
  "--lm-danger",
  "--lm-success",
  "--lm-theme-input",
  "--lm-theme-chip",
  "--lm-theme-chip-border",
];

const focus = {
  settings: structuredClone(DEFAULT_FOCUS_SETTINGS),
  layout: createDefaultFocusLayout(),
  prefs: { ...DEFAULT_FOCUS_PREFS },
  root: null,
  grid: null,
  panels: {},
  dialog: null,
  editor: null,
  dismissStack: [],
  previousOverflow: null,
  previousFocus: null,
  keyTarget: null,
  statusTimer: null,
};

const handledEvents = new WeakSet();

// --- Settings, preferences, layout ---

function normalizeSettings(raw) {
  const settings = isRecord(raw) ? raw : {};
  return {
    toggleShortcut: normalizeShortcut(settings.toggleShortcut, DEFAULT_FOCUS_SETTINGS.toggleShortcut),
    closeShortcut: normalizeShortcut(settings.closeShortcut, DEFAULT_FOCUS_SETTINGS.closeShortcut),
    strictCapture: typeof settings.strictCapture === "boolean" ? settings.strictCapture : DEFAULT_FOCUS_SETTINGS.strictCapture,
  };
}

function normalizePrefs(raw) {
  const prefs = isRecord(raw) ? raw : {};
  return {
    liveSync: typeof prefs.liveSync === "boolean" ? prefs.liveSync : DEFAULT_FOCUS_PREFS.liveSync,
    tagView: FOCUS_TAG_VIEWS.includes(prefs.tagView) ? prefs.tagView : DEFAULT_FOCUS_PREFS.tagView,
    imageZoom: FOCUS_IMAGE_ZOOMS.includes(prefs.imageZoom) ? prefs.imageZoom : DEFAULT_FOCUS_PREFS.imageZoom,
    scale: isValidFocusScale(prefs.scale) ? prefs.scale : DEFAULT_FOCUS_PREFS.scale,
  };
}

function isValidFocusScale(value) {
  return value === "window" || (typeof value === "number" && value >= FOCUS_SCALE_RANGE.min && value <= FOCUS_SCALE_RANGE.max);
}

// --- Scale ---

/** The tagger's Window scale (Settings), which Focus Mode follows by default. */
function getWindowScale() {
  const value = parseFloat($("#lm-scale-slider")?.value);
  return Number.isFinite(value) ? value : 1;
}

function getFocusScale() {
  return focus.prefs.scale === "window" ? getWindowScale() : focus.prefs.scale;
}

/** CSS zoom scales the whole overlay (text, controls, gaps) while it still fills the viewport. */
function applyScale() {
  if (!focus.root) return;
  const scale = getFocusScale();
  focus.root.style.zoom = scale === 1 ? "" : String(scale);
  focus.root.dataset.scale = String(scale);
}

function setFocusScale(value) {
  setPref("scale", isValidFocusScale(value) ? value : DEFAULT_FOCUS_PREFS.scale);
  applyScale();
}

function readLayout(raw) {
  if (raw === null || raw === undefined) return createDefaultFocusLayout();
  try {
    return normalizeFocusLayout(raw);
  } catch (error) {
    console.error(`${LOG_PREFIX} Saved Focus Mode layout is invalid; using the default layout.`, error);
    return createDefaultFocusLayout();
  }
}

export function getFocusSettings() {
  return structuredClone(focus.settings);
}

async function saveFocusSettings(settings) {
  focus.settings = normalizeSettings(settings);
  attachShortcutListener();
  await chrome.storage.local.set({ [STORAGE_KEYS.focusSettings]: focus.settings });
}

function setPref(key, value) {
  focus.prefs = { ...focus.prefs, [key]: value };
  saveData(STORAGE_KEYS.focusPrefs, focus.prefs);
}

/** Validates, saves, and applies a layout. Throws user-facing errors. */
async function saveLayout(rawLayout) {
  const layout = normalizeFocusLayout(rawLayout);
  await chrome.storage.local.set({ [STORAGE_KEYS.focusLayout]: layout });
  focus.layout = layout;
  applyLayout();
  return layout;
}

function setActivePreset(presetId) {
  if (!focus.layout.presets[presetId]) return;
  saveLayout({ ...focus.layout, activePreset: presetId }).catch((error) => setStatus(`Could not save the layout: ${error.message}`, "error"));
}

function getActivePresetConfig() {
  const preset = focus.layout.presets[focus.layout.activePreset];
  const areas = preset.areas.map((row) => `"${row}"`).join(" ");
  const supported =
    CSS.supports("grid-template-columns", preset.columns) && CSS.supports("grid-template-rows", preset.rows) && CSS.supports("grid-template-areas", areas);
  if (supported) return { preset, areas };
  setStatus(`Layout "${preset.name}" uses grid sizes this browser does not support; showing the default layout.`, "error");
  const fallback = createDefaultFocusLayout().presets.default;
  return { preset: fallback, areas: fallback.areas.map((row) => `"${row}"`).join(" ") };
}

function applyLayout() {
  if (!focus.grid) return;
  const { preset, areas } = getActivePresetConfig();
  focus.grid.style.gridTemplateColumns = preset.columns;
  focus.grid.style.gridTemplateRows = preset.rows;
  focus.grid.style.gridTemplateAreas = areas;
  FOCUS_PANELS.forEach((panelId) => {
    const panel = focus.panels[panelId];
    panel.element.style.gridArea = panelId;
    panel.element.hidden = !preset.panels[panelId].visible;
  });
  focus.panels.topbar.setLayout(focus.layout);
  focus.editor?.refresh();
}

// --- Status line (top bar) ---

function setStatus(message, statusState = "info") {
  focus.panels.topbar?.setStatus(message, statusState);
  clearTimeout(focus.statusTimer);
  if (message && statusState !== "error") {
    focus.statusTimer = setTimeout(() => focus.panels.topbar?.setStatus("", "info"), 3500);
  }
}

// --- Dismiss stack (menus and dialogs close before Focus Mode exits) ---

/** Registers an open menu/dialog; returns a function to unregister it. */
function pushDismissable(close) {
  const entry = { close };
  focus.dismissStack.push(entry);
  return () => {
    focus.dismissStack = focus.dismissStack.filter((item) => item !== entry);
  };
}

function handleCloseShortcut() {
  const top = focus.dismissStack.pop();
  if (top) top.close();
  else closeFocusMode();
}

// --- Theme ---

function syncTheme() {
  if (!focus.root) return;
  const computed = getComputedStyle(shell.windowEl);
  THEME_VARIABLES.forEach((name) => {
    const value = computed.getPropertyValue(name).trim();
    if (value) focus.root.style.setProperty(name, value);
    else focus.root.style.removeProperty(name);
  });
  focus.root.dataset.theme = state.theme;
}

// --- Overlay ---

function isolateKeyboard(event) {
  // Keys typed inside Focus Mode never reach page shortcuts (bubble phase).
  // Only keydown runs shortcuts: opening Focus Mode moves focus into the
  // overlay, so the keyup of the same Alt+A press (or Esc) lands here and
  // must not toggle again.
  if (event.type === "keydown") handleShortcutKey(event, true);
  event.stopPropagation();
}

function buildOverlay() {
  focus.grid = el("div", { className: "lm-focus-grid" });
  focus.root = el("div", {
    id: "lm-focus-root",
    hidden: true,
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": "QuickTag Focus Mode", tabindex: "-1" },
  }, [focus.grid]);
  shell.root.appendChild(focus.root);

  const api = {
    root: focus.root,
    close: closeFocusMode,
    pushDismissable,
    setStatus,
    getPrefs: () => ({ ...focus.prefs }),
    setPref,
    getLayout: () => structuredClone(focus.layout),
    saveLayout,
    setActivePreset,
    openLayoutDialog: () => focus.dialog.open(),
  };
  focus.panels = {
    topbar: createFocusTopbar(api),
    image: createFocusImagePanel(api),
    tags: createFocusTagsPanel(api),
    palette: createFocusPalettePanel(api),
  };
  FOCUS_PANELS.forEach((panelId) => focus.grid.appendChild(focus.panels[panelId].element));
  focus.editor = createLayoutEditor(api, focus.panels);
  focus.panels.topbar.actions.prepend(focus.editor.button);
  focus.panels.topbar.element.appendChild(focus.editor.toolbar);
  focus.dialog = createLayoutDialog(api);
  focus.root.appendChild(focus.dialog.element);

  ["keydown", "keyup", "keypress"].forEach((type) => focus.root.addEventListener(type, isolateKeyboard));
}

function lockPageScroll() {
  const rootStyle = document.documentElement.style;
  focus.previousOverflow = { value: rootStyle.getPropertyValue("overflow"), priority: rootStyle.getPropertyPriority("overflow") };
  rootStyle.setProperty("overflow", "hidden", "important");
}

function unlockPageScroll() {
  const rootStyle = document.documentElement.style;
  if (!focus.previousOverflow) return;
  if (focus.previousOverflow.value) rootStyle.setProperty("overflow", focus.previousOverflow.value, focus.previousOverflow.priority);
  else rootStyle.removeProperty("overflow");
  focus.previousOverflow = null;
}

export function openFocusMode() {
  if (state.focusModeActive || !state.extensionEnabled || !state.extensionReady) return;
  if (!focus.root) buildOverlay();
  state.focusModeActive = true;
  syncTheme();
  applyScale();
  applyLayout();
  loadFromPage();
  focus.panels.image.refresh();
  focus.panels.palette.render();
  focus.root.hidden = false;
  lockPageScroll();
  focus.previousFocus = document.activeElement;
  focus.root.focus({ preventScroll: true });
  emit(EVENTS.focusModeChanged, { active: true });
}

export function closeFocusMode() {
  if (!state.focusModeActive) return;
  // Close menus and dialogs without exiting through the stack.
  focus.dismissStack.splice(0).reverse().forEach((entry) => entry.close());
  state.focusModeActive = false;
  focus.root.hidden = true;
  unlockPageScroll();
  const previous = focus.previousFocus;
  focus.previousFocus = null;
  if (previous?.isConnected && typeof previous.focus === "function") previous.focus({ preventScroll: true });
  emit(EVENTS.focusModeChanged, { active: false });
}

export function toggleFocusMode() {
  if (state.focusModeActive) closeFocusMode();
  else openFocusMode();
}

// --- Shortcuts ---

/**
 * Strict capture: a capture listener on `window` handles shortcuts before
 * page handlers on document/elements and stops the event.
 * Cooperative (default): a bubble listener on `document` runs after the page
 * and skips keys the page already handled (`defaultPrevented`).
 * Inside the overlay, keys are handled by the overlay itself either way.
 */
function handleShortcutKey(event, fromOverlay = false) {
  if (event.type !== "keydown" || handledEvents.has(event) || event.isComposing || !state.extensionEnabled || state.recordingShortcut || state.elementPickerActive) return;
  if (!fromOverlay && !focus.settings.strictCapture && event.defaultPrevented) return;
  const isToggle = matchesShortcut(event, focus.settings.toggleShortcut);
  const isClose = !isToggle && state.focusModeActive && matchesShortcut(event, focus.settings.closeShortcut);
  if (!isToggle && !isClose) return;

  handledEvents.add(event);
  event.preventDefault();
  event.stopPropagation();
  if (focus.settings.strictCapture) event.stopImmediatePropagation();
  // A held key repeats keydown; one press must toggle (or close) only once.
  if (event.repeat) return;
  if (isToggle) toggleFocusMode();
  else handleCloseShortcut();
}

const pageKeyListener = (event) => handleShortcutKey(event);

function attachShortcutListener() {
  if (focus.keyTarget) focus.keyTarget.target.removeEventListener("keydown", pageKeyListener, focus.keyTarget.capture);
  focus.keyTarget = focus.settings.strictCapture ? { target: window, capture: true } : { target: document, capture: false };
  focus.keyTarget.target.addEventListener("keydown", pageKeyListener, focus.keyTarget.capture);
}

// --- Init ---

export async function initFocusMode() {
  focus.settings = normalizeSettings(await loadData(STORAGE_KEYS.focusSettings, null));
  focus.prefs = normalizePrefs(await loadData(STORAGE_KEYS.focusPrefs, null));
  focus.layout = readLayout(await loadData(STORAGE_KEYS.focusLayout, null));
  initFocusTags({ liveSync: focus.prefs.liveSync });
  attachShortcutListener();

  const settingsUi = initFocusSettings({
    open: openFocusMode,
    openLayoutDialog: () => {
      openFocusMode();
      focus.dialog?.open();
    },
    getSettings: getFocusSettings,
    saveSettings: saveFocusSettings,
    getScale: () => focus.prefs.scale,
    getWindowScale,
    setScale: setFocusScale,
  });

  // Header button next to ghost mode.
  $("#lm-focus-header").addEventListener("click", openFocusMode);
  // Follow the Window scale slider live (and its saved value from other tabs).
  $("#lm-scale-slider").addEventListener("input", () => {
    if (focus.prefs.scale === "window") applyScale();
    settingsUi.render();
  });

  on(EVENTS.themeChanged, syncTheme);
  on(EVENTS.extensionHidden, closeFocusMode);

  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.focusSettings]) {
      focus.settings = normalizeSettings(changes[STORAGE_KEYS.focusSettings].newValue);
      attachShortcutListener();
      settingsUi.render();
    }
    if (changes[STORAGE_KEYS.focusLayout]) {
      focus.layout = readLayout(changes[STORAGE_KEYS.focusLayout].newValue);
      applyLayout();
    }
    // Only the scale follows other tabs. Adopting every stored pref would let
    // the late echo of this tab's own earlier write (e.g. image zoom "1:1")
    // undo a newer change made here ("Fit").
    if (changes[STORAGE_KEYS.focusPrefs]) {
      const { scale } = normalizePrefs(changes[STORAGE_KEYS.focusPrefs].newValue);
      if (scale !== focus.prefs.scale) {
        focus.prefs = { ...focus.prefs, scale };
        applyScale();
        settingsUi.render();
      }
    }
    if (changes[STORAGE_KEYS.scale]) {
      applyScale();
      settingsUi.render();
    }
  });
}
