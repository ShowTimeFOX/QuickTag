// Browser-independent checks shared by chrome.mjs and firefox.mjs.
//
// Each runner passes small adapters: `open(url)` returns a page handle,
// `evaluate(handle, expression)` returns a JSON-serializable value from the
// page's main world (the tagger's shadow root is open), and `check(name, ok,
// details)` records a result.
import { sleep } from "./pages.mjs";

const ROOT = `document.getElementById("quicktag-extension-root").shadowRoot`;

async function waitFor(evaluate, handle, expression, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    try {
      value = await evaluate(handle, expression);
      if (predicate(value)) return value;
    } catch (error) {
      value = `error: ${error.message}`;
    }
    await sleep(150);
  }
  return value;
}

const READY = `(() => { const host = document.getElementById("quicktag-extension-root"); return host?.style.visibility === "visible" && host.shadowRoot.querySelectorAll("#lm-user-chips .lazymod-chip").length > 0; })()`;

const SHOW_TAGGER = `(() => { const root = ${ROOT}; const win = root.querySelector("#lazymod-window"); if (win.hidden) root.querySelector("#lm-show-tagger").click(); return !win.hidden; })()`;

/** Header geometry: the window buttons keep their size and right-edge position. */
const HEADER_GEOMETRY = `(() => {
  const root = ${ROOT};
  const win = root.querySelector("#lazymod-window").getBoundingClientRect();
  const header = root.querySelector(".lazymod-header-bar").getBoundingClientRect();
  const close = root.querySelector("#lm-hide-tagger").getBoundingClientRect();
  return { closeRightGap: Math.round(win.right - close.right), closeTop: Math.round(close.top - header.top), width: Math.round(close.width), height: Math.round(close.height), insideHeader: close.right <= header.right + 1 && close.left >= header.left - 1 };
})()`;

const SET_LONG_BADGE = `(() => { ${ROOT}.querySelector("#lm-active-badge").textContent = "very-long-site-profile-pattern\\\\.example\\\\.com/posts/show/123456789/with/a/long/path"; return true; })()`;

const DOCK_AND_ADD_LONG_CHIP = `(() => {
  const root = ${ROOT};
  const win = root.querySelector("#lazymod-window");
  if (!win.classList.contains("docked")) root.querySelector("#lm-dock-btn").click();
  const chips = root.querySelector("#lm-user-chips");
  const chip = document.createElement("div");
  chip.className = "lazymod-chip";
  chip.id = "test-long-chip";
  chip.textContent = "an_extremely_long_tag_name_without_any_spaces_".repeat(4);
  chips.appendChild(chip);
  return true;
})()`;

const OVERFLOW_STATE = `(() => {
  const root = ${ROOT};
  const win = root.querySelector("#lazymod-window");
  const chips = root.querySelector("#lm-user-chips").getBoundingClientRect();
  const chip = root.querySelector("#test-long-chip").getBoundingClientRect();
  const body = root.querySelector(".lazymod-body");
  return {
    docked: win.classList.contains("docked"),
    chipInsideChips: chip.right <= chips.right + 1 && chip.left >= chips.left - 1,
    chipsInsideViewport: chips.right <= window.innerWidth + 1,
    windowInsideViewport: win.getBoundingClientRect().right <= window.innerWidth + 1 && win.getBoundingClientRect().left >= -1,
    bodyHorizontalOverflow: body.scrollWidth - body.clientWidth,
  };
})()`;

const CLEANUP_LONG_CHIP = `(() => { ${ROOT}.querySelector("#test-long-chip")?.remove(); const root = ${ROOT}; if (root.querySelector("#lazymod-window").classList.contains("docked")) root.querySelector("#lm-dock-btn").click(); return true; })()`;

const FILL_CATEGORY_TABS = `(() => {
  const strip = ${ROOT}.querySelector("#lm-category-tabs");
  for (let index = 0; index < 30; index += 1) {
    const tab = document.createElement("button");
    tab.className = "lazymod-subtab test-filler";
    tab.textContent = "Filler category " + index;
    strip.appendChild(tab);
  }
  strip.scrollLeft = 0;
  return true;
})()`;

