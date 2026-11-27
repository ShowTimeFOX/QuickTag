// Ghost scroll: scrolling the mouse wheel over a pack selector opens a
// floating "reel" of packs centered on it, without opening the selector's
// own list. Each wheel step slides the reel by one pack (smoothly), so
// successive packs pass under the still pointer; the pack under the pointer
// is highlighted (slightly raised) and a click selects it. Spacers above and
// below the packs let the first and last pack reach the pointer row too.
// Hovering alone does nothing.
//
// Used by the tagger's pack switcher (initPackGhostScroll, reel
// #lm-pack-ghost-list in the tagger window) and the Focus Mode pack <select>
// (focus-palette.js calls attachGhostScroll, reel inside #lm-focus-root). One
// core does the steps, highlight, positioning, and closing for both; only one
// reel is open at a time.
//
// The reel closes with a short ease-out fade when the pointer leaves the reel
// and its selector, or after GHOST_IDLE_MS without wheel or pointer movement;
// it closes at once on a choice, Escape, a pointerdown outside it, opening the
// tagger dropdown, hiding the extension, or turning the setting off. The
// selectors' own lists keep scrolling natively.
//
// Setting: Settings › Interface › "Ghost scroll on the pack selector"
// (`lazymod_ghost_scroll`, on unless it is false), for both selectors. Wheel
// events are handled (preventDefault) only while ghost scroll is on and the
// selector is not blocked (the tagger dropdown is closed); otherwise they are
// left alone.
//
// The reel lives in a positioned container (the tagger window, which uses
// `transform: scale()`, or the Focus Mode overlay, which uses CSS `zoom`), so
// scrolling views never clip it. It measures the container's scale and origin
// by placing itself as a 100 px probe, then positions itself in the
// container's own CSS pixels; this works for both kinds of scaling.
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { loadData, onLocalStorageChange } from "../../shared/storage.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { selectPack } from "../palettes.js";
import { searchInstalledPacks } from "../pack-manager.js";
import { $, shell } from "./shell.js";
import { el } from "./dom.js";

const SOURCE = "ghost-scroll";
/** Without wheel or pointer movement for this long, the reel fades out. */
export const GHOST_IDLE_MS = 2000;
/** Matches the ease-out opacity transition of `.lazymod-ghost-list.is-closing`. */
export const GHOST_FADE_MS = 150;
const VISIBLE_ROWS = 7;
const CONTAINER_MARGIN = 4;
/**
 * Wheel steps: a mouse notch (a line/page-based delta, or one pixel delta of
 * at least NOTCH_MIN_PX) moves exactly one pack, whatever its size. Smaller
 * pixel deltas (touchpads) add up to TOUCHPAD_STEP_PX and then move one pack,
 * at most once per TOUCHPAD_COOLDOWN_MS; a change of direction starts over.
 */
const NOTCH_MIN_PX = 50;
const TOUCHPAD_STEP_PX = 40;
const TOUCHPAD_COOLDOWN_MS = 90;

const settings = { enabled: true, checkbox: null };
/** The open (or fading) reel, if any. */
let current = null;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const packCount = () => Object.keys(state.paletteData?.packs || {}).length;
const spacer = (edge) => el("div", { className: "lazymod-ghost-spacer", dataset: { edge }, attrs: { "aria-hidden": "true" } });

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

/**
 * Wires one selector to a reel element.
 * @param {object} options
 * @param {HTMLElement} options.trigger The pack selector (button or <select>).
 * @param {HTMLElement} options.list The reel element (`.lazymod-ghost-list`, role listbox), a child of a positioned container.
 * @param {() => boolean} [options.isBlocked] True while the wheel must be left alone (e.g. the selector's own list is open).
 * @param {() => void} [options.onOpen] Called when the reel opens (Focus Mode registers it for Escape).
 * @param {() => void} [options.onClose] Called when the reel starts closing.
 * @returns {{ close: (options?: { animate?: boolean }) => void }}
 */
