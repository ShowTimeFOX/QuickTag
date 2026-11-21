// Pack switcher checks (dropdown stability with real mouse and wheel input,
// search across installed packs, ghost scroll, uninstall with undo), shared
// by chrome.mjs and firefox.mjs. Runs after assets-checks.mjs,
// so the mock File Hub packs "Mock Hub Pack" and "Fallback Pack" are installed.
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const GHOST_PACKS = Array.from({ length: 12 }, (_, index) => `Ghost Pack ${String(index + 1).padStart(2, "0")}`);
const ghostTag = (name) => `ghost_tag_${name.slice(-2)}`;

const importPack = (name) => `(() => {
  const input = ${ROOT}.querySelector("#lm-pack-file");
  const transfer = new DataTransfer();
  const json = JSON.stringify({ name: ${JSON.stringify(name)}, groups: { "Ghost Group": { "Ghost Category": [${JSON.stringify(ghostTag(name))}, "shared_ghost_tag"] } } });
  transfer.items.add(new File([json], "pack.json", { type: "application/json" }));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`;

const SHOW_TAGGING = `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  root.querySelector("#lm-tab-btn-main").click();
  return true;
})()`;

const PACK_STATE = `(() => {
  const root = ${ROOT};
  const list = root.querySelector("#lm-pack-list");
  const body = root.querySelector("#lazymod-body");
  const ghost = root.querySelector("#lm-pack-ghost");
  const status = root.querySelector("#lm-pack-status");
  const items = [...list.querySelectorAll(".lazymod-pack-item")];
  const centered = list.querySelector(".is-centered");
  const neighbor = centered && (centered.previousElementSibling || centered.nextElementSibling);
  // Rendered size (ghost scroll scales names with a transform).
  const nameSize = (item) => (item ? item.querySelector(".lazymod-pack-item-name").getBoundingClientRect().height : 0);
  return {
    open: !root.querySelector("#lm-pack-browser").hidden,
    expanded: root.querySelector("#lm-pack-switcher").getAttribute("aria-expanded"),
    focusInPanel: root.querySelector("#lm-pack-browser").contains(root.activeElement),
    focusOnSwitcher: root.activeElement === root.querySelector("#lm-pack-switcher"),
    total: Number(list.dataset.total),
    bodyScrollTop: body.scrollTop,
    listScrollTop: list.scrollTop,
    items: items.map((item) => ({ id: item.dataset.packId, name: item.querySelector(".lazymod-pack-item-name").textContent, match: item.querySelector(".lazymod-pack-item-match")?.textContent || "", active: item.classList.contains("active") })),
    status: status.textContent,
    statusState: status.dataset.state || "",
    hasUndo: Boolean(root.querySelector("#lm-pack-undo")),
    notice: root.querySelector("#lm-pack-notice").hidden ? "" : root.querySelector("#lm-pack-notice").textContent,
    noticeVisible: root.querySelector("#lm-pack-notice").getBoundingClientRect().height > 0,
    headerUninstall: (() => { const button = root.querySelector("#lm-uninstall-pack"); return { label: button.textContent.trim(), disabled: button.disabled }; })(),
    hasDeleteButton: Boolean(root.querySelector("#lm-delete-pack")),
    idle: root.querySelector("#lm-pack-browser").dataset.busy === "false",
    // The list is rendered while closed too; without a search it holds every pack.
    options: items.map((item) => item.querySelector(".lazymod-pack-item-name").textContent),
    activePack: root.querySelector("#lm-pack-current").textContent,
    chips: root.querySelectorAll("#lm-user-chips .lazymod-chip").length,
    scrollable: list.scrollHeight > list.clientHeight + 4,
    scrolling: list.classList.contains("is-ghost-scrolling"),
    ghostVisible: ghost.dataset.visible,
    ghostName: ghost.querySelector(".lazymod-pack-ghost-name")?.textContent || "",
    centeredName: centered?.querySelector(".lazymod-pack-item-name").textContent || "",
    centeredSize: nameSize(centered),
    neighborSize: nameSize(neighbor),
    neighborOpacity: neighbor ? parseFloat(getComputedStyle(neighbor).opacity) : 1,
  };
})()`;

