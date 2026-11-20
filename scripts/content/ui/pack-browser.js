// Pack browser (Tagging view, "Browse"): search all installed packs, switch
// packs, and uninstall with undo. While the list scrolls, a "ghost" overlay
// names the pack at the center and neighbors are dimmed ("ghost scroll").
//
// Ghost scroll only listens to the list's own `scroll` events (passive, no
// wheel handling, no preventDefault), so page scrolling is never captured.
// Motion is CSS-only and disabled under prefers-reduced-motion.
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { onLocalStorageChange } from "../../shared/storage.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { selectPack } from "../palettes.js";
import { loadHubInstalls } from "../file-hub.js";
import { hubRecordsByPack, searchInstalledPacks, uninstallPack, undoUninstall } from "../pack-manager.js";
import { $ } from "./shell.js";
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

function render() {
  if (!view.open || !elements) return;
  const query = elements.search.value;
  const results = searchInstalledPacks(query, view.hubRecords);
  elements.list.replaceChildren(...results.map(packRow));
  renderCountStatus(results.length, Object.keys(state.paletteData?.packs || {}).length, query.trim());
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

function handleListScroll() {
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
  if (!selectPack(packId)) return;
  emit(EVENTS.paletteChanged, { source: SOURCE });
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

function setOpen(open) {
  view.open = open;
  elements.browser.hidden = !open;
  elements.toggle.setAttribute("aria-expanded", String(open));
  if (!open) {
    endGhostScroll();
    return;
  }
  refreshHubRecords();
  elements.search.focus({ preventScroll: true });
}

export function initPackBrowser() {
  elements = {
    toggle: $("#lm-pack-browse"),
    browser: $("#lm-pack-browser"),
    search: $("#lm-pack-search"),
    list: $("#lm-pack-list"),
    ghost: $("#lm-pack-ghost"),
    status: $("#lm-pack-status"),
  };
  elements.ghost.dataset.visible = "false";
  elements.browser.dataset.busy = "false";

  elements.toggle.addEventListener("click", () => setOpen(!view.open));
  elements.search.addEventListener("input", () => {
    view.error = "";
    elements.list.scrollTop = 0;
    render();
  });
  elements.search.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !elements.search.value) return;
    event.stopPropagation();
    elements.search.value = "";
    render();
  });
  elements.list.addEventListener("scroll", handleListScroll, { passive: true });

  // Pack changes from any view (tagger selector, Focus Mode, Assets, other tabs).
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== SOURCE) render();
  });
  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.hubPackages]) refreshHubRecords();
    else if (changes[STORAGE_KEYS.palettes]) render();
  });
}
