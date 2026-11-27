// Ghost scroll: while a vertical list scrolls, the item nearest its center
// gets `is-centered`, the list gets `is-ghost-scrolling` (styles dim the
// neighbors), and a ghost overlay names the centered item. The overlay hides
// `idleMs` after the last scroll event.
//
// Used by the tagger's pack switcher (content/ui/pack-browser.js). DOM is
// touched only inside the returned functions and listeners, never at module
// level.
//
// It listens only to the list's own passive `scroll` events (no wheel
// handling, no preventDefault), so page scrolling is never captured. Scrolls
// made by code through `setScrollTop()` are recognized by their target
// position and do not start ghost scroll. Sizes in the styles should change
// with `transform` only: a layout change would move the scroll position,
// fire another scroll event, and keep the overlay from hiding.

export const GHOST_IDLE_MS = 500;

/**
 * @param {object} options
 * @param {HTMLElement} options.list Scrollable list; its element children are the items.
 * @param {HTMLElement} options.ghost Overlay element; `data-visible` is "true" or "false".
 * @param {(item: Element, index: number, total: number) => Node[]} options.renderGhost Overlay content for the centered item.
 * @param {number} [options.idleMs]
 */
export function attachGhostScroll({ list, ghost, renderGhost, idleMs = GHOST_IDLE_MS }) {
  let timer = null;
  let expectedScrollTop = null;

  function markCentered() {
    const items = [...list.children];
    if (!items.length) return;
    const listRect = list.getBoundingClientRect();
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
    ghost.replaceChildren(...renderGhost(centered, items.indexOf(centered), items.length));
  }

  function end() {
    clearTimeout(timer);
    list.classList.remove("is-ghost-scrolling");
    ghost.dataset.visible = "false";
    list.querySelectorAll(":scope > .is-centered").forEach((item) => item.classList.remove("is-centered"));
  }

  function handleScroll() {
    const expected = expectedScrollTop;
    expectedScrollTop = null;
    if (expected !== null && Math.abs(list.scrollTop - expected) <= 1) return;
    markCentered();
    list.classList.add("is-ghost-scrolling");
    ghost.dataset.visible = "true";
    clearTimeout(timer);
    timer = setTimeout(end, idleMs);
  }

  /** Scrolls the list from code without starting ghost scroll. */
  function setScrollTop(value) {
    const target = Math.round(Math.max(0, Math.min(value, list.scrollHeight - list.clientHeight)));
    if (Math.abs(list.scrollTop - target) < 1) return;
    expectedScrollTop = target;
    list.scrollTop = target;
  }

  ghost.dataset.visible = "false";
  list.addEventListener("scroll", handleScroll, { passive: true });
  return { end, setScrollTop };
}