const ARROW_STATE = `(() => {
  const strip = ${ROOT}.querySelector("#lm-category-tabs");
  const wrap = strip.parentElement;
  const prev = wrap.querySelector(".lazymod-scroll-arrow-prev");
  const next = wrap.querySelector(".lazymod-scroll-arrow-next");
  return {
    wrapped: wrap.classList.contains("lazymod-scroller-wrap"),
    overflow: wrap.classList.contains("has-overflow"),
    arrowsShown: Boolean(prev && next && !prev.hidden && !next.hidden),
    prevDisabled: prev?.disabled,
    nextDisabled: next?.disabled,
    scrollLeft: Math.round(strip.scrollLeft),
    arrowCount: ${ROOT}.querySelectorAll(".lazymod-scroll-arrow").length,
  };
})()`;

const CLICK_NEXT_ARROW = `(() => { ${ROOT}.querySelector("#lm-category-tabs").parentElement.querySelector(".lazymod-scroll-arrow-next").click(); return true; })()`;
const SCROLL_TO_END = `(() => { const strip = ${ROOT}.querySelector("#lm-category-tabs"); strip.scrollLeft = strip.scrollWidth; return true; })()`;
const REMOVE_FILLERS = `(() => { ${ROOT}.querySelectorAll(".test-filler").forEach((tab) => tab.remove()); return true; })()`;

export async function runLayoutFixChecks({ open, evaluate, check, origin }) {
  for (const [label, path] of [
    ["Plain page", "/plain"],
    ["Hostile-styles page", "/hostile"],
  ]) {
    const page = await open(`${origin}${path}`);
    await waitFor(evaluate, page, READY, Boolean, 10000);
    await evaluate(page, SHOW_TAGGER);
    await sleep(300);
    const before = await evaluate(page, HEADER_GEOMETRY);
    await evaluate(page, SET_LONG_BADGE);
    await sleep(200);
    const after = await evaluate(page, HEADER_GEOMETRY);
    check(
      `${label}: close (x) button keeps size and position with a long profile badge`,
      before.width === 28 && before.height === 28 && after.width === 28 && after.closeRightGap === before.closeRightGap && after.closeTop === before.closeTop && after.insideHeader,
      { before, after },
    );

    await evaluate(page, DOCK_AND_ADD_LONG_CHIP);
    await sleep(400);
    const overflow = await evaluate(page, OVERFLOW_STATE);
    check(
      `${label}: docked tag list wraps long tags inside the viewport`,
      overflow.docked && overflow.chipInsideChips && overflow.chipsInsideViewport && overflow.windowInsideViewport && overflow.bodyHorizontalOverflow <= 1,
      overflow,
    );
    await evaluate(page, CLEANUP_LONG_CHIP);
    await sleep(300);

    if (path === "/plain") {
      await evaluate(page, FILL_CATEGORY_TABS);
      const start = await waitFor(evaluate, page, ARROW_STATE, (state) => state.overflow);
      check("Category strip: arrows appear on overflow; left arrow disabled at start", start.wrapped && start.arrowCount === 4 && start.arrowsShown && start.prevDisabled && !start.nextDisabled, start);
      await evaluate(page, CLICK_NEXT_ARROW);
      const scrolled = await waitFor(evaluate, page, ARROW_STATE, (state) => state.scrollLeft > 0 && !state.prevDisabled);
      check("Category strip: right arrow scrolls (smooth) and enables the left arrow", scrolled.scrollLeft > 0 && !scrolled.prevDisabled, scrolled);
      await evaluate(page, SCROLL_TO_END);
      const end = await waitFor(evaluate, page, ARROW_STATE, (state) => state.nextDisabled);
      check("Category strip: right arrow disabled at the end", end.nextDisabled && !end.prevDisabled, end);
      await evaluate(page, REMOVE_FILLERS);
      const none = await waitFor(evaluate, page, ARROW_STATE, (state) => !state.overflow);
      check("Category strip: arrows hidden again without overflow", !none.overflow && !none.arrowsShown, none);
    }
  }
}
