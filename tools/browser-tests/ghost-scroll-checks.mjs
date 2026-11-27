// Ghost scroll checks (pack-ghost-scroll.js), called from pack-checks.mjs
// with the pack switcher closed and more packs installed than the list shows.
// Real mouse input: hover alone does nothing; the wheel over the switcher
// opens the floating list, highlights the pack under the pointer, and a click
// selects it; leaving, the idle timeout, Escape, and an outside pointerdown
// dismiss it (fade-out); the Settings toggle turns it off immediately and in
// other tabs.
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const IDLE_MS = 2000;
const FADE_SETTLE_MS = 400;

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
  const activeIndex = packs.items.findIndex((item) => item.active);
  const direction = activeIndex > packs.items.length - 4 ? -1 : 1;
  const bodyBefore = (await ghost()).bodyScrollTop;
  const first = await wheelOpen(120 * direction);
  await sleep(150);
  const opened = await ghost();
  const underPointer = await evaluate(page, itemAt(first.point));
  check(
    "Ghost scroll: the mouse wheel over the switcher opens the floating pack list over it (dropdown closed, tagger not scrolled) and highlights the pack under the pointer",
    opened.open &&
      !opened.dropdownOpen &&
      opened.coversSwitcher &&
      opened.items.length === packs.items.length &&
      opened.bodyScrollTop === bodyBefore &&
      opened.hovered.length === 1 &&
      opened.hovered[0] === underPointer &&
      opened.hovered[0] !== packs.activePack &&
      opened.activePack === packs.activePack,
    { opened: { ...opened, items: opened.items.length }, underPointer, activePack: packs.activePack, packs: packs.items.length },
  );

  // More wheel ticks scroll the list; the highlight follows the pointer.
  await pointer.wheel(page, first.point.x, first.point.y, 120 * direction);
  await sleep(150);
  const scrolled = await ghost();
  const underPointerAfter = await evaluate(page, itemAt(first.point));
  check(
    "Ghost scroll: further wheel ticks scroll through the packs, and the highlight follows the pack under the pointer",
    scrolled.open && scrolled.scrollTop !== opened.scrollTop && scrolled.hovered.length === 1 && scrolled.hovered[0] === underPointerAfter && underPointerAfter !== opened.hovered[0],
    { before: [opened.scrollTop, opened.hovered], after: [scrolled.scrollTop, scrolled.hovered], underPointerAfter },
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
