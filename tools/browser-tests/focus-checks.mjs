// Focus Mode checks shared by chrome.mjs and firefox.mjs (see checks.mjs for
// the adapter contract).
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const FOCUS = `${ROOT}.querySelector("#lm-focus-root")`;
const FIELD = `document.getElementById("tags")`;
const press = (target, init) =>
  `(() => { ${target}.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true, composed: true }, ${JSON.stringify(init)}))); return true; })()`;
const keyEvent = (type, target, init) =>
  `(() => { ${target}.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, Object.assign({ bubbles: true, cancelable: true, composed: true }, ${JSON.stringify(init)}))); return true; })()`;
// Where a real key event goes: the focused element, inside the shadow root too.
const FOCUSED = `(${ROOT}.activeElement || document.activeElement || document.body)`;
const ALT_A = { key: "a", code: "KeyA", altKey: true };
const ESC = { key: "Escape", code: "Escape" };

const IMAGE_FIT_STATE = `(() => {
  const focus = ${FOCUS};
  const viewport = focus.querySelector(".lm-focus-image-viewport");
  const image = viewport.querySelector(".lm-focus-image");
  const box = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  return {
    zoom: viewport.dataset.zoom,
    meta: focus.querySelector(".lm-focus-image-panel .lm-focus-meta").textContent,
    natural: [image.naturalWidth, image.naturalHeight],
    image: box(image),
    viewport: box(viewport),
    panel: box(focus.querySelector(".lm-focus-image-panel")),
    tags: box(focus.querySelector(".lm-focus-tags-panel")),
    scrolls: viewport.scrollHeight > viewport.clientHeight + 1 || viewport.scrollWidth > viewport.clientWidth + 1,
  };
})()`;
const showPageImage = (src) => `(() => {
  document.getElementById("image").src = ${JSON.stringify(src)};
  ${FOCUS}.querySelector(".lm-focus-image-panel .lm-focus-icon-btn").click();
  return true;
})()`;
const clickImageZoom = (label) =>
  `(() => { [...${FOCUS}.querySelectorAll(".lm-focus-image-panel button")].find((button) => button.textContent.trim() === ${JSON.stringify(label)}).click(); return true; })()`;

/** Fit: whole image inside the viewport, aspect ratio kept, tags tile not pushed. */
function fitsInside(fit) {
  const t = 1.5;
  const [naturalWidth, naturalHeight] = fit.natural;
  return (
    fit.zoom === "fit" &&
    naturalWidth > 0 &&
    fit.image.left >= fit.viewport.left - t &&
    fit.image.top >= fit.viewport.top - t &&
    fit.image.right <= fit.viewport.right + t &&
    fit.image.bottom <= fit.viewport.bottom + t &&
    Math.abs(fit.image.width / fit.image.height - naturalWidth / naturalHeight) < 0.03 &&
    fit.viewport.height > 40 &&
    fit.panel.bottom <= fit.tags.top + t &&
    !fit.scrolls
  );
}

const FOCUS_STATE = `(() => {
  const focus = ${FOCUS};
  if (!focus) return { exists: false };
  const grid = focus.querySelector(".lm-focus-grid");
  const panels = [...grid.children].filter((panel) => !panel.hidden).map((panel) => panel.style.gridArea || "");
  const image = focus.querySelector(".lm-focus-image");
  return {
    exists: true,
    open: !focus.hidden,
    position: getComputedStyle(focus).position,
    areas: getComputedStyle(grid).gridTemplateAreas,
    visiblePanels: panels,
    host: focus.querySelector(".lm-focus-host")?.textContent,
    count: focus.querySelector(".lm-focus-count")?.textContent,
    badges: [...focus.querySelectorAll(".lm-focus-badge")].map((badge) => (badge.classList.contains("muted") ? "~" : "") + badge.dataset.tag),
    imageSrc: image?.getAttribute("src") || "",
    imageMeta: focus.querySelector(".lm-focus-image-panel .lm-focus-meta")?.textContent,
    menuOpen: focus.querySelector(".lm-focus-menu") ? !focus.querySelector(".lm-focus-menu").hidden : false,
    dialogOpen: focus.querySelector(".lm-focus-backdrop") ? !focus.querySelector(".lm-focus-backdrop").hidden : false,
    paletteChips: focus.querySelectorAll(".lm-focus-palette-body .lazymod-chip").length,
    preset: focus.querySelector(".lm-focus-preset")?.value,
    themeVar: focus.style.getPropertyValue("--lm-accent"),
    field: ${FIELD}.value,
    pageOverflow: document.documentElement.style.overflow,
  };
})()`;