export function attachGhostScroll({ trigger, list, isBlocked = () => false, onOpen = () => {}, onClose = () => {} }) {
  const reel = {
    open: false,
    closeTimer: null,
    idleTimer: null,
    wheelRemainder: 0,
    lastTouchpadStep: 0,
    pointer: { x: 0, y: 0 },
    rows: [],
    index: 0,
    rowHeight: 30,
  };

  // --- Items and highlight ---

  function renderItems() {
    const activeId = state.paletteData?.activePackId;
    reel.rows = searchInstalledPacks("", new Map()).map(({ packId, pack, meta }) =>
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
    reel.index = Math.max(0, reel.rows.findIndex((row) => row.dataset.packId === activeId));
    list.replaceChildren(spacer("top"), ...reel.rows, spacer("bottom"));
  }

  /** Highlights the pack under the pointer (`:hover` does not follow a scroll under a still pointer). */
  function updateHighlight() {
    const hit = reel.open ? shell.root.elementFromPoint(reel.pointer.x, reel.pointer.y) : null;
    const item = hit?.closest?.(".lazymod-ghost-item") || null;
    list.querySelectorAll(".lazymod-ghost-item.is-hovered").forEach((row) => {
      if (row !== item) row.classList.remove("is-hovered");
    });
    if (item && list.contains(item)) item.classList.add("is-hovered");
  }

  // --- Position ---

  /** The container's scale and the viewport point of its (0, 0), measured with the reel as a 100 px probe. */
  function measureContainer() {
    Object.assign(list.style, { left: "0px", top: "0px", width: "100px", height: "100px" });
    const probe = list.getBoundingClientRect();
    return { x: probe.left, y: probe.top, scale: probe.width / 100 || 1 };
  }

  /**
   * Centers the reel on the selector (kept inside the container and the
   * viewport) and sizes the spacers so pack i sits on the selector's row at
   * scrollTop = i × rowHeight, for every pack including the first and last.
   */
  function positionList() {
    const { x, y, scale } = measureContainer();
    const container = list.offsetParent?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
    const triggerRect = trigger.getBoundingClientRect();
    const toLocalY = (viewportY) => (viewportY - y) / scale;
    const minTop = toLocalY(Math.max(container.top, 0)) + CONTAINER_MARGIN;
    const maxBottom = toLocalY(Math.min(container.bottom, window.innerHeight)) - CONTAINER_MARGIN;
    const rowHeight = (reel.rows[0]?.getBoundingClientRect().height || 30 * scale) / scale;
    const triggerCenter = toLocalY(triggerRect.top + triggerRect.height / 2);
    const height = Math.min(VISIBLE_ROWS * rowHeight, maxBottom - minTop);
    const top = Math.max(minTop, Math.min(triggerCenter - height / 2, maxBottom - height));
    // Where the selector's row is inside the reel (no top border: see tagger.css).
    const anchor = triggerCenter - top;
    list.querySelector('[data-edge="top"]').style.height = `${Math.max(0, anchor - rowHeight / 2)}px`;
    list.querySelector('[data-edge="bottom"]').style.height = `${Math.max(0, height - anchor - rowHeight / 2)}px`;
    Object.assign(list.style, {
      left: `${(triggerRect.left - x) / scale}px`,
      width: `${triggerRect.width / scale}px`,
      top: `${top}px`,
      height: `${height}px`,
    });
    reel.rowHeight = rowHeight;
    list.scrollTop = reel.index * rowHeight;
  }

  // --- Open and close ---

  function addOpenListeners() {
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.addEventListener("keydown", handleKeydown, true);
  }

  function removeOpenListeners() {
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
    document.removeEventListener("keydown", handleKeydown, true);
  }

  function openReel() {
    if (current && current !== api) current.close({ animate: false });
    current = api;
    clearTimeout(reel.closeTimer);
    reel.closeTimer = null;
    list.classList.remove("is-closing");
    renderItems();
    list.hidden = false;
    reel.open = true;
    reel.wheelRemainder = 0;
    reel.lastTouchpadStep = 0;
    positionList();
    addOpenListeners();
    onOpen();
  }

  /** A fading reel that gets the pointer or wheel back stays open. */
  function cancelClosing() {
    if (!reel.closeTimer) return;
    clearTimeout(reel.closeTimer);
    reel.closeTimer = null;
    list.classList.remove("is-closing");
    reel.open = true;
    addOpenListeners();
    onOpen();
  }

  function finishClose() {
    clearTimeout(reel.closeTimer);
    reel.closeTimer = null;
    list.hidden = true;
    list.classList.remove("is-closing");
    list.replaceChildren();
    reel.rows = [];
    if (current === api) current = null;
  }

  function close({ animate = true } = {}) {
    clearTimeout(reel.idleTimer);
    if (reel.open) {
      reel.open = false;
      removeOpenListeners();
      onClose();
      if (animate) {
        list.classList.add("is-closing");
        reel.closeTimer = setTimeout(finishClose, GHOST_FADE_MS);
        return;
      }
    }
    if (!list.hidden) finishClose();
  }

  function restartIdle() {
    clearTimeout(reel.idleTimer);
    reel.idleTimer = setTimeout(() => close(), GHOST_IDLE_MS);
  }

  function choose(packId) {
    close({ animate: false });
    if (packId === state.paletteData?.activePackId) return;
    if (selectPack(packId)) emit(EVENTS.paletteChanged, { source: SOURCE });
  }

  // --- Input ---

  /** -1, 0, or 1: the pack step for this wheel event (see NOTCH_MIN_PX). */
  function wheelStep(event) {
    const pixels = wheelPixels(event);
    if (!pixels) return 0;
    const direction = Math.sign(pixels);
    if (event.deltaMode !== 0 || Math.abs(pixels) >= NOTCH_MIN_PX) {
      reel.wheelRemainder = 0;
      return direction;
    }
    if (Math.sign(reel.wheelRemainder) !== direction) reel.wheelRemainder = 0;
    reel.wheelRemainder += pixels;
    if (Math.abs(reel.wheelRemainder) < TOUCHPAD_STEP_PX) return 0;
    const now = performance.now();
    if (now - reel.lastTouchpadStep < TOUCHPAD_COOLDOWN_MS) {
      // Too soon after the last step: hold at the threshold, never queue steps.
      reel.wheelRemainder = direction * TOUCHPAD_STEP_PX;
      return 0;
    }
    reel.lastTouchpadStep = now;
    reel.wheelRemainder = 0;
    return direction;
  }

  /** Slides the reel by one pack per wheel step; it stops at both ends. */
  function scrollByWheel(event) {
    const next = Math.max(0, Math.min(reel.rows.length - 1, reel.index + wheelStep(event)));
    if (next === reel.index) return;
    reel.index = next;
    list.scrollTo({ top: next * reel.rowHeight, behavior: scrollBehavior() });
  }

  function handleWheel(event) {
    if (!settings.enabled || isBlocked() || !packCount()) return;
    event.preventDefault();
    reel.pointer = { x: event.clientX, y: event.clientY };
    if (reel.closeTimer) cancelClosing();
    if (!reel.open) openReel();
    scrollByWheel(event);
    updateHighlight();
    restartIdle();
  }

  function handlePointerMove(event) {
    reel.pointer = { x: event.clientX, y: event.clientY };
    if (reel.closeTimer) cancelClosing();
    if (!reel.open) return;
    updateHighlight();
    restartIdle();
  }

  /** Leaving both the reel and the selector fades the reel out. */
  function handlePointerLeave(event) {
    if (!reel.open) return;
    const to = event.relatedTarget;
    if (to instanceof Node && (list.contains(to) || trigger.contains(to))) return;
    close();
  }

  function handleOutsidePointer(event) {
    if (!event.composedPath().includes(list)) close();
  }

  function handleKeydown(event) {
    if (event.key !== "Escape" || !reel.open) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  trigger.addEventListener("wheel", handleWheel, { passive: false });
  list.addEventListener("wheel", handleWheel, { passive: false });
  list.addEventListener("scroll", updateHighlight, { passive: true });
  list.addEventListener("pointermove", handlePointerMove);
  list.addEventListener("pointerleave", handlePointerLeave);
  trigger.addEventListener("pointerleave", handlePointerLeave);

  const api = { close };
  return api;
}

// --- Setting (shared by every selector) ---

function applyEnabled(enabled) {
  settings.enabled = enabled;
  settings.checkbox.checked = enabled;
  if (!enabled) current?.close({ animate: false });
}

/** The setting, and ghost scroll for the tagger's pack switcher. */
export async function initPackGhostScroll() {
  settings.checkbox = $("#lm-ghost-scroll");
  applyEnabled((await loadData(STORAGE_KEYS.ghostScroll, true)) !== false);

  const toggle = $("#lm-pack-switcher");
  const browser = $("#lm-pack-browser");
  const tagger = attachGhostScroll({ trigger: toggle, list: $("#lm-pack-ghost-list"), isBlocked: () => !browser.hidden });
  // Opening the dropdown replaces the reel.
  toggle.addEventListener("click", () => tagger.close({ animate: false }));

  settings.checkbox.addEventListener("change", () => {
    applyEnabled(settings.checkbox.checked);
    chrome.storage.local.set({ [STORAGE_KEYS.ghostScroll]: settings.checkbox.checked }).catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the ghost scroll setting.`, error);
    });
  });
  // Same setting in every tab.
  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.ghostScroll]) applyEnabled(changes[STORAGE_KEYS.ghostScroll].newValue !== false);
  });
  on(EVENTS.extensionHidden, () => current?.close({ animate: false }));
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== SOURCE) current?.close({ animate: false });
  });
}
