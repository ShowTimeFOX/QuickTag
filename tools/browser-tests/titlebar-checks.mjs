// Title bar checks shared by chrome.mjs and firefox.mjs: clicks on the title
// bar buttons (Ghost Mode, Focus Mode) always fire and never move the window,
// and dragging the title moves it by exactly the pointer distance, at a
// window scale other than 100% (where the old drag code jumped).
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const setScale = (value) => `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  const slider = root.querySelector("#lm-scale-slider");
  slider.value = ${JSON.stringify(String(value))};
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`;
const STATE = `(() => {
  const root = ${ROOT};
  const win = root.querySelector("#lazymod-window");
  const rect = win.getBoundingClientRect();
  const center = (selector) => { const box = root.querySelector(selector).getBoundingClientRect(); return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }; };
  const focus = root.querySelector("#lm-focus-root");
  return {
    left: Math.round(rect.left * 10) / 10,
    top: Math.round(rect.top * 10) / 10,
    ghost: win.classList.contains("ghost-mode"),
    focusOpen: Boolean(focus && !focus.hidden),
    ghostIcon: center("#lm-ghost-toggle svg"),
    focusIcon: center("#lm-focus-header svg"),
    title: center(".lazymod-app-title"),
    dragging: win.classList.contains("is-dragging"),
  };
})()`;
const ESC_FOCUS = `(() => { ${ROOT}.querySelector("#lm-focus-root").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true })); return true; })()`;

export async function runTitleBarChecks({ open, evaluate, pointer, check, origin }) {
  const page = await open(`${origin}/plain`);
  await waitFor(evaluate, page, READY, Boolean, 10000);
  await evaluate(page, setScale(0.9));
  await sleep(300);
  const start = await evaluate(page, STATE);

  // A click with a little hand jitter, pressed on the button's icon.
  const jitterClick = (point) => pointer.drag(page, point.x, point.y, point.x + 2, point.y + 1);

  await jitterClick(start.ghostIcon);
  const ghostOn = await waitFor(evaluate, page, STATE, (state) => state.ghost, 3000);
  await jitterClick(ghostOn.ghostIcon);
  const ghostOff = await waitFor(evaluate, page, STATE, (state) => !state.ghost, 3000);
  check(
    "Title bar: a slightly moving click on the Ghost Mode icon toggles it and never moves the window (90% scale)",
    ghostOn.ghost && !ghostOff.ghost && ghostOn.left === start.left && ghostOn.top === start.top && ghostOff.left === start.left && ghostOff.top === start.top,
    { start: [start.left, start.top], ghostOn: [ghostOn.ghost, ghostOn.left, ghostOn.top], ghostOff: [ghostOff.ghost, ghostOff.left, ghostOff.top] },
  );

  await jitterClick(start.focusIcon);
  const focusOpened = await waitFor(evaluate, page, STATE, (state) => state.focusOpen, 3000);
  await evaluate(page, ESC_FOCUS);
  const focusClosed = await waitFor(evaluate, page, STATE, (state) => !state.focusOpen, 3000);
  check(
    "Title bar: a slightly moving click on the Focus Mode icon opens Focus Mode and never moves the window",
    focusOpened.focusOpen && focusOpened.left === start.left && focusOpened.top === start.top && !focusClosed.focusOpen,
    { opened: [focusOpened.focusOpen, focusOpened.left, focusOpened.top], start: [start.left, start.top] },
  );

  // Dragging the title moves the window by exactly the pointer distance.
  await pointer.drag(page, start.title.x, start.title.y, start.title.x + 60, start.title.y + 40);
  await sleep(200);
  const dragged = await evaluate(page, STATE);
  check(
    "Title bar: dragging the title moves the window by the pointer distance, without a jump (90% scale)",
    Math.abs(dragged.left - (start.left + 60)) <= 1 && Math.abs(dragged.top - (start.top + 40)) <= 1 && !dragged.dragging,
    { start: [start.left, start.top], dragged: [dragged.left, dragged.top], expected: [start.left + 60, start.top + 40] },
  );

  // A release the page never sees (e.g. over an iframe) must not leave the
  // window stuck to the cursor: a move without buttons ends the drag.
  const stuck = await evaluate(
    page,
    `(() => {
      const root = ${ROOT};
      const title = root.querySelector(".lazymod-app-title");
      const box = title.getBoundingClientRect();
      const x = box.left + 10, y = box.top + box.height / 2;
      const win = root.querySelector("#lazymod-window");
      const before = win.getBoundingClientRect().left;
      const opts = (cx, cy, buttons) => ({ pointerId: 9, isPrimary: true, button: 0, buttons, clientX: cx, clientY: cy, bubbles: true, cancelable: true, composed: true, pointerType: "mouse" });
      title.dispatchEvent(new PointerEvent("pointerdown", opts(x, y, 1)));
      document.dispatchEvent(new PointerEvent("pointermove", opts(x + 80, y, 0)));
      document.dispatchEvent(new PointerEvent("pointermove", opts(x + 120, y, 1)));
      return { before: Math.round(before), after: Math.round(win.getBoundingClientRect().left), dragging: win.classList.contains("is-dragging") };
    })()`,
  );
  check("Title bar: a drag ends when the button is no longer pressed (the window does not follow the cursor)", stuck.before === stuck.after && !stuck.dragging, stuck);

  await evaluate(page, setScale(1));
}
