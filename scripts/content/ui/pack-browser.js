// Pack switcher (Tagging view): a button showing the active pack opens a
// dropdown panel to search all installed packs, switch packs, and uninstall
// with undo. While the list scrolls, a "ghost" overlay names the pack at the
// center and neighbors are dimmed ("ghost scroll").
//
// This replaces a native <select>: browsers close a native select popup
// whenever an ancestor scrolls (e.g. a wheel over the select scrolling the
// tagger body), and its popup cannot show ghost scroll. The panel closes only
// on a pack choice, Escape, the switcher button, or a pointerdown outside it
// (checked with composedPath(), since the tagger lives in a shadow root).
//
// Ghost scroll only listens to the list's own `scroll` events (passive, no
// wheel handling, no preventDefault). The list uses `overscroll-behavior:
// contain`, so scrolling through packs never scrolls the tagger or page.
// Motion is CSS-only and disabled under prefers-reduced-motion.
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { onLocalStorageChange } from "../../shared/storage.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { selectPack } from "../palettes.js";
import { loadHubInstalls } from "../file-hub.js";
import { UNDO_TIMEOUT_MS, hubRecordsByPack, searchInstalledPacks, uninstallPack, undoUninstall } from "../pack-manager.js";
import { attachGhostScroll } from "../../shared/ghost-scroll.js";
import { $, shell } from "./shell.js";
import { el } from "./dom.js";

const SOURCE = "packs";
const MATCH_LABELS = { source: "", group: "group", category: "category", tag: "tag" };

const view = {
  open: false,
  hubRecords: new Map(),
  undoTimer: null,
  removal: null,
  busy: false,
  /** Last error, shown until the next action or search. */
  error: "",
};

let elements;
let ghostScroll;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// --- Panel status (counts) and the notice under the switcher (undo, errors) ---

function clearUndo() {
  clearTimeout(view.undoTimer);
  view.removal = null;
}

function renderCountStatus(shown, total, query) {
  let text;
  if (!total) text = "No tag packs installed. Import one or install one from Assets.";
  else if (!shown) text = `No pack matches "${query}".`;
  else text = query ? `${shown} of ${plural(total, "pack")}` : plural(total, "pack");
  elements.status.textContent = text;
}

/**
 * Undo and errors show under the switcher, so they stay visible whether the
 * uninstall came from the list or the palette header's Uninstall button.
 */
function renderNotice() {
  const { notice } = elements;
  if (view.removal) {
    notice.replaceChildren(
      el("span", { text: `Uninstalled "${view.removal.pack.name}".` }),
      el("button", { className: "lazymod-btn lazymod-pack-undo", id: "lm-pack-undo", text: "Undo", attrs: { type: "button", disabled: view.busy }, on: { click: handleUndo } }),
      el("button", { className: "lazymod-pack-notice-close", text: "×", title: "Dismiss", attrs: { type: "button", "aria-label": "Dismiss" }, on: { click: dismissUndo } }),
    );
    notice.dataset.state = "success";
  } else if (view.error) {
    notice.replaceChildren(el("span", { text: view.error }));
    notice.dataset.state = "error";
  } else {
    notice.replaceChildren();
  }
  notice.hidden = !view.removal && !view.error;
}

/** Hides the Undo notice (the removal stays done). */
function dismissUndo() {
  clearUndo();
  render();
}

function showUndo(removal) {
  clearUndo();
  view.removal = removal;
  view.undoTimer = setTimeout(() => {
    view.removal = null;
    render();
  }, UNDO_TIMEOUT_MS);
}

// --- List ---