const typeIntoAddInput = (text) => `(() => {
  const input = ${FOCUS}.querySelector(".lm-focus-add-input");
  input.value = ${JSON.stringify(text)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, composed: true }));
  return true;
})()`;
const clickBadge = (tag, part) => `(() => { ${FOCUS}.querySelector('.lm-focus-badge[data-tag="${tag}"] .lm-focus-badge-${part}').click(); return true; })()`;
const setPageField = (text) => `(() => { const field = ${FIELD}; field.value = ${JSON.stringify(text)}; field.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
const clickIn = (selector) => `(() => { ${FOCUS}.querySelector(${JSON.stringify(selector)}).click(); return true; })()`;
const clickButtonByText = (text) =>
  `(() => { [...${FOCUS}.querySelectorAll("button")].find((button) => button.textContent.trim() === ${JSON.stringify(text)} || button.getAttribute("aria-label") === ${JSON.stringify(text)}).click(); return true; })()`;
const RAW_STATE = `(() => { const raw = ${FOCUS}.querySelector(".lm-focus-raw"); return { hidden: raw.hidden, value: raw.value }; })()`;
const setRaw = (text) => `(() => { const raw = ${FOCUS}.querySelector(".lm-focus-raw"); raw.value = ${JSON.stringify(text)}; raw.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
const CLICK_FIRST_PALETTE_CHIP = `(() => { const chip = ${FOCUS}.querySelector(".lm-focus-palette-body .lazymod-chip"); chip.click(); return chip.dataset.tag; })()`;
const paletteChip = (tag) => `${FOCUS}.querySelector('.lm-focus-palette-body .lazymod-chip[data-tag="${tag}"]')`;
const paletteChipState = (tag) => `(() => { const chip = ${paletteChip(tag)}; return chip ? (chip.classList.contains("active") ? "active" : chip.classList.contains("muted") ? "muted" : "none") : "missing"; })()`;
const LAYOUT_JSON = `JSON.parse(${FOCUS}.querySelector(".lm-focus-json").value)`;
const applyLayoutJson = (mutation) => `(() => {
  const textarea = ${FOCUS}.querySelector(".lm-focus-json");
  const layout = JSON.parse(textarea.value);
  (${mutation})(layout);
  textarea.value = JSON.stringify(layout);
  [...${FOCUS}.querySelectorAll(".lm-focus-dialog button")].find((button) => button.textContent.trim() === "Apply").click();
  return true;
})()`;
const DIALOG_STATUS = `(() => { const status = ${FOCUS}.querySelector(".lm-focus-dialog .lm-focus-status"); return { text: status.textContent, state: status.dataset.state }; })()`;
const PRIORITY_STATE = `({ open: !${FOCUS}.hidden, pageHandler: window.__qtBodyHandler })`;
const INSTALL_PAGE_HANDLER = `(() => {
  window.__qtBodyHandler = 0;
  document.body.addEventListener("keydown", (event) => { if (event.altKey && event.key === "a") { window.__qtBodyHandler += 1; event.preventDefault(); } });
  return true;
})()`;
const toggleStrictCapture = `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  root.querySelector("#lm-tab-btn-sites").click();
  root.querySelector("#lm-focus-strict").click();
  return root.querySelector("#lm-focus-strict").checked;
})()`;

const EDIT_STATE = `(() => {
  const focus = ${FOCUS};
  const grid = focus.querySelector(".lm-focus-grid");
  const strip = (panel) => focus.querySelector(\`.lm-focus-edit-strip[data-panel="\${panel}"]\`);
  const button = (panel, selector) => strip(panel)?.querySelector(selector);
  return {
    editing: focus.dataset.editing === "true",
    stripsVisible: [...focus.querySelectorAll(".lm-focus-edit-strip")].filter((item) => !item.hidden).length,
    areas: grid.style.gridTemplateAreas,
    columns: grid.style.gridTemplateColumns,
    imageRight: button("image", '[data-direction="right"]')?.disabled === false,
    imageLeft: button("image", '[data-direction="left"]')?.disabled === false,
    topbarWider: button("topbar", '[data-axis="columns"][data-step="1"]')?.disabled === false,
    deleteLayout: (() => { const button = focus.querySelector(".lm-focus-delete-layout"); return { label: button.textContent.trim(), disabled: button.disabled }; })(),
    options: [...focus.querySelectorAll(".lm-focus-preset option")].map((option) => option.value + ":" + option.textContent),
    preset: focus.querySelector(".lm-focus-preset").value,
    open: !focus.hidden,
  };
})()`;
const clickStrip = (panel, selector) => `(() => { ${FOCUS}.querySelector('.lm-focus-edit-strip[data-panel="${panel}"] ${selector}').click(); return true; })()`;
const SCALE_STATE = `(() => {
  const focus = ${FOCUS};
  const rect = focus.getBoundingClientRect();
  const topbar = focus.querySelector(".lm-focus-topbar").getBoundingClientRect();
  return { zoom: focus.style.zoom, scale: focus.dataset.scale, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, innerWidth, innerHeight, topbarHeight: topbar.height };
})()`;
const SHOW_SETTINGS = `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  root.querySelector("#lm-tab-btn-sites").click();
  return true;
})()`;
const setRange = (selector, value) =>
  `(() => { const input = ${ROOT}.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(String(value))}; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
const setCheckbox = (selector, checked) =>
  `(() => { const input = ${ROOT}.querySelector(${JSON.stringify(selector)}); if (input.checked !== ${checked}) input.click(); return input.checked; })()`;

export async function runFocusModeChecks({ open, evaluate, check, origin }) {
  const page = await open(`${origin}/plain`);
  await waitFor(evaluate, page, READY, Boolean, 10000);

  // Ghost mode shares the shortcut modules: Ctrl+Shift+G still toggles it.
  const GHOST = `${ROOT}.querySelector("#lazymod-window").classList.contains("ghost-mode")`;
  const ghostShortcut = { key: "G", code: "KeyG", ctrlKey: true, shiftKey: true };
  await evaluate(page, press("document.body", ghostShortcut));
  const ghostOn = await evaluate(page, GHOST);
  await evaluate(page, press("document.body", ghostShortcut));
  const ghostOff = await evaluate(page, GHOST);
  check("Ghost mode: Ctrl+Shift+G toggles on and off (shared shortcut module)", ghostOn === true && ghostOff === false, { ghostOn, ghostOff });

  // Header button next to ghost mode, and the brand mark in Focus Mode.
  const header = await evaluate(
    page,
    `(() => { const root = ${ROOT}; if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click(); const button = root.querySelector("#lm-focus-header"); const previous = button.previousElementSibling?.id; button.click(); return previous; })()`,
  );
  const byButton = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.open);
  const brand = await evaluate(
    page,
    `(() => { const focus = ${FOCUS}; const brand = focus.querySelector(".lm-focus-brand"); const topbar = focus.querySelector(".lm-focus-topbar"); return { text: brand?.textContent, first: brand.parentElement.classList.contains("lm-focus-site") && brand.parentElement.firstElementChild === brand, leftGap: brand.getBoundingClientRect().left - topbar.getBoundingClientRect().left, icon: Boolean(brand.querySelector("svg")) }; })()`,
  );
  await evaluate(page, press(FOCUS, ESC));
  const closedAgain = await waitFor(evaluate, page, FOCUS_STATE, (state) => !state.open);
  check(
    "Focus Mode: the header button next to ghost mode opens it; the top-left shows the QuickTag mark and \"Focus Mode\"",
    header === "lm-ghost-toggle" && byButton.open && brand.text === "QuickTagFocus Mode" && brand.first && brand.icon && brand.leftGap < 40 && !closedAgain.open,
    { header, open: byButton.open, brand },
  );

  // Open with the default Alt+A (the tagger window may be hidden at the edge).
  await evaluate(page, press("document.body", ALT_A));
  const opened = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.open && /\d+ × \d+ px/.test(state.imageMeta || ""));
  check(
    "Focus Mode: Alt+A opens the overlay with the default layout (top bar, image, tags, palette)",
    opened.open && opened.position === "fixed" && /topbar/.test(opened.areas) && ["topbar", "image", "tags", "palette"].every((panel) => opened.visiblePanels.includes(panel)),
    opened,
  );
  check(
    "Focus Mode: top bar shows host, preset, and count; theme variables copied; page scroll locked",
    opened.host === "127.0.0.1" && opened.preset === "default" && /0 active/.test(opened.count) && Boolean(opened.themeVar) && opened.pageOverflow === "hidden",
    opened,
  );
  check("Focus Mode: image preview loads the page image with its dimensions", /\/img\.png$/.test(opened.imageSrc) && /1 × 1 px/.test(opened.imageMeta), opened);

  // A real press: after keydown opens the overlay, focus is inside it, so the
  // keyup (Alt still held) and auto-repeat keydowns go to the overlay. None of
  // them may toggle Focus Mode again.
  const focusInside = await evaluate(page, `${FOCUS}.contains(${ROOT}.activeElement)`);
  await evaluate(page, keyEvent("keyup", FOCUSED, ALT_A));
  await evaluate(page, keyEvent("keydown", FOCUSED, { ...ALT_A, repeat: true }));
  await evaluate(page, keyEvent("keydown", FOCUSED, { ...ALT_A, repeat: true }));
  await evaluate(page, keyEvent("keyup", FOCUSED, ALT_A));
  await evaluate(page, keyEvent("keyup", FOCUSED, { key: "Alt", code: "AltLeft" }));
  await sleep(300);
  const stillOpen = await evaluate(page, FOCUS_STATE);
  check("Focus Mode: one Alt+A press stays open (keyup and key repeat inside the overlay do not toggle)", focusInside && stillOpen.open, { focusInside, open: stillOpen.open });

  // Fit / 1:1 with images much larger than the tile.
  await evaluate(page, clickImageZoom("Fit"));
  await evaluate(page, showPageImage("/tall.svg"));
  const tallFit = await waitFor(evaluate, page, IMAGE_FIT_STATE, (state) => /300 × 3000 px/.test(state.meta));
  check("Focus image: Fit scales a tall image to fit inside its tile without pushing the tags tile", fitsInside(tallFit), tallFit);
  // Wheel zoom around the pointer, double-click reset, drag to pan.
  const VIEWPORT = `${FOCUS}.querySelector(".lm-focus-image-viewport")`;
  const ZOOM = `(() => ({ label: ${FOCUS}.querySelector(".lm-focus-zoom-label").textContent, background: getComputedStyle(${VIEWPORT}).backgroundImage }))()`;
  const wheelAt = (deltaY) =>
    `(() => { const v = ${VIEWPORT}; const r = v.getBoundingClientRect(); const e = new WheelEvent("wheel", { deltaY: ${deltaY}, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }); v.dispatchEvent(e); return e.defaultPrevented; })()`;
  const drag = (dx, dy) =>
    `(() => { const v = ${VIEWPORT}; const r = v.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const opts = (cx, cy) => ({ pointerId: 7, button: 0, buttons: 1, clientX: cx, clientY: cy, bubbles: true, cancelable: true, pointerType: "mouse" }); v.dispatchEvent(new PointerEvent("pointerdown", opts(x, y))); v.dispatchEvent(new PointerEvent("pointermove", opts(x + ${dx}, y + ${dy}))); v.dispatchEvent(new PointerEvent("pointerup", opts(x + ${dx}, y + ${dy}))); return true; })()`;
  const fitZoom = await evaluate(page, ZOOM);
  const wheelPrevented = await evaluate(page, wheelAt(-600));
  const zoomedIn = await evaluate(page, IMAGE_FIT_STATE);
  const zoomedLabel = (await evaluate(page, ZOOM)).label;
  await evaluate(page, `(() => { ${VIEWPORT}.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); return true; })()`);
  const resetLabel = (await evaluate(page, ZOOM)).label;
  check(
    "Focus image: wheel zooms in around the pointer (page not scrolled), double-click resets; calm gradient background",
    wheelPrevented &&
      parseInt(zoomedLabel, 10) > parseInt(fitZoom.label, 10) &&
      zoomedIn.image.height > tallFit.image.height * 1.5 &&
      resetLabel === fitZoom.label &&
      /gradient/.test(fitZoom.background) &&
      !/conic/.test(fitZoom.background),
    { fit: fitZoom.label, zoomed: zoomedLabel, reset: resetLabel, background: fitZoom.background.slice(0, 60) },
  );
  await evaluate(page, clickImageZoom("1:1"));
  const tallActual = await evaluate(page, IMAGE_FIT_STATE);
  await evaluate(page, drag(-40, -120));
  const panned = await evaluate(page, IMAGE_FIT_STATE);
  await evaluate(page, `(() => { ${FOCUS}.querySelector(".lm-focus-zoom-label").click(); return true; })()`);
  const labelReset = await evaluate(page, IMAGE_FIT_STATE);
  check(
    "Focus image: 1:1 shows the natural size, drag pans it inside the tile, the zoom label resets (tags tile unchanged)",
    tallActual.zoom === "actual" &&
      Math.abs(tallActual.image.height - 3000) < 2 &&
      Math.abs(panned.image.top - (tallActual.image.top - 120)) < 2 &&
      Math.abs(labelReset.image.top - tallActual.image.top) < 2 &&
      tallActual.panel.bottom <= tallActual.tags.top + 1.5 &&
      Math.abs(tallActual.tags.top - tallFit.tags.top) < 1.5,
    { actualTop: tallActual.image.top, pannedTop: panned.image.top, resetTop: labelReset.image.top },
  );
  await evaluate(page, clickImageZoom("Fit"));
  await evaluate(page, showPageImage("/wide.svg"));
  const wideFit = await waitFor(evaluate, page, IMAGE_FIT_STATE, (state) => /3000 × 300 px/.test(state.meta));
  check("Focus image: Fit scales a wide image to fit inside its tile", fitsInside(wideFit), wideFit);
  await evaluate(page, showPageImage("/img.png"));
  await waitFor(evaluate, page, IMAGE_FIT_STATE, (state) => /1 × 1 px/.test(state.meta));

  // Tag management with live two-way sync.
  await evaluate(page, typeIntoAddInput("long_hair blue_eyes"));
  const added = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.badges.length === 2);
  check("Focus tags: inline input adds tags and live-syncs the page field", added.badges.join(" ") === "long_hair blue_eyes" && added.field === "long_hair blue_eyes", added);

  const sizes = await evaluate(
    page,
    `(() => {
      const focus = ${FOCUS};
      const height = (selector) => focus.querySelector(selector).getBoundingClientRect().height;
      const remove = focus.querySelector(".lm-focus-badge-remove").getBoundingClientRect();
      const header = focus.querySelector(".lm-focus-tags-panel .lm-focus-panel-header");
      const title = header.querySelector(".lazymod-title").getBoundingClientRect();
      const sort = [...header.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Sort");
      return {
        addInput: height(".lm-focus-add-input"),
        filter: height(".lm-focus-filter"),
        badgeFont: parseFloat(getComputedStyle(focus.querySelector(".lm-focus-badge-toggle")).fontSize),
        chipFont: parseFloat(getComputedStyle(focus.querySelector(".lm-focus-palette-body .lazymod-chip")).fontSize),
        badge: height(".lm-focus-badge"),
        remove: [remove.width, remove.height],
        toolbarInHeader: Boolean(sort) && !focus.querySelector(".lm-focus-tags-panel > .lm-focus-tags-toolbar"),
        sortBesideTitle: Boolean(sort) && Math.abs(sort.getBoundingClientRect().top + sort.getBoundingClientRect().height / 2 - (title.top + title.height / 2)) < 12,
        headerWidth: Math.round(header.getBoundingClientRect().width),
        iconOnly: [...header.querySelectorAll(".lm-focus-tags-toolbar > button, .lm-focus-tags-toolbar > .lm-focus-menu-anchor > button")].every((button) => !button.textContent.trim() && button.getAttribute("aria-label") && button.title),
      };
    })()`,
  );
  check(
    "Focus tags: controls sit next to the Tags heading; badges match the palette chip size; compact inputs",
    sizes.addInput <= 32 && sizes.filter <= 32 && sizes.badgeFont === sizes.chipFont && sizes.badge >= 22 && sizes.badge <= 30 && sizes.remove[0] >= 20 && sizes.toolbarInHeader && sizes.iconOnly && (sizes.sortBesideTitle || sizes.headerWidth < 380),
    sizes,
  );

  await evaluate(page, clickBadge("long_hair", "toggle"));
  const muted = await evaluate(page, FOCUS_STATE);
  check(
    "Focus tags: clicking a badge mutes it (kept in the list, removed from the page)",
    muted.badges.join(" ") === "~long_hair blue_eyes" && muted.field === "blue_eyes" && /1 active · 1 muted/.test(muted.count),
    muted,
  );

  await evaluate(page, clickBadge("blue_eyes", "remove"));
  const removed = await evaluate(page, FOCUS_STATE);
  check("Focus tags: × removes a tag entirely", removed.badges.join(" ") === "~long_hair" && removed.field === "", removed);

  await evaluate(page, setPageField("smile solo"));
  const merged = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.badges.includes("smile"));
  check("Focus tags: edits on the page field sync back (muted tags kept)", merged.badges.includes("smile") && merged.badges.includes("solo") && merged.badges.includes("~long_hair"), merged);

  await evaluate(page, clickButtonByText("Sort"));
  const menu = await evaluate(page, FOCUS_STATE);
  await evaluate(page, clickIn('[data-sort="z-a"]'));
  const sorted = await evaluate(page, FOCUS_STATE);
  check("Focus tags: sort menu (Z–A) reorders the page field", menu.menuOpen && !sorted.menuOpen && sorted.field === "solo smile", { menuOpen: menu.menuOpen, sorted });

  await evaluate(page, setPageField("x_tag x_tag y_tag"));
  await waitFor(evaluate, page, FOCUS_STATE, (state) => state.badges.includes("x_tag"));
  await evaluate(page, clickButtonByText("Deduplicate"));
  const deduped = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.field === "x_tag y_tag");
  check("Focus tags: Deduplicate removes duplicates from the page field", deduped.field === "x_tag y_tag", deduped);

  await evaluate(page, clickButtonByText("Raw text"));
  const raw = await evaluate(page, RAW_STATE);
  await evaluate(page, setRaw("a_tag b_tag"));
  const rawSynced = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.field === "a_tag b_tag", 3000);
  check("Focus tags: Raw text view shows and edits the active tags", !raw.hidden && raw.value === "x_tag y_tag" && rawSynced.field === "a_tag b_tag", { raw, field: rawSynced.field });
  await evaluate(page, clickButtonByText("Badges"));

  // Palette panel synchronized with the tag states: add, then remove (no mute).
  const tag = await evaluate(page, CLICK_FIRST_PALETTE_CHIP);
  const afterAdd = await evaluate(page, FOCUS_STATE);
  const chipActive = await evaluate(page, paletteChipState(tag));
  await evaluate(page, `(() => { ${paletteChip(tag)}.click(); return true; })()`);
  const chipAfterSecond = await evaluate(page, paletteChipState(tag));
  const afterRemove = await evaluate(page, FOCUS_STATE);
  check(
    "Focus palette: chips add, then remove, tags (no mute; synchronized with the tag list and page)",
    afterAdd.paletteChips > 0 &&
      afterAdd.field.split(" ").includes(tag) &&
      chipActive === "active" &&
      chipAfterSecond === "none" &&
      !afterRemove.field.split(" ").includes(tag) &&
      !afterRemove.badges.some((badge) => badge.replace("~", "") === tag),
    { tag, chipActive, chipAfterSecond, field: afterRemove.field, badges: afterRemove.badges },
  );

  // Palette layout like the tagger: category tabs by default, Flat view with labels.
  const PALETTE_LAYOUT = `(() => { const focus = ${FOCUS}; const tabs = focus.querySelector(".lm-focus-categories"); return { tabsHidden: tabs.hidden, tabs: tabs.querySelectorAll(".lazymod-subtab").length, sections: focus.querySelectorAll(".lm-focus-palette-body .lm-focus-category").length, chips: focus.querySelectorAll(".lm-focus-palette-body .lazymod-chip").length, flat: focus.querySelector(".lm-focus-flat input").checked }; })()`;
  const tabsLayout = await evaluate(page, PALETTE_LAYOUT);
  await evaluate(page, clickIn(".lm-focus-flat input"));
  const flatLayout = await evaluate(page, PALETTE_LAYOUT);
  await evaluate(page, clickIn(".lm-focus-flat input"));
  const backToTabs = await evaluate(page, PALETTE_LAYOUT);
  check(
    "Focus palette: category tabs by default; Flat view shows every category of the group with its label",
    !tabsLayout.tabsHidden && tabsLayout.tabs > 1 && tabsLayout.sections === 0 && flatLayout.flat && flatLayout.tabsHidden && flatLayout.sections === tabsLayout.tabs && flatLayout.chips > tabsLayout.chips && !backToTabs.flat && backToTabs.sections === 0,
    { tabsLayout, flatLayout, backToTabs },
  );

  // "+ All" toggles every visible tag (the active category).
  const GROUP_ALL = `(() => { const focus = ${FOCUS}; const toggle = focus.querySelector(".lm-focus-group-all"); const tags = [...new Set([...focus.querySelectorAll(".lm-focus-palette-body .lazymod-chip")].map((chip) => chip.dataset.tag))]; return { label: toggle.textContent, pressed: toggle.getAttribute("aria-pressed"), tags, besideGroups: toggle.parentElement.classList.contains("lm-focus-group-row") }; })()`;
  const beforeAll = await evaluate(page, GROUP_ALL);
  await evaluate(page, clickIn(".lm-focus-group-all"));
  const allAdded = await evaluate(page, FOCUS_STATE);
  const allState = await evaluate(page, GROUP_ALL);
  await evaluate(page, clickIn(".lm-focus-group-all"));
  const allRemoved = await evaluate(page, FOCUS_STATE);
  const fieldTags = (state) => state.field.split(/\s+/).filter(Boolean);
  check(
    'Focus palette: "+ All" next to the groups adds every visible tag, then removes them',
    beforeAll.label === "+ All" &&
      beforeAll.besideGroups &&
      beforeAll.tags.length > 1 &&
      beforeAll.tags.every((groupTag) => fieldTags(allAdded).includes(groupTag)) &&
      allState.label === "− All" &&
      allState.pressed === "true" &&
      beforeAll.tags.every((groupTag) => !fieldTags(allRemoved).includes(groupTag)),
    { beforeAll: { label: beforeAll.label, count: beforeAll.tags.length }, added: allAdded.field, after: allState.label, removed: allRemoved.field },
  );

  // AI: the button runs the shared analysis; its results are the first group (ComfyUI is offline here).
  const AI_STATE = `(() => {
    const focus = ${FOCUS};
    const button = focus.querySelector(".lm-focus-ai-button");
    const tabs = [...focus.querySelectorAll(".lm-focus-groups .lazymod-tab")];
    const message = focus.querySelector(".lm-focus-palette-body .lm-focus-ai-message");
    return { busy: button.getAttribute("aria-busy") === "true", label: button.textContent.trim(), firstTab: tabs[0]?.textContent, firstActive: tabs[0]?.classList.contains("active"), aiState: tabs[0]?.dataset.state, message: message?.textContent || "", messageState: message?.dataset.state || "", subtab: focus.querySelector(".lm-focus-categories .lazymod-subtab")?.textContent, taggerAiTab: ${ROOT}.querySelector("#lm-palette-tabs .lazymod-ai-tab")?.dataset.state };
  })()`;
  const aiBusy = await evaluate(page, `(() => { ${FOCUS}.querySelector(".lm-focus-ai-button").click(); return ${AI_STATE}; })()`);
  const ai = await waitFor(evaluate, page, AI_STATE, (state) => state.messageState === "error" && !state.busy, 20000);
  check(
    'Focus palette: the AI button shows loading, then the "AI" group comes first with the result state (shared with the tagger)',
    aiBusy.busy &&
      aiBusy.label === "AI…" &&
      aiBusy.messageState === "busy" &&
      ai.firstTab === "AI" &&
      ai.firstActive &&
      ai.aiState === "error" &&
      ai.subtab === "Suggestions" &&
      /Analysis failed|Could not/.test(ai.message) &&
      ai.label === "AI" &&
      ai.taggerAiTab === "error",
    { aiBusy, ai },
  );
  // Back to the pack's first group for the following checks.
  await evaluate(page, `(() => { ${FOCUS}.querySelectorAll(".lm-focus-groups .lazymod-tab")[1]?.click(); return true; })()`);

  // Esc closes the topmost menu first, then Focus Mode.
  // The keyup of the same Esc press must not exit as well.
  await evaluate(page, clickButtonByText("Sort"));
  await evaluate(page, press(FOCUS, ESC));
  await evaluate(page, keyEvent("keyup", FOCUS, ESC));
  const escMenu = await evaluate(page, FOCUS_STATE);
  check("Focus Mode: Esc closes an open menu first and stays in Focus Mode (keyup included)", escMenu.open && !escMenu.menuOpen, escMenu);

  // Layout JSON dialog: view, apply a preset change, reject an invalid layout.
  await evaluate(page, clickButtonByText("Layout"));
  const layoutJson = await evaluate(page, LAYOUT_JSON);
  await evaluate(page, applyLayoutJson(`(layout) => { layout.activePreset = "palette-wide"; }`));
  const wide = await waitFor(evaluate, page, FOCUS_STATE, (state) => state.preset === "palette-wide");
  check(
    "Focus layout: JSON dialog shows the layout and applies a preset (image hidden)",
    layoutJson.version === 1 && Boolean(layoutJson.presets?.default) && wide.preset === "palette-wide" && !wide.visiblePanels.includes("image") && wide.dialogOpen,
    { presets: Object.keys(layoutJson.presets || {}), wide },
  );
  await evaluate(page, applyLayoutJson(`(layout) => { layout.presets["palette-wide"].areas = ["topbar topbar", "tags"]; }`));
  const invalid = await evaluate(page, DIALOG_STATUS);
  check("Focus layout: an invalid layout is rejected with an error", invalid.state === "error" && /cells/.test(invalid.text), invalid);
  await evaluate(page, applyLayoutJson(`(layout) => { layout.activePreset = "default"; layout.presets["palette-wide"].areas = ["topbar topbar", "tags palette"]; }`));
  // Applying saves to storage first (async); wait before closing the dialog.
  await waitFor(evaluate, page, FOCUS_STATE, (state) => state.preset === "default");
  await evaluate(page, press(FOCUS, ESC));
  const escDialog = await evaluate(page, FOCUS_STATE);
  check("Focus Mode: Esc closes the layout dialog before Focus Mode", escDialog.open && !escDialog.dialogOpen && escDialog.preset === "default", escDialog);
  // Customize: move and resize panels, save as a new layout; Esc leaves it first.
  await evaluate(page, clickIn(".lm-focus-customize"));
  const editing = await evaluate(page, EDIT_STATE);
  await evaluate(page, clickStrip("image", '[data-direction="right"]'));
  const moved = await waitFor(evaluate, page, EDIT_STATE, (state) => state.areas !== editing.areas);
  await evaluate(page, clickStrip("image", '[data-axis="columns"][data-step="1"]'));
  const resized = await waitFor(evaluate, page, EDIT_STATE, (state) => state.columns !== moved.columns);
  await evaluate(page, `(() => { const input = ${FOCUS}.querySelector(".lm-focus-layout-name"); input.value = "Test Layout"; return true; })()`);
  await evaluate(page, clickButtonByText("Save as new layout"));
  const saved = await waitFor(evaluate, page, EDIT_STATE, (state) => state.preset === "test-layout");
  // Delete the saved layout (two clicks); built-in layouts cannot be deleted.
  await evaluate(page, clickIn(".lm-focus-delete-layout"));
  const armed = await evaluate(page, EDIT_STATE);
  await evaluate(page, clickIn(".lm-focus-delete-layout"));
  const deleted = await waitFor(evaluate, page, EDIT_STATE, (state) => !state.options.includes("test-layout:Test Layout"));
  check(
    "Focus layout: a saved layout can be deleted (asks once more) and falls back to Default; built-in layouts cannot",
    editing.deleteLayout.disabled &&
      !saved.deleteLayout.disabled &&
      armed.deleteLayout.label === "Confirm delete" &&
      armed.options.includes("test-layout:Test Layout") &&
      deleted.preset === "default" &&
      deleted.deleteLayout.disabled &&
      deleted.deleteLayout.label === "Delete layout",
    { before: editing.deleteLayout, saved: saved.deleteLayout, armed: armed.deleteLayout, deleted: { preset: deleted.preset, options: deleted.options, button: deleted.deleteLayout } },
  );
  await evaluate(page, press(FOCUS, ESC));
  const leftEditing = await evaluate(page, EDIT_STATE);
  check(
    "Focus layout: Customize moves a panel (swap), resizes it, disables impossible sizes, and saves a new layout",
    editing.editing &&
      editing.stripsVisible === 4 &&
      editing.imageRight &&
      !editing.imageLeft &&
      !editing.topbarWider &&
      /"topbar topbar" "palette image" "tags image"/.test(moved.areas) &&
      resized.columns !== moved.columns &&
      saved.options.includes("test-layout:Test Layout") &&
      saved.columns === resized.columns &&
      !leftEditing.editing &&
      leftEditing.open,
    { editing, moved: moved.areas, columns: [moved.columns, resized.columns], options: saved.options, leftEditing },
  );
  await evaluate(page, `(() => { const select = ${FOCUS}.querySelector(".lm-focus-preset"); select.value = "default"; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await waitFor(evaluate, page, FOCUS_STATE, (state) => state.preset === "default");

  // Notices are a toast overlay: showing one moves no panel or control.
  const PANEL_RECTS = `(() => [...${FOCUS}.querySelectorAll(".lm-focus-grid > .lm-focus-panel, .lm-focus-preset, .lm-focus-exit")].map((element) => { const r = element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(","); }).join("|"))()`;
  const TOAST = `(() => { const toast = ${FOCUS}.querySelector(".lm-focus-toast"); return { visible: !toast.hidden && toast.getBoundingClientRect().height > 0, text: toast.textContent, pointerEvents: getComputedStyle(toast).pointerEvents, position: getComputedStyle(toast).position }; })()`;
  // Deduplicate with no duplicates shows a notice and changes nothing else.
  const rectsBefore = await evaluate(page, PANEL_RECTS);
  await evaluate(page, clickButtonByText("Deduplicate"));
  const toast = await waitFor(evaluate, page, TOAST, (state) => state.visible && /duplicate/.test(state.text));
  const rectsWithToast = await evaluate(page, PANEL_RECTS);
  check(
    "Focus Mode notices: shown as a toast overlay that shifts no panels or controls",
    toast.visible && /duplicate/.test(toast.text) && toast.position === "absolute" && toast.pointerEvents === "none" && rectsWithToast === rectsBefore,
    { toast, rectsBefore, rectsWithToast },
  );

  // Scale: a fixed Focus Mode scale, then following Settings › Window scale.
  const unscaled = await evaluate(page, SCALE_STATE);
  await evaluate(page, press(FOCUS, ESC));
  await evaluate(page, SHOW_SETTINGS);
  await evaluate(page, setCheckbox("#lm-focus-scale-window", false));
  await evaluate(page, setRange("#lm-focus-scale", 1.25));
  await evaluate(page, press("document.body", ALT_A));
  const fixed = await waitFor(evaluate, page, SCALE_STATE, (state) => state.zoom === "1.25");
  await evaluate(page, press(FOCUS, ESC));
  await evaluate(page, setCheckbox("#lm-focus-scale-window", true));
  await evaluate(page, setRange("#lm-scale-slider", 1.2));
  await evaluate(page, press("document.body", ALT_A));
  const followed = await waitFor(evaluate, page, SCALE_STATE, (state) => state.zoom === "1.2");
  await evaluate(page, setRange("#lm-scale-slider", 1));
  const reset = await waitFor(evaluate, page, SCALE_STATE, (state) => state.zoom === "");
  const fills = (state) => Math.abs(state.width - state.innerWidth) < 3 && Math.abs(state.height - state.innerHeight) < 3 && state.right <= state.innerWidth + 1;
  check(
    "Focus Mode scale: a fixed scale or the window scale zooms the workspace, which still fills the viewport",
    fixed.zoom === "1.25" &&
      fixed.topbarHeight > unscaled.topbarHeight * 1.1 &&
      fills(fixed) &&
      followed.zoom === "1.2" &&
      fills(followed) &&
      reset.zoom === "" &&
      fills(unscaled),
    { unscaled, fixed, followed, reset: reset.zoom },
  );

  await evaluate(page, press(FOCUS, ESC));
  const closed = await waitFor(evaluate, page, FOCUS_STATE, (state) => !state.open);
  check("Focus Mode: Esc with nothing open exits and restores page scrolling", !closed.open && closed.pageOverflow === "", closed);

  // Shortcut capture priority.
  await evaluate(page, INSTALL_PAGE_HANDLER);
  await evaluate(page, press("document.body", ALT_A));
  await sleep(300);
  const cooperative = await evaluate(page, PRIORITY_STATE);
  check("Shortcut priority (default): a page handler that uses Alt+A goes first", !cooperative.open && cooperative.pageHandler === 1, cooperative);
  const strictOn = await evaluate(page, toggleStrictCapture);
  await sleep(500);
  await evaluate(page, press("document.body", ALT_A));
  const strict = await waitFor(evaluate, page, PRIORITY_STATE, (state) => state.open);
  check("Shortcut priority (strict): QuickTag handles Alt+A before the page", strictOn && strict.open && strict.pageHandler === 1, strict);
  await evaluate(page, clickIn(".lm-focus-exit"));
  await evaluate(page, toggleStrictCapture);
  await sleep(300);

  // Strict-CSP page: overlay styles apply.
  const csp = await open(`${origin}/csp`);
  await waitFor(evaluate, csp, READY, Boolean, 10000);
  await evaluate(csp, press("document.body", ALT_A));
  const cspFocus = await waitFor(evaluate, csp, FOCUS_STATE, (state) => state.open);
  check("Focus Mode on a strict-CSP page: overlay opens and its styles apply", cspFocus.open && cspFocus.position === "fixed" && /topbar/.test(cspFocus.areas), cspFocus);
  await evaluate(csp, press(FOCUS, ESC));
}