const setSearch = (value) =>
  `(() => { const input = ${ROOT}.querySelector("#lm-pack-search"); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
const clickInRow = (packId, selector) => `(() => { ${ROOT}.querySelector('#lm-pack-list [data-pack-id="${packId}"] ${selector}').click(); return true; })()`;
const rowIdByName = (state, name) => state.items.find((item) => item.name === name)?.id;
const CLICK_UNDO = `(() => { ${ROOT}.querySelector("#lm-pack-undo").click(); return true; })()`;
const SCROLL_LIST_TO_MIDDLE = `(() => { const list = ${ROOT}.querySelector("#lm-pack-list"); list.scrollTop = (list.scrollHeight - list.clientHeight) / 2; return list.scrollTop; })()`;
const WHEEL_NOT_CAPTURED = `(() => {
  const wheel = () => new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true, composed: true });
  const inList = wheel();
  ${ROOT}.querySelector("#lm-pack-list").dispatchEvent(inList);
  const onPage = wheel();
  document.body.dispatchEvent(onPage);
  return { inList: inList.defaultPrevented, onPage: onPage.defaultPrevented };
})()`;

const OPEN_SWITCHER = `(() => { const root = ${ROOT}; if (root.querySelector("#lm-pack-browser").hidden) root.querySelector("#lm-pack-switcher").click(); return true; })()`;
/** Viewport point at the center of `selector` (in the shadow root), and what is hit there. */
const pointOf = (selector) => `(() => {
  const root = ${ROOT};
  const element = root.querySelector(${JSON.stringify(selector)});
  const rect = element.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + Math.min(rect.height / 2, 14));
  const hit = root.elementFromPoint(x, y);
  return { x, y, hits: Boolean(hit && (hit === element || element.contains(hit))) };
})()`;
const REVEAL_LIST = `(() => { ${ROOT}.querySelector("#lm-pack-browser").scrollIntoView({ block: "nearest" }); return true; })()`;

/** The switcher with real (trusted) mouse and wheel input, as a user would. */
async function runSwitcherInputChecks({ open, evaluate, pointer, check, origin }, page) {
  const realClick = async (selector) => {
    const point = await evaluate(page, pointOf(selector));
    await pointer.click(page, point.x, point.y);
    return point;
  };

  const triggerPoint = await realClick("#lm-pack-switcher");
  await sleep(1800); // longer than the 1.5 s page watch interval
  const afterClick = await evaluate(page, PACK_STATE);
  check(
    "Pack switcher (real click): opens and stays open, with focus in its search",
    triggerPoint.hits && afterClick.open && afterClick.expanded === "true" && afterClick.focusInPanel,
    { triggerPoint, open: afterClick.open, focusInPanel: afterClick.focusInPanel },
  );

  // A wheel over the switcher may scroll the tagger body; a native <select>
  // popup closes on that, the switcher must not.
  await pointer.wheel(page, triggerPoint.x, triggerPoint.y, 120);
  await sleep(300);
  const afterBodyWheel = await evaluate(page, PACK_STATE);
  await evaluate(page, REVEAL_LIST);
  const listPoint = await evaluate(page, pointOf("#lm-pack-list"));
  const before = await evaluate(page, PACK_STATE);
  // Scroll toward the side with room (the active pack may be last).
  await pointer.wheel(page, listPoint.x, listPoint.y, before.listScrollTop > 0 ? -120 : 120);
  await sleep(150);
  const duringListWheel = await evaluate(page, PACK_STATE);
  check(
    "Pack switcher (real wheel): stays open when the tagger scrolls; wheel over the list scrolls the list with ghost scroll, not the tagger",
    afterBodyWheel.open &&
      listPoint.hits &&
      duringListWheel.open &&
      duringListWheel.listScrollTop !== before.listScrollTop &&
      duringListWheel.bodyScrollTop === before.bodyScrollTop &&
      duringListWheel.ghostVisible === "true" &&
      Boolean(duringListWheel.ghostName),
    { afterBodyWheel: afterBodyWheel.open, listPoint, before: [before.listScrollTop, before.bodyScrollTop], during: [duringListWheel.listScrollTop, duringListWheel.bodyScrollTop, duringListWheel.ghostVisible, duringListWheel.ghostName] },
  );
  await sleep(700);

  // Clicks inside the panel keep it open; choosing a pack closes it.
  await realClick("#lm-pack-search");
  await sleep(200);
  const afterInsideClick = await evaluate(page, PACK_STATE);
  const choice = afterInsideClick.items.find((item) => !item.active && item.name.startsWith("Ghost Pack"));
  await evaluate(page, `(() => { const row = ${ROOT}.querySelector('#lm-pack-list [data-pack-id="${choice.id}"]'); const list = row.parentElement; list.scrollTop = row.offsetTop - list.clientHeight / 2; return true; })()`);
  await sleep(700); // let the ghost overlay fade so it is not under the pointer
  await realClick(`#lm-pack-list [data-pack-id="${choice.id}"] .lazymod-pack-item-select`);
  const chosen = await waitFor(evaluate, page, PACK_STATE, (state) => !state.open);
  check(
    "Pack switcher (real click): clicks inside keep it open; choosing a pack selects it and closes",
    afterInsideClick.open && !chosen.open && chosen.activePack === choice.name && chosen.focusOnSwitcher && chosen.chips > 0,
    { afterInsideClick: afterInsideClick.open, chosen: { open: chosen.open, activePack: chosen.activePack, expected: choice.name } },
  );

  // Outside click and Escape close it.
  await realClick("#lm-pack-switcher");
  const reopened = await waitFor(evaluate, page, PACK_STATE, (state) => state.open);
  await pointer.click(page, 10, 10); // page heading, outside the tagger
  const outside = await waitFor(evaluate, page, PACK_STATE, (state) => !state.open);
  await realClick("#lm-pack-switcher");
  await waitFor(evaluate, page, PACK_STATE, (state) => state.open);
  await evaluate(page, `(() => { ${ROOT}.querySelector("#lm-pack-search").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, composed: true })); return true; })()`);
  const escaped = await evaluate(page, PACK_STATE);
  check(
    "Pack switcher: an outside click and Escape close it (Escape returns focus to the switcher)",
    reopened.open && !outside.open && !escaped.open && escaped.focusOnSwitcher,
    { reopened: reopened.open, outside: outside.open, escaped: { open: escaped.open, focus: escaped.focusOnSwitcher } },
  );
}

