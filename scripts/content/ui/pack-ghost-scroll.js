// Ghost scroll (Tagging view): scrolling the mouse wheel over the pack
// switcher opens a floating "reel" of packs centered on it, without opening
// the dropdown. Each wheel step slides the reel by one pack (smoothly), so
// successive packs pass under the still pointer; the pack under the pointer
// is highlighted live and a click selects it. Spacers above and below the
// packs let the first and last pack reach the pointer row too. Hovering alone
// does nothing.
//
// The list closes with a short ease-out fade when the pointer leaves the list
// and the switcher, or after IDLE_MS without wheel or pointer movement; it
// closes at once on a choice, Escape, a pointerdown outside it, opening the
// dropdown, or turning the setting off. The dropdown itself (pack-browser.js)
// scrolls natively, with no ghost effects.
//
// Setting: Settings › Interface › "Ghost scroll on the pack selector"
// (`lazymod_ghost_scroll`, on unless it is false). Wheel events over the
// switcher and the list are handled (preventDefault) only while ghost scroll
// is on and the dropdown is closed, so the tagger body never scrolls under
// it; otherwise they are left alone.
//
// The list (#lm-pack-ghost-list) is a direct child of the tagger window, so
// the scrolling tab views never clip it; it is positioned in the window's
// unscaled coordinates (the window uses `transform: scale()`).
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { loadData, onLocalStorageChange } from "../../shared/storage.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { selectPack } from "../palettes.js";
import { searchInstalledPacks } from "../pack-manager.js";
import { $, shell } from "./shell.js";
import { el } from "./dom.js";
import { getCurrentScale } from "./window-layout.js";

const SOURCE = "ghost-scroll";
/** Without wheel or pointer movement for this long, the list fades out. */
export const GHOST_IDLE_MS = 2000;
/** Matches the ease-out opacity transition of `.lazymod-ghost-list.is-closing`. */
export const GHOST_FADE_MS = 150;
const VISIBLE_ROWS = 7;
const WINDOW_MARGIN = 4;
/** Wheel distance (px) per pack step; line-based deltas count 20 px per line. */
const STEP_PX = 50;

const view = {
  enabled: true,
  open: false,
  closeTimer: null,
  idleTimer: null,
  wheelRemainder: 0,
  pointer: { x: 0, y: 0 },
  /** Pack rows (no spacers), the pack the reel is moving to, and the row height. */
  rows: [],
  index: 0,
  rowHeight: 30,
};
let elements;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const isDropdownOpen = () => !elements.browser.hidden;
const packCount = () => Object.keys(state.paletteData?.packs || {}).length;

// --- Items and highlight ---

const spacer = (edge) => el("div", { className: "lazymod-ghost-spacer", dataset: { edge }, attrs: { "aria-hidden": "true" } });

function renderItems() {
  const activeId = state.paletteData?.activePackId;
  view.rows = searchInstalledPacks("", new Map()).map(({ packId, pack, meta }) =>
      el(
        "div",
        {
          className: `lazymod-ghost-item${packId === activeId ? " active" : ""}`,
          dataset: { packId },
          attrs: { role: "option", "aria-selected": String(packId === activeId) },
          on: { click: () => choose(packId) },
        },
        [el("span", { className: "lazymod-ghost-item-name", text: pack.name }), el("span", { className: "lazymod-ghost-item-meta", text: plural(meta.tagCount, "tag") })],
      ),
  );
  view.index = Math.max(0, view.rows.findIndex((row) => row.dataset.packId === activeId));
  elements.list.replaceChildren(spacer("top"), ...view.rows, spacer("bottom"));
}

/** Highlights the pack under the pointer (`:hover` does not follow a scroll under a still pointer). */
function updateHighlight() {
  const hit = view.open ? shell.root.elementFromPoint(view.pointer.x, view.pointer.y) : null;
  const item = hit?.closest?.(".lazymod-ghost-item") || null;
  elements.list.querySelectorAll(".lazymod-ghost-item.is-hovered").forEach((row) => {
    if (row !== item) row.classList.remove("is-hovered");
  });
  if (item && elements.list.contains(item)) item.classList.add("is-hovered");
}

// --- Open, position, close ---

/**
 * Centers the reel on the switcher (moved inside the window near its edges)
 * and sizes the spacers so pack i sits on the switcher's row at
 * scrollTop = i × rowHeight, for every pack including the first and last.
 */
function positionList() {
  const { list, toggle } = elements;
  const scale = getCurrentScale();
  const windowRect = shell.windowEl.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const windowHeight = windowRect.height / scale;
  const toggleCenter = (toggleRect.top - windowRect.top + toggleRect.height / 2) / scale;
  const rowHeight = view.rows[0]?.offsetHeight || 30;
  const height = Math.min(VISIBLE_ROWS * rowHeight, windowHeight - WINDOW_MARGIN * 2);
  const top = Math.max(WINDOW_MARGIN, Math.min(toggleCenter - height / 2, windowHeight - height - WINDOW_MARGIN));
  // Where the switcher's row is inside the reel (no top border: see tagger.css).
  const anchor = toggleCenter - top;
  list.querySelector('[data-edge="top"]').style.height = `${Math.max(0, anchor - rowHeight / 2)}px`;
  list.querySelector('[data-edge="bottom"]').style.height = `${Math.max(0, height - anchor - rowHeight / 2)}px`;
  list.style.left = `${(toggleRect.left - windowRect.left) / scale}px`;
  list.style.width = `${toggleRect.width / scale}px`;
  list.style.top = `${top}px`;
  list.style.height = `${height}px`;
  view.rowHeight = rowHeight;
  list.scrollTop = view.index * rowHeight;
}

