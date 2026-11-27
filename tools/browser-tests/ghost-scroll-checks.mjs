// Ghost scroll checks (pack-ghost-scroll.js), called from pack-checks.mjs
// with the pack switcher closed and more packs installed than the list shows.
// Real mouse input: hover alone does nothing; the wheel over the switcher
// opens the floating reel, each wheel step slides the next pack under the
// still pointer (first and last packs included), the pack under the pointer
// is highlighted, and a click selects it; leaving, the idle timeout, Escape, and an outside pointerdown
// dismiss it (fade-out); the Settings toggle turns it off immediately and in
// other tabs.
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const IDLE_MS = 2000;
const FADE_SETTLE_MS = 400;
/** Long enough for a smooth reel slide to finish. */
const SLIDE_MS = 700;

const GHOST_STATE = `(() => {
  const root = ${ROOT};
  const list = root.querySelector("#lm-pack-ghost-list");
  const toggle = root.querySelector("#lm-pack-switcher");
  const a = list.getBoundingClientRect();
  const b = toggle.getBoundingClientRect();
  const style = getComputedStyle(list);
  return {
    open: !list.hidden,
    closing: list.classList.contains("is-closing"),
    opacity: parseFloat(style.opacity),
    transition: style.transitionDuration + " " + style.transitionTimingFunction,
    items: [...list.querySelectorAll(".lazymod-ghost-item")].map((item) => item.querySelector(".lazymod-ghost-item-name").textContent),
    hovered: [...list.querySelectorAll(".lazymod-ghost-item.is-hovered")].map((item) => item.querySelector(".lazymod-ghost-item-name").textContent),
    scrollTop: list.scrollTop,
    rowHeight: list.querySelector(".lazymod-ghost-item")?.offsetHeight || 0,
    spacers: [...list.querySelectorAll(".lazymod-ghost-spacer")].map((spacer) => spacer.dataset.edge + ":" + Math.round(spacer.getBoundingClientRect().height)),
    borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat),
    mask: style.maskImage || style.webkitMaskImage || "",
    coversSwitcher: !list.hidden && a.top <= b.top + 1 && a.bottom >= b.bottom - 1 && a.left <= b.left + 1 && a.right >= b.right - 1,
    dropdownOpen: !root.querySelector("#lm-pack-browser").hidden,
    activePack: root.querySelector("#lm-pack-current").textContent,
    bodyScrollTop: root.querySelector("#lm-view-main").scrollTop,
    checkbox: root.querySelector("#lm-ghost-scroll").checked,
  };
})()`;
/** Name of the ghost list item at a viewport point ("" if none). */
const itemAt = (point) => `(() => {
  const hit = ${ROOT}.elementFromPoint(${point.x}, ${point.y});
  return hit?.closest?.(".lazymod-ghost-item")?.querySelector(".lazymod-ghost-item-name").textContent || "";
})()`;
const ESCAPE = `(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); return true; })()`;
const OUTSIDE_POINTERDOWN = `(() => { document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true, isPrimary: true, pointerType: "mouse" })); return true; })()`;
const clickById = (id) => `(() => { ${ROOT}.querySelector(${JSON.stringify(id)}).click(); return true; })()`;
const SYNTHETIC_WHEEL_PREVENTED = `(() => { const event = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true, composed: true }); ${ROOT}.querySelector("#lm-pack-switcher").dispatchEvent(event); return event.defaultPrevented; })()`;

