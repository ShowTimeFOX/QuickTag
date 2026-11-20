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
  `(() => { [...${FOCUS}.querySelectorAll("button")].find((button) => button.textContent.trim() === ${JSON.stringify(text)}).click(); return true; })()`;
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
  await evaluate(page, clickImageZoom("1:1"));
  const tallActual = await evaluate(page, IMAGE_FIT_STATE);
  check(
    "Focus image: 1:1 shows the natural size and scrolls inside the tile (tags tile unchanged)",
    tallActual.zoom === "actual" &&
      Math.abs(tallActual.image.height - 3000) < 2 &&
      tallActual.scrolls &&
      tallActual.panel.bottom <= tallActual.tags.top + 1.5 &&
      Math.abs(tallActual.tags.top - tallFit.tags.top) < 1.5,
    tallActual,
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
      return {
        addInput: height(".lm-focus-add-input"),
        filter: height(".lm-focus-filter"),
        badgeFont: parseFloat(getComputedStyle(focus.querySelector(".lm-focus-badge-toggle")).fontSize),
        badge: height(".lm-focus-badge"),
        remove: [remove.width, remove.height],
      };
    })()`,
  );
  check(
    "Focus tags: compact inputs (add tags, palette search) and larger badges with a 32px × target",
    sizes.addInput <= 32 && sizes.filter <= 32 && sizes.badgeFont >= 14 && sizes.badge >= 32 && sizes.remove[0] >= 31.5 && sizes.remove[1] >= 31.5,
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

  // Palette panel synchronized with the tag states.
  const tag = await evaluate(page, CLICK_FIRST_PALETTE_CHIP);
  const afterAdd = await evaluate(page, FOCUS_STATE);
  const chipActive = await evaluate(page, paletteChipState(tag));
  await evaluate(page, `(() => { ${paletteChip(tag)}.click(); return true; })()`);
  const chipMuted = await evaluate(page, paletteChipState(tag));
  const afterMute = await evaluate(page, FOCUS_STATE);
  check(
    "Focus palette: chips add, then mute, tags (synchronized with the tag list and page)",
    afterAdd.paletteChips > 0 &&
      afterAdd.field.split(" ").includes(tag) &&
      chipActive === "active" &&
      chipMuted === "muted" &&
      !afterMute.field.split(" ").includes(tag) &&
      afterMute.badges.includes(`~${tag}`),
    { tag, chipActive, chipMuted, field: afterMute.field },
  );

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
  await evaluate(page, press(FOCUS, ESC));
  const escDialog = await evaluate(page, FOCUS_STATE);
  check("Focus Mode: Esc closes the layout dialog before Focus Mode", escDialog.open && !escDialog.dialogOpen && escDialog.preset === "default", escDialog);
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