export async function runPackBrowserChecks(adapters) {
  const { open, evaluate, check, origin } = adapters;
  const page = await open(`${origin}/plain`);
  await waitFor(evaluate, page, READY, Boolean, 10000);
  await evaluate(page, SHOW_TAGGING);
  for (const name of GHOST_PACKS) {
    await evaluate(page, importPack(name));
    await waitFor(evaluate, page, PACK_STATE, (state) => state.options.includes(name));
  }

  await runSwitcherInputChecks(adapters, page);

  await evaluate(page, OPEN_SWITCHER);
  const opened = await waitFor(evaluate, page, PACK_STATE, (state) => state.open && state.items.length === state.total && state.items.some((item) => item.id.startsWith("hub-")));
  check(
    "Pack switcher: lists every installed pack (local and File Hub)",
    opened.expanded === "true" && opened.items.length >= GHOST_PACKS.length + 2 && opened.items.some((item) => item.name === "Mock Hub Pack") && opened.items.filter((item) => item.active).length === 1,
    { count: opened.items.length, options: opened.options.length, status: opened.status },
  );

  // Search: name (case-insensitive), tag, File Hub metadata, category; no match.
  const search = async (query) => {
    await evaluate(page, setSearch(query));
    return evaluate(page, PACK_STATE);
  };
  const byName = await search("GHOST pack 07");
  const byTag = await search("ghost_tag_11");
  const bySource = await search("file hub");
  const byCategory = await search("hub category");
  const none = await search("no-such-pack-anywhere");
  await sleep(100);
  const noGhostWhileSearching = (await evaluate(page, PACK_STATE)).ghostVisible === "false";
  await evaluate(page, setSearch(""));
  const cleared = await evaluate(page, PACK_STATE);
  check(
    "Pack search: matches names case-insensitively, tags, File Hub metadata, and categories, without changing packs",
    byName.items.map((item) => item.name).join() === "Ghost Pack 07" &&
      byTag.items.length === 1 && byTag.items[0].name === "Ghost Pack 11" && byTag.items[0].match === "tag: ghost_tag_11" &&
      ["Mock Hub Pack", "Fallback Pack"].every((name) => bySource.items.some((item) => item.name === name)) && bySource.items.every((item) => !item.name.startsWith("Ghost")) &&
      byCategory.items.some((item) => item.name === "Mock Hub Pack" && item.match === "category: Hub Category") &&
      none.items.length === 0 && /No pack matches/.test(none.status) && noGhostWhileSearching &&
      cleared.items.length === opened.items.length && cleared.options.join() === opened.options.join(),
    { byName: byName.items, byTag: byTag.items, bySource: bySource.items.map((item) => item.name), byCategory: byCategory.items, none: none.status },
  );

  // Ghost scroll.
  // Right after the searches: their scroll resets must not swallow this scroll.
  await evaluate(page, SCROLL_LIST_TO_MIDDLE);
  await sleep(250);
  const scrolling = await evaluate(page, PACK_STATE);
  const wheel = await evaluate(page, WHEEL_NOT_CAPTURED);
  await sleep(900);
  const idle = await evaluate(page, PACK_STATE);
  check(
    "Ghost scroll: scrolling the list shows the centered pack larger in a ghost overlay, with dimmed neighbors",
    scrolling.scrollable &&
      scrolling.scrolling &&
      scrolling.ghostVisible === "true" &&
      Boolean(scrolling.centeredName) &&
      scrolling.ghostName === scrolling.centeredName &&
      scrolling.centeredSize > scrolling.neighborSize &&
      scrolling.neighborOpacity < 0.8,
    { scrolling: { ...scrolling, items: scrolling.items.length } },
  );
  check(
    "Ghost scroll: the overlay fades out after the idle timeout, and wheel events are never captured",
    !idle.scrolling && idle.ghostVisible === "false" && !idle.centeredName && !wheel.inList && !wheel.onPage,
    { scrolling: idle.scrolling, ghost: idle.ghostVisible, wheel },
  );

  // Uninstall the active pack: falls back to its neighbor; Undo restores it.
  const target = rowIdByName(idle, "Ghost Pack 05");
  const neighbor = idle.items[idle.items.findIndex((item) => item.id === target) + 1].name;
  await evaluate(page, clickInRow(target, ".lazymod-pack-item-select"));
  const selected = await waitFor(evaluate, page, PACK_STATE, (state) => state.activePack === "Ghost Pack 05" && !state.open);
  // The palette header's Uninstall (formerly Delete) uses the same flow; its
  // Undo shows under the switcher while the list is closed.
  await evaluate(page, `(() => { ${ROOT}.querySelector("#lm-uninstall-pack").click(); return true; })()`);
  const removed = await waitFor(evaluate, page, PACK_STATE, (state) => state.hasUndo && state.idle);
  check(
    "Uninstall (header button): no Delete/confirm left; Undo shows under the closed switcher",
    selected.headerUninstall.label === "Uninstall" && !selected.hasDeleteButton && !removed.open && removed.noticeVisible && /Uninstalled "Ghost Pack 05"\.Undo/.test(removed.notice),
    { headerUninstall: selected.headerUninstall, hasDeleteButton: selected.hasDeleteButton, open: removed.open, notice: removed.notice },
  );
  check(
    "Uninstall: removing the active pack selects its neighbor and updates the selector and list",
    selected.activePack === "Ghost Pack 05" &&
      !removed.options.includes("Ghost Pack 05") &&
      !removed.items.some((item) => item.name === "Ghost Pack 05") &&
      removed.activePack === neighbor &&
      removed.items.find((item) => item.active)?.name === neighbor &&
      removed.chips > 0 &&
      /Uninstalled "Ghost Pack 05"/.test(removed.notice),
    { activePack: removed.activePack, neighbor, notice: removed.notice },
  );
  await evaluate(page, CLICK_UNDO);
  const restored = await waitFor(evaluate, page, PACK_STATE, (state) => state.options.includes("Ghost Pack 05"));
  check(
    "Uninstall: Undo restores the pack at its position and reselects it",
    restored.activePack === "Ghost Pack 05" && restored.options.join() === selected.options.join() && !restored.hasUndo && !restored.notice,
    { activePack: restored.activePack },
  );

  // File Hub packs: uninstall from the browser → Assets offers Install again;
  // uninstall from Assets → Undo restores the installed state.
  await evaluate(page, clickInRow(rowIdByName(restored, "Mock Hub Pack"), ".lazymod-pack-uninstall"));
  await waitFor(evaluate, page, PACK_STATE, (state) => !state.options.includes("Mock Hub Pack"));
  await evaluate(page, `(() => { ${ROOT}.querySelector("#lm-tab-btn-assets").click(); return true; })()`);
  const ASSET = (id) => `(() => { const card = ${ROOT}.querySelector('#lm-assets-list [data-package-id="${id}"]'); return card ? { status: card.dataset.status, action: card.querySelector(".lazymod-asset-action").textContent, result: card.querySelector(".lazymod-asset-result")?.textContent || "", hasUninstall: Boolean(card.querySelector(".lazymod-asset-uninstall")), hasUndo: Boolean(card.querySelector(".lazymod-asset-undo")) } : null; })()`;
  const goodCard = await waitFor(evaluate, page, ASSET("good"), (card) => card?.status === "available", 10000);
  const fallbackCard = await evaluate(page, ASSET("fallback"));
  await evaluate(page, `(() => { ${ROOT}.querySelector('#lm-assets-list [data-package-id="fallback"] .lazymod-asset-uninstall').click(); return true; })()`);
  const fallbackRemoved = await waitFor(evaluate, page, ASSET("fallback"), (card) => card?.hasUndo);
  const optionsAfterAssets = await evaluate(page, PACK_STATE);
  await evaluate(page, `(() => { ${ROOT}.querySelector('#lm-assets-list [data-package-id="fallback"] .lazymod-asset-undo').click(); return true; })()`);
  const fallbackRestored = await waitFor(evaluate, page, ASSET("fallback"), (card) => card?.status === "installed");
  check(
    "Uninstall (File Hub): Assets shows Install again after an uninstall, and its own Uninstall offers Undo",
    goodCard.action === "Install" &&
      fallbackCard.hasUninstall &&
      fallbackRemoved.status === "available" &&
      !optionsAfterAssets.options.includes("Fallback Pack") &&
      /Restored/.test(fallbackRestored.result),
    { goodCard, fallbackCard, fallbackRemoved, fallbackRestored },
  );

  // Undo hides by itself after a few seconds (the pack stays uninstalled).
  await evaluate(page, SHOW_TAGGING);
  await evaluate(page, OPEN_SWITCHER);
  const before12 = await evaluate(page, PACK_STATE);
  await evaluate(page, clickInRow(rowIdByName(before12, "Ghost Pack 12"), ".lazymod-pack-uninstall"));
  const shownUndo = await waitFor(evaluate, page, PACK_STATE, (state) => state.hasUndo && state.idle);
  await sleep(5600);
  const expired = await evaluate(page, PACK_STATE);
  check(
    "Uninstall: the Undo notice disappears on its own after about 5 seconds",
    shownUndo.noticeVisible && !expired.hasUndo && !expired.noticeVisible && !expired.options.includes("Ghost Pack 12"),
    { shown: shownUndo.notice, expired: { hasUndo: expired.hasUndo, notice: expired.notice } },
  );

  // Uninstalling every pack leaves a clean empty state; Undo brings one back.
  await evaluate(page, SHOW_TAGGING);
  await evaluate(page, OPEN_SWITCHER);
  let state = await evaluate(page, PACK_STATE);
  for (let guard = 0; guard < 60 && state.items.length > 1; guard += 1) {
    const victim = state.items.find((item) => item.id !== "default-character");
    await evaluate(page, clickInRow(victim.id, ".lazymod-pack-uninstall"));
    state = await waitFor(evaluate, page, PACK_STATE, (next) => next.idle && next.hasUndo && !next.items.some((item) => item.id === victim.id));
  }
  await evaluate(page, clickInRow("default-character", ".lazymod-pack-uninstall"));
  const empty = await waitFor(evaluate, page, PACK_STATE, (next) => next.items.length === 0 && next.hasUndo && next.idle);
  await evaluate(page, CLICK_UNDO);
  const back = await waitFor(evaluate, page, PACK_STATE, (next) => next.items.length === 1);
  check(
    "Uninstall: removing the last pack shows an empty state; Undo restores it as the active pack",
    empty.activePack === "No tag packs" && empty.total === 0 && empty.chips === 0 && empty.headerUninstall.disabled && back.activePack === back.items[0].name && back.items[0].id === "default-character" && back.chips > 0,
    { empty: { options: empty.options, status: empty.status, headerUninstall: empty.headerUninstall }, back: { activePack: back.activePack, items: back.items } },
  );

  // Last (it leaves a second tab in front): a palette write in another tab
  // re-renders this tab's switcher, which must stay open.
  await evaluate(page, OPEN_SWITCHER);
  const other = await open(`${origin}/plain`);
  await waitFor(evaluate, other, READY, Boolean, 10000);
  const wrote = await evaluate(other, `(() => { const root = ${ROOT}; if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click(); const tabs = root.querySelectorAll(".lazymod-subtab"); tabs[tabs.length - 1]?.click(); return tabs.length; })()`);
  await sleep(600);
  const afterWrite = await evaluate(page, PACK_STATE);
  check("Pack switcher: stays open while a palette write in another tab re-renders it", wrote > 0 && afterWrite.open && afterWrite.items.length === afterWrite.total, { wrote, open: afterWrite.open });
}