function packRow(result) {
  const { packId, pack, meta, match } = result;
  const isActive = packId === state.paletteData.activePackId;
  const details = [meta.version ? `${meta.source} ${meta.version}` : meta.source, plural(meta.groupCount, "group"), plural(meta.tagCount, "tag")].join(" · ");
  const hint = match.text && match.kind !== "name" ? `${MATCH_LABELS[match.kind] ? `${MATCH_LABELS[match.kind]}: ` : "matches "}${match.text}` : "";
  return el("div", { className: `lazymod-pack-item${isActive ? " active" : ""}`, dataset: { packId }, attrs: { role: "listitem" } }, [
    el(
      "button",
      {
        className: "lazymod-pack-item-select",
        title: isActive ? `${pack.name} (selected)` : `Select ${pack.name}`,
        attrs: { type: "button", "aria-current": isActive ? "true" : undefined },
        on: { click: () => handleSelect(packId) },
      },
      [
        el("span", { className: "lazymod-pack-item-name", text: pack.name }),
        el("span", { className: "lazymod-pack-item-meta", text: details }),
        hint ? el("span", { className: "lazymod-pack-item-match", text: hint }) : null,
      ],
    ),
    el("button", {
      className: "lazymod-btn lazymod-pack-uninstall",
      text: "Uninstall",
      title: `Uninstall ${pack.name}`,
      attrs: { type: "button", disabled: view.busy },
      on: { click: () => handleUninstall(packId) },
    }),
  ]);
}

/** Renders the switcher label and the list (also while closed, so both stay current). */
function render() {
  if (!elements) return;
  const packs = state.paletteData?.packs || {};
  const activePack = packs[state.paletteData?.activePackId];
  elements.current.textContent = activePack ? activePack.name : "No tag packs";
  elements.toggle.title = activePack ? `${activePack.name}: switch, search, or uninstall tag packs` : "No tag packs installed";
  elements.uninstall.disabled = !activePack || view.busy;
  elements.uninstall.title = activePack ? `Uninstall ${activePack.name} (Undo is available for 10 seconds)` : "No tag pack to uninstall";
  const query = elements.search.value;
  const results = searchInstalledPacks(query, view.hubRecords);
  elements.list.replaceChildren(...results.map(packRow));
  elements.list.dataset.total = String(Object.keys(packs).length);
  renderCountStatus(results.length, Object.keys(packs).length, query.trim());
  renderNotice();
  ghostScroll.end();
}

