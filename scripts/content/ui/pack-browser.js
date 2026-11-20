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
import { hubRecordsByPack, searchInstalledPacks, uninstallPack, undoUninstall } from "../pack-manager.js";
import { $, shell } from "./shell.js";
import { el } from "./dom.js";

const SOURCE = "packs";
/** Idle time after the last scroll event before the ghost overlay fades out. */
export const GHOST_IDLE_MS = 500;
const UNDO_TIMEOUT_MS = 10000;
const MATCH_LABELS = { source: "", group: "group", category: "category", tag: "tag" };

const view = {
  open: false,
  hubRecords: new Map(),
  ghostTimer: null,
  undoTimer: null,
  removal: null,
  busy: false,
  /** Last error, shown until the next action or search. */
  error: "",
  /** scrollTop the code set last; its scroll event is not a user scroll. */
  programmaticScrollTop: null,
};

let elements;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// --- Status line (counts, undo) ---

function clearUndo() {
  clearTimeout(view.undoTimer);
  view.removal = null;
}

function setStatus(children, statusState = "info") {
  elements.status.replaceChildren(...children);
  elements.status.dataset.state = statusState;
}

function renderCountStatus(shown, total, query) {
  if (view.removal) return;
  if (view.error) {
    setStatus([el("span", { text: view.error })], "error");
    return;
  }
  if (!total) setStatus([el("span", { text: "No tag packs installed. Import one or install one from Assets." })]);
  else if (!shown) setStatus([el("span", { text: `No pack matches "${query}".` })]);
  else setStatus([el("span", { text: query ? `${shown} of ${plural(total, "pack")}` : plural(total, "pack") })]);
}

function showUndo(removal) {
  clearUndo();
  view.removal = removal;
  setStatus(
    [
      el("span", { text: `Uninstalled "${removal.pack.name}".` }),
      el("button", { className: "lazymod-btn lazymod-pack-undo", id: "lm-pack-undo", text: "Undo", attrs: { type: "button" }, on: { click: handleUndo } }),
    ],
    "success",
  );
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
  const query = elements.search.value;
  const results = searchInstalledPacks(query, view.hubRecords);
  elements.list.replaceChildren(...results.map(packRow));
  elements.list.dataset.total = String(Object.keys(packs).length);
  renderCountStatus(results.length, Object.keys(packs).length, query.trim());
  endGhostScroll();
}

async function refreshHubRecords() {
  try {
    view.hubRecords = hubRecordsByPack(await loadHubInstalls());
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not read File Hub install records.`, error);
  }
  render();
}

// --- Ghost scroll ---

function updateCenteredItem() {
  const items = [...elements.list.children];
  if (!items.length) return;
  const listRect = elements.list.getBoundingClientRect();
  const centerY = listRect.top + listRect.height / 2;
  let centered = items[0];
  let bestDistance = Infinity;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      centered = item;
    }
  }
  items.forEach((item) => item.classList.toggle("is-centered", item === centered));
  const name = centered.querySelector(".lazymod-pack-item-name")?.textContent || "";
  elements.ghost.replaceChildren(
    el("span", { className: "lazymod-pack-ghost-name", text: name }),
    el("span", { className: "lazymod-pack-ghost-position", text: `${items.indexOf(centered) + 1} / ${items.length}` }),
  );
}

/** Scrolls the list from code (open, search) without triggering ghost scroll. */
function setListScrollTop(value) {
  const list = elements.list;
  const target = Math.round(Math.max(0, Math.min(value, list.scrollHeight - list.clientHeight)));
  if (Math.abs(list.scrollTop - target) < 1) return;
  view.programmaticScrollTop = target;
  list.scrollTop = target;
}

function handleListScroll() {
  const expected = view.programmaticScrollTop;
  view.programmaticScrollTop = null;
  if (expected !== null && Math.abs(elements.list.scrollTop - expected) <= 1) return;
  updateCenteredItem();
  elements.list.classList.add("is-ghost-scrolling");
  elements.ghost.dataset.visible = "true";
  clearTimeout(view.ghostTimer);
  view.ghostTimer = setTimeout(endGhostScroll, GHOST_IDLE_MS);
}

function endGhostScroll() {
  clearTimeout(view.ghostTimer);
  elements.list.classList.remove("is-ghost-scrolling");
  elements.ghost.dataset.visible = "false";
  elements.list.querySelectorAll(".is-centered").forEach((item) => item.classList.remove("is-centered"));
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
  setListScrollTop(row.offsetTop - (elements.list.clientHeight - row.offsetHeight) / 2);
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
    endGhostScroll();
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
  };
  elements.ghost.dataset.visible = "false";
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
    setListScrollTop(0);
    render();
  });
  elements.search.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !elements.search.value) return;
    event.stopPropagation();
    elements.search.value = "";
    render();
  });
  elements.list.addEventListener("scroll", handleListScroll, { passive: true });
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
