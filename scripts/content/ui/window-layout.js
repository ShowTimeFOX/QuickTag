// Tagger window geometry: per-origin layout persistence, docking, and scale.
//
// Saved per origin under `lazymod_site_layout_<origin>`:
//   { docked, dockPosition, visible?, position?: { top, left } }
// Window scale and size are global (`lazymod_scale`, `lazymod_win_size`).
import { LOG_PREFIX, STORAGE_KEYS, DOCK_EDGES, DEFAULT_DOCK_EDGE, DEFAULT_WINDOW_POSITION } from "../../shared/constants.js";
import { loadData } from "../../shared/storage.js";
import { isValidPageLayout } from "../../shared/validation.js";
import { state } from "../state.js";
import { getPageLayoutId, restoreBodyMargins, setBodyMargin } from "../page.js";
import { $, shell } from "./shell.js";
import { setConfigStatus } from "./status.js";

const VIEWPORT_MARGIN = 12;
const SIDE_DOCK_WIDTH = 400;
const HORIZONTAL_DOCK_HEIGHT_RATIO = 0.42;

export const layout = {
  storageKey: "",
  /** Last successfully saved page layout, or null if none was saved yet. */
  saved: null,
  dockPosition: DEFAULT_DOCK_EDGE,
  docked: false,
  /** Floating position used when no per-page position is saved. */
  fallbackPosition: DEFAULT_WINDOW_POSITION,
};

export function isSideDock() {
  return layout.dockPosition === "left" || layout.dockPosition === "right";
}

export function isWindowDocked() {
  return shell.windowEl.classList.contains("docked");
}

export function getCurrentScale() {
  return parseFloat($("#lm-scale-slider").value) || 1;
}

/** Merges `changes` into the saved page layout. Errors are shown, not thrown. */
export function persistPageLayout(changes) {
  const updatedLayout = { ...layout.saved, ...changes };
  return chrome.storage.local
    .set({ [layout.storageKey]: updatedLayout })
    .then(() => {
      layout.saved = updatedLayout;
    })
    .catch((error) => {
      console.error(`${LOG_PREFIX} Could not save this page's window layout.`, error);
      setConfigStatus(`Could not save page layout: ${error.message}`, "error");
    });
}

export function persistFloatingPosition() {
  const { windowEl } = shell;
  return persistPageLayout({ position: { top: windowEl.style.top, left: windowEl.style.left } });
}

export function applyDockPositionClass() {
  shell.windowEl.classList.remove(...DOCK_EDGES.map((edge) => `docked-${edge}`));
  shell.windowEl.classList.add(`docked-${layout.dockPosition}`);
}

/** Reserves page space next to a docked tagger by setting a body margin. */
export function updateDockPageSpace() {
  const { windowEl } = shell;
  restoreBodyMargins();
  if (!state.extensionEnabled || !windowEl.classList.contains("docked") || windowEl.hidden) return;

  const rect = windowEl.getBoundingClientRect();
  setBodyMargin(layout.dockPosition, `${Math.ceil(isSideDock() ? rect.width : rect.height)}px`);
}

/** Applies a clamped scale and keeps the window inside the viewport. */
export function applyWindowScale(requestedScale) {
  const { windowEl } = shell;
  const slider = $("#lm-scale-slider");
  const scale = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), requestedScale));

  slider.value = String(scale);
  $("#lm-scale-value").textContent = `${Math.round(scale * 100)}%`;
  windowEl.style.setProperty("--lm-window-scale", String(scale));
  windowEl.style.transform = `scale(${scale})`;
  windowEl.style.maxWidth = `${Math.max(1, window.innerWidth - VIEWPORT_MARGIN * 2) / scale}px`;

  if (isWindowDocked()) {
    const sideDock = isSideDock();
    // Side docks never exceed the viewport, whatever the scale.
    const dockedWidth = sideDock ? Math.min(SIDE_DOCK_WIDTH, window.innerWidth / scale) : window.innerWidth / scale;
    const dockedHeight = sideDock ? window.innerHeight / scale : (window.innerHeight * HORIZONTAL_DOCK_HEIGHT_RATIO) / scale;
    windowEl.style.setProperty("--lm-docked-width", `${dockedWidth}px`);
    windowEl.style.setProperty("--lm-docked-height", `${dockedHeight}px`);
    windowEl.style.maxWidth = `${window.innerWidth / scale}px`;
    windowEl.style.maxHeight = `${window.innerHeight / scale}px`;
    windowEl.style.transformOrigin = {
      left: "left top",
      right: "right top",
      top: "left top",
      bottom: "left bottom",
    }[layout.dockPosition];
    updateDockPageSpace();
    return scale;
  }

  const margin = VIEWPORT_MARGIN;
  windowEl.style.maxHeight = `${Math.max(1, window.innerHeight - margin * 2) / scale}px`;
  windowEl.style.transformOrigin = "top right";
  const rect = windowEl.getBoundingClientRect();
  let left = parseFloat(windowEl.style.left) || rect.left;
  let top = parseFloat(windowEl.style.top) || rect.top;
  if (rect.left < margin) left += (margin - rect.left) / scale;
  if (rect.right > window.innerWidth - margin) left -= (rect.right - (window.innerWidth - margin)) / scale;
  if (rect.top < margin) top += (margin - rect.top) / scale;
  if (rect.bottom > window.innerHeight - margin) top -= (rect.bottom - (window.innerHeight - margin)) / scale;
  windowEl.style.left = `${Math.max(margin / scale, left)}px`;
  windowEl.style.top = `${Math.max(margin / scale, top)}px`;
  windowEl.style.right = "auto";
  return scale;
}

/** Restores this page's saved layout before the tagger is revealed. */
export async function restoreWindowLayout() {
  const { windowEl } = shell;
  layout.storageKey = `${STORAGE_KEYS.siteLayoutPrefix}${encodeURIComponent(getPageLayoutId())}`;

  let saved = await loadData(layout.storageKey, null);
  if (saved !== null && !isValidPageLayout(saved)) {
    console.error(`${LOG_PREFIX} Saved page layout is invalid; using defaults.`);
    saved = null;
  }
  layout.saved = saved;
  layout.dockPosition = DOCK_EDGES.includes(saved?.dockPosition) ? saved.dockPosition : DEFAULT_DOCK_EDGE;
  layout.docked = Boolean(saved?.docked);

  const savedScale = parseFloat(await loadData(STORAGE_KEYS.scale, 1));
  const savedSize = await loadData(STORAGE_KEYS.windowSize, null);
  layout.fallbackPosition = saved?.position || (await loadData(STORAGE_KEYS.windowPosition, DEFAULT_WINDOW_POSITION));

  // A page starts hidden (edge handle only) until visibility is saved for it.
  windowEl.hidden = saved?.visible !== true;

  if (savedSize && Number.isFinite(savedSize.width) && savedSize.width > 0) {
    windowEl.style.width = `${savedSize.width}px`;
  }
  if (savedSize && Number.isFinite(savedSize.height) && savedSize.height > 0) {
    windowEl.style.height = `${savedSize.height}px`;
  }
  if (layout.docked) {
    windowEl.classList.add("docked");
    applyDockPositionClass();
  } else {
    windowEl.style.top = layout.fallbackPosition.top;
    windowEl.style.left = layout.fallbackPosition.left;
  }
  applyWindowScale(Number.isFinite(savedScale) ? savedScale : 1);
}