export async function runGhostScrollChecks({ open, evaluate, pointer, check, origin }, page, { PACK_STATE, pointOf }) {
  const switcherPoint = () => evaluate(page, pointOf("#lm-pack-switcher"));
  const ghost = () => evaluate(page, GHOST_STATE);
  /** Opens the ghost list with one real wheel tick over the switcher. */
  const wheelOpen = async (deltaY = 120) => {
    const point = await switcherPoint();
    await pointer.wheel(page, point.x, point.y, deltaY);
    return { point, state: await waitFor(evaluate, page, GHOST_STATE, (state) => state.open && !state.closing, 3000) };
  };

  // Hover alone never opens it.
  const point = await switcherPoint();
  await pointer.move(page, point.x, point.y);
  await sleep(400);
  const hovered = await ghost();
  check("Ghost scroll: hovering the pack switcher alone opens nothing", point.hits && !hovered.open && !hovered.dropdownOpen, { point, hovered });

  // Wheel over the switcher: the floating list opens over it (dropdown stays
  // closed, the tagger does not scroll), with the pack under the pointer highlighted.
  const packs = await evaluate(page, PACK_STATE);
  const names = packs.items.map((item) => item.name);
  const activeIndex = names.indexOf(packs.activePack);
  // One wheel tick (120 px) is two packs; leave room for two ticks.
  const direction = activeIndex + 4 <= names.length - 1 ? 1 : -1;
  const bodyBefore = (await ghost()).bodyScrollTop;
  const first = await wheelOpen(120 * direction);
  await sleep(SLIDE_MS);
  const opened = await ghost();
  const underPointer = await evaluate(page, itemAt(first.point));
  check(
    "Ghost scroll: the mouse wheel over the switcher opens the reel over it (dropdown closed, tagger not scrolled) and slides the next packs under the still pointer, highlighted",
    opened.open &&
      !opened.dropdownOpen &&
      opened.coversSwitcher &&
      opened.items.join() === names.join() &&
      opened.bodyScrollTop === bodyBefore &&
      opened.hovered.length === 1 &&
      opened.hovered[0] === underPointer &&
      underPointer === names[activeIndex + 2 * direction] &&
      Math.abs(opened.scrollTop - (activeIndex + 2 * direction) * opened.rowHeight) <= 1 &&
      opened.activePack === packs.activePack,
    { hovered: opened.hovered, underPointer, expected: names[activeIndex + 2 * direction], scrollTop: opened.scrollTop, rowHeight: opened.rowHeight, activePack: packs.activePack },
  );
  check(
    "Ghost scroll: the reel has borders on the left and right only, a top-and-bottom fade mask, and spacers above and below the packs",
    opened.borders[0] === 0 && opened.borders[2] === 0 && opened.borders[1] >= 1 && opened.borders[3] >= 1 && /linear-gradient/.test(opened.mask) && /transparent|rgba\(0, 0, 0, 0\)/.test(opened.mask) && opened.spacers.length === 2 && opened.spacers.every((spacer) => Number(spacer.split(":")[1]) > 0),
    { borders: opened.borders, mask: opened.mask, spacers: opened.spacers },
  );

  // More wheel ticks keep sliding packs under the same pointer position.
  await pointer.wheel(page, first.point.x, first.point.y, 120 * direction);
  await sleep(SLIDE_MS);
  const scrolled = await ghost();
  const underPointerAfter = await evaluate(page, itemAt(first.point));
  check(
    "Ghost scroll: further wheel ticks slide the following packs under the pointer, and the highlight follows live",
    scrolled.open && scrolled.scrollTop !== opened.scrollTop && scrolled.hovered.length === 1 && scrolled.hovered[0] === underPointerAfter && underPointerAfter === names[activeIndex + 4 * direction],
    { before: [opened.scrollTop, opened.hovered], after: [scrolled.scrollTop, scrolled.hovered], expected: names[activeIndex + 4 * direction] },
  );

  // A click selects the highlighted pack and closes the list.
  const choice = scrolled.hovered[0];
  await pointer.click(page, first.point.x, first.point.y);
  const chosen = await waitFor(evaluate, page, GHOST_STATE, (state) => !state.open, 2000);
  const afterChoice = await evaluate(page, PACK_STATE);
  check(
    "Ghost scroll: clicking a pack selects it and closes the list (the dropdown stays closed)",
    !chosen.open && !chosen.dropdownOpen && chosen.activePack === choice && afterChoice.items.find((item) => item.active)?.name === choice,
    { choice, activePack: chosen.activePack, dropdownOpen: chosen.dropdownOpen },
  );

  // The first and the last pack can both be scrolled under the pointer (spacers).
  const ends = await wheelOpen(-120);
  for (let tick = 0; tick < Math.ceil(names.length / 2) + 1; tick += 1) await pointer.wheel(page, ends.point.x, ends.point.y, -120);
  await sleep(SLIDE_MS);
  const atFirst = await ghost();
  const firstUnder = await evaluate(page, itemAt(ends.point));
  for (let tick = 0; tick < Math.ceil(names.length / 2) + 1; tick += 1) await pointer.wheel(page, ends.point.x, ends.point.y, 120);
  await sleep(SLIDE_MS);
  const atLast = await ghost();
  const lastUnder = await evaluate(page, itemAt(ends.point));
  await evaluate(page, ESCAPE);
  await sleep(FADE_SETTLE_MS);
  check(
    "Ghost scroll: the first and the last pack can both be scrolled all the way under the pointer, and the reel stops there",
    atFirst.open && firstUnder === names[0] && atFirst.hovered[0] === names[0] && atLast.open && lastUnder === names[names.length - 1] && atLast.hovered[0] === names[names.length - 1] && (await ghost()).activePack === choice,
    { firstUnder, lastUnder, expected: [names[0], names[names.length - 1]], hovered: [atFirst.hovered, atLast.hovered] },
  );

  // Leaving the list and switcher: a short ease-out fade, then hidden; nothing selected.
  const leave = await wheelOpen();
  await pointer.move(page, 5, 5);
  const fading = await ghost();
  await sleep(FADE_SETTLE_MS);
  const left = await ghost();
  check(
    "Ghost scroll: leaving the list fades it out (about 150 ms, ease-out) without selecting anything",
    /0\.15s ease-out/.test(leave.state.transition) && (fading.closing || !fading.open) && !left.open && left.activePack === choice,
    { transition: leave.state.transition, fading: [fading.open, fading.closing, fading.opacity], left: [left.open, left.activePack] },
  );

  // Idle timeout with a still pointer.
  await wheelOpen();
  await sleep(IDLE_MS / 2);
  const stillOpen = await ghost();
  await sleep(IDLE_MS / 2 + FADE_SETTLE_MS);
  const idled = await ghost();
  check(
    "Ghost scroll: with a still pointer it stays open briefly, then fades out after the idle timeout",
    stillOpen.open && !stillOpen.closing && !idled.open && idled.activePack === choice,
    { stillOpen: [stillOpen.open, stillOpen.closing], idled: idled.open },
  );

  // Escape and an outside pointerdown close it.
  await wheelOpen();
  await evaluate(page, ESCAPE);
  await sleep(FADE_SETTLE_MS);
  const escaped = await ghost();
  await wheelOpen();
  await evaluate(page, OUTSIDE_POINTERDOWN);
  await sleep(FADE_SETTLE_MS);
  const outside = await ghost();
  check("Ghost scroll: Escape and a pointerdown outside close it", !escaped.open && !outside.open && outside.activePack === choice, { escaped: escaped.open, outside: outside.open });

  // Settings toggle: off stops wheel-triggered ghost scroll at once (also in
  // another tab); the dropdown keeps working; on again restores it.
  await pointer.move(page, 5, 5);
  await evaluate(page, clickById("#lm-tab-btn-sites"));
  await evaluate(page, clickById("#lm-ghost-scroll"));
  const toggledOff = await ghost();
  await evaluate(page, clickById("#lm-tab-btn-main"));
  await sleep(200);
  const offPoint = await switcherPoint();
  await pointer.wheel(page, offPoint.x, offPoint.y, 120);
  await sleep(400);
  const disabled = await ghost();
  const prevented = await evaluate(page, SYNTHETIC_WHEEL_PREVENTED);
  const dropdownPoint = await switcherPoint();
  await pointer.click(page, dropdownPoint.x, dropdownPoint.y);
  const dropdown = await waitFor(evaluate, page, GHOST_STATE, (state) => state.dropdownOpen, 3000);
  await evaluate(page, `(() => { ${ROOT}.querySelector("#lm-pack-search").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, composed: true })); return true; })()`);
  await waitFor(evaluate, page, GHOST_STATE, (state) => !state.dropdownOpen, 3000);

  const other = await open(`${origin}/plain`);
  await waitFor(evaluate, other, READY, Boolean, 10000);
  const otherOff = await evaluate(other, GHOST_STATE);
  await evaluate(page, clickById("#lm-ghost-scroll"));
  const otherOn = await waitFor(evaluate, other, GHOST_STATE, (state) => state.checkbox, 3000);
  check(
    "Ghost scroll setting: turning it off stops the wheel list immediately (wheel left to the page), the dropdown still opens, and it is saved and synced to other tabs",
    toggledOff.checkbox === false && !disabled.open && !prevented && dropdown.dropdownOpen && !dropdown.open && otherOff.checkbox === false && otherOn.checkbox === true,
    { toggledOff: toggledOff.checkbox, disabledOpen: disabled.open, prevented, dropdown: dropdown.dropdownOpen, otherOff: otherOff.checkbox, otherOn: otherOn.checkbox },
  );

  // On again: the wheel opens the list in this tab.
  const reenabled = await wheelOpen();
  await evaluate(page, ESCAPE);
  await sleep(FADE_SETTLE_MS);
  check("Ghost scroll setting: turned on again, the wheel opens the list", reenabled.state.open && (await ghost()).checkbox, { open: reenabled.state.open });
}