function addOpenListeners() {
  document.addEventListener("pointerdown", handleOutsidePointer, true);
  document.addEventListener("keydown", handleKeydown, true);
}

function removeOpenListeners() {
  document.removeEventListener("pointerdown", handleOutsidePointer, true);
  document.removeEventListener("keydown", handleKeydown, true);
}

function openList() {
  clearTimeout(view.closeTimer);
  view.closeTimer = null;
  const { list } = elements;
  list.classList.remove("is-closing");
  renderItems();
  list.hidden = false;
  view.open = true;
  view.wheelRemainder = 0;
  positionList();
  addOpenListeners();
}

/** A fading list that gets the pointer or wheel back stays open. */
function cancelClosing() {
  if (!view.closeTimer) return;
  clearTimeout(view.closeTimer);
  view.closeTimer = null;
  elements.list.classList.remove("is-closing");
  view.open = true;
  addOpenListeners();
}

function finishClose() {
  clearTimeout(view.closeTimer);
  view.closeTimer = null;
  elements.list.hidden = true;
  elements.list.classList.remove("is-closing");
  elements.list.replaceChildren();
  view.rows = [];
}

function close({ animate = true } = {}) {
  clearTimeout(view.idleTimer);
  if (view.open) {
    view.open = false;
    removeOpenListeners();
    if (animate) {
      elements.list.classList.add("is-closing");
      view.closeTimer = setTimeout(finishClose, GHOST_FADE_MS);
      return;
    }
  }
  if (!elements.list.hidden) finishClose();
}

function restartIdle() {
  clearTimeout(view.idleTimer);
  view.idleTimer = setTimeout(() => close(), GHOST_IDLE_MS);
}

function choose(packId) {
  close({ animate: false });
  if (packId === state.paletteData?.activePackId) return;
  if (selectPack(packId)) emit(EVENTS.paletteChanged, { source: SOURCE });
}

// --- Input ---

function wheelPixels(event) {
  if (event.deltaMode === 1) return event.deltaY * 20;
  if (event.deltaMode === 2) return event.deltaY * 400;
  return event.deltaY;
}

/** Smooth slides, except with Reduce visual effects or reduced motion. */
function scrollBehavior() {
  const reduced = shell.host.classList.contains("lm-reduced-effects") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "auto" : "smooth";
}

/** Slides the reel by whole packs; small touchpad deltas add up. */
function scrollByWheel(event) {
  view.wheelRemainder += wheelPixels(event);
  const steps = Math.trunc(view.wheelRemainder / STEP_PX) || (Math.abs(view.wheelRemainder) >= STEP_PX / 2 ? Math.sign(view.wheelRemainder) : 0);
  if (!steps) return;
  view.wheelRemainder -= steps * STEP_PX;
  // At either end, the reel stops (and the remainder does not build up).
  const next = Math.max(0, Math.min(view.rows.length - 1, view.index + steps));
  if (next === view.index) {
    view.wheelRemainder = 0;
    return;
  }
  view.index = next;
  elements.list.scrollTo({ top: next * view.rowHeight, behavior: scrollBehavior() });
}

function handleWheel(event) {
  if (!view.enabled || isDropdownOpen() || !packCount()) return;
  event.preventDefault();
  view.pointer = { x: event.clientX, y: event.clientY };
  if (view.closeTimer) cancelClosing();
  if (!view.open) openList();
  scrollByWheel(event);
  updateHighlight();
  restartIdle();
}

function handlePointerMove(event) {
  view.pointer = { x: event.clientX, y: event.clientY };
  if (view.closeTimer) cancelClosing();
  if (!view.open) return;
  updateHighlight();
  restartIdle();
}

/** Leaving both the list and the switcher fades the list out. */
function handlePointerLeave(event) {
  if (!view.open) return;
  const to = event.relatedTarget;
  if (to instanceof Node && (elements.list.contains(to) || elements.toggle.contains(to))) return;
  close();
}

function handleOutsidePointer(event) {
  if (!event.composedPath().includes(elements.list)) close();
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  close();
}

// --- Setting ---

function applyEnabled(enabled) {
  view.enabled = enabled;
  elements.checkbox.checked = enabled;
  if (!enabled) close({ animate: false });
}

export async function initPackGhostScroll() {
  elements = {
    toggle: $("#lm-pack-switcher"),
    browser: $("#lm-pack-browser"),
    list: $("#lm-pack-ghost-list"),
    checkbox: $("#lm-ghost-scroll"),
  };
  applyEnabled((await loadData(STORAGE_KEYS.ghostScroll, true)) !== false);

  elements.toggle.addEventListener("wheel", handleWheel, { passive: false });
  elements.list.addEventListener("wheel", handleWheel, { passive: false });
  elements.list.addEventListener("scroll", updateHighlight, { passive: true });
  elements.list.addEventListener("pointermove", handlePointerMove);
  elements.list.addEventListener("pointerleave", handlePointerLeave);
  elements.toggle.addEventListener("pointerleave", handlePointerLeave);
  // Opening the dropdown replaces the ghost list.
  elements.toggle.addEventListener("click", () => close({ animate: false }));

  elements.checkbox.addEventListener("change", () => {
    applyEnabled(elements.checkbox.checked);
    chrome.storage.local.set({ [STORAGE_KEYS.ghostScroll]: elements.checkbox.checked }).catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the ghost scroll setting.`, error);
    });
  });
  // Same setting in every tab.
  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.ghostScroll]) applyEnabled(changes[STORAGE_KEYS.ghostScroll].newValue !== false);
  });
  on(EVENTS.extensionHidden, () => close({ animate: false }));
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== SOURCE && view.open) close({ animate: false });
  });
}