async function refreshHubRecords() {
  try {
    view.hubRecords = hubRecordsByPack(await loadHubInstalls());
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not read File Hub install records.`, error);
  }
  render();
}

// --- Ghost scroll (shared/ghost-scroll.js) ---

function renderGhost(item, index, total) {
  return [
    el("span", { className: "lazymod-pack-ghost-name", text: item.querySelector(".lazymod-pack-item-name")?.textContent || "" }),
    el("span", { className: "lazymod-pack-ghost-position", text: `${index + 1} / ${total}` }),
  ];
}

// --- Actions ---

function handleSelect(packId) {
  if (packId !== state.paletteData.activePackId) {
    if (!selectPack(packId)) return;
    emit(EVENTS.paletteChanged, { source: SOURCE });
  }
  setOpen(false, { restoreFocus: true });
  render();
}

/** Runs one uninstall/undo at a time; the browser is idle again before the result shows. */
async function runAction(action, failureLabel) {
  if (view.busy) return null;
  view.busy = true;
  view.error = "";
  elements.browser.dataset.busy = "true";
  render();
  let result = null;
  try {
    result = await action();
    view.hubRecords = hubRecordsByPack(await loadHubInstalls());
  } catch (error) {
    console.error(`${LOG_PREFIX} ${failureLabel}.`, error);
    view.error = `${failureLabel}: ${error.message}`;
  } finally {
    view.busy = false;
    elements.browser.dataset.busy = "false";
  }
  return result;
}

async function handleUninstall(packId) {
  const removal = await runAction(() => uninstallPack(packId, SOURCE), "Could not uninstall");
  if (removal) showUndo(removal);
  render();
}

async function handleUndo() {
  const removal = view.removal;
  if (!removal || view.busy) return;
  clearUndo();
  await runAction(() => undoUninstall(removal, SOURCE), "Could not restore");
  render();
}

/** Centers the active pack in the list without scrolling any ancestor. */
function revealActiveRow() {
  const row = elements.list.querySelector(".lazymod-pack-item.active");
  if (!row) return;
  ghostScroll.setScrollTop(row.offsetTop - (elements.list.clientHeight - row.offsetHeight) / 2);
}

function handleOutsidePointer(event) {
  const path = event.composedPath();
  if (!path.includes(elements.browser) && !path.includes(elements.toggle)) setOpen(false);
}

function setOpen(open, { restoreFocus = false } = {}) {
  if (view.open === open) return;
  view.open = open;
  elements.browser.hidden = !open;
  elements.toggle.setAttribute("aria-expanded", String(open));
  if (!open) {
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
    ghostScroll.end();
    if (restoreFocus) elements.toggle.focus({ preventScroll: true });
    return;
  }
  // Registered after the opening click, in the capture phase, so page
  // handlers that stop propagation cannot keep the panel open by accident.
  document.addEventListener("pointerdown", handleOutsidePointer, true);
  render();
  revealActiveRow();
  refreshHubRecords();
  elements.search.focus({ preventScroll: true });
}

/** Arrow keys move between packs (like a native select); Escape closes. */
function handlePanelKeydown(event) {
  if (event.key === "Escape") {
    // A non-empty search clears itself first (its own keydown handler).
    if (event.target === elements.search && elements.search.value) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false, { restoreFocus: true });
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const buttons = [...elements.list.querySelectorAll(".lazymod-pack-item-select")];
  if (!buttons.length) return;
  event.preventDefault();
  const step = event.key === "ArrowDown" ? 1 : -1;
  const current = buttons.indexOf(shell.root.activeElement);
  const next = current < 0 ? (step > 0 ? 0 : buttons.length - 1) : Math.min(buttons.length - 1, Math.max(0, current + step));
  buttons[next].focus({ preventScroll: true });
  // Keep the focused row visible by scrolling the list only.
  const row = buttons[next].closest(".lazymod-pack-item");
  const list = elements.list;
  if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
  else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
}

export function initPackBrowser() {
  elements = {
    toggle: $("#lm-pack-switcher"),
    current: $("#lm-pack-current"),
    browser: $("#lm-pack-browser"),
    search: $("#lm-pack-search"),
    list: $("#lm-pack-list"),
    ghost: $("#lm-pack-ghost"),
    status: $("#lm-pack-status"),
    notice: $("#lm-pack-notice"),
    uninstall: $("#lm-uninstall-pack"),
  };
  ghostScroll = attachGhostScroll({ list: elements.list, ghost: elements.ghost, renderGhost });
  elements.browser.dataset.busy = "false";

  elements.toggle.addEventListener("click", () => setOpen(!view.open));
  elements.toggle.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !view.open) {
      event.preventDefault();
      setOpen(true);
    }
  });
  elements.browser.addEventListener("keydown", handlePanelKeydown);
  elements.search.addEventListener("input", () => {
    view.error = "";
    ghostScroll.setScrollTop(0);
    render();
  });
  elements.search.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !elements.search.value) return;
    event.stopPropagation();
    elements.search.value = "";
    render();
  });
  // The palette header's Uninstall button acts on the selected pack.
  elements.uninstall.addEventListener("click", () => {
    if (state.paletteData?.activePackId && state.paletteData.packs[state.paletteData.activePackId]) handleUninstall(state.paletteData.activePackId);
  });
  on(EVENTS.extensionHidden, () => setOpen(false));
  refreshHubRecords();

  // Pack changes from any view (tagger selector, Focus Mode, Assets, other tabs).
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== SOURCE) render();
  });
  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.hubPackages]) refreshHubRecords();
    else if (changes[STORAGE_KEYS.palettes]) render();
  });
}
