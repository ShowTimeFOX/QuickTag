// Left/right arrow buttons for a horizontally scrolling tab strip.
//
// The scroller is wrapped in `.lazymod-scroller-wrap`; the arrows are shown
// only while the content overflows, and the arrow at an edge is disabled.
// State follows scrolling, resizing, and re-rendered content.

const SVG_NS = "http://www.w3.org/2000/svg";
const SCROLL_STEP_RATIO = 0.7;
const EDGE_TOLERANCE_PX = 1;

function createArrowButton(direction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `lazymod-scroll-arrow lazymod-scroll-arrow-${direction}`;
  const label = direction === "prev" ? "Scroll left" : "Scroll right";
  button.setAttribute("aria-label", label);
  button.title = label;
  // Arrows are mouse helpers; keyboard users scroll with focusable tabs.
  button.tabIndex = -1;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", direction === "prev" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5");
  svg.appendChild(path);
  button.appendChild(svg);
  return button;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Adds scroll arrows around `scroller`. Returns a function that refreshes them. */
export function attachScrollArrows(scroller) {
  const wrap = document.createElement("div");
  wrap.className = "lazymod-scroller-wrap";
  scroller.before(wrap);
  const previous = createArrowButton("prev");
  const next = createArrowButton("next");
  wrap.append(previous, scroller, next);

  function update() {
    wrap.hidden = scroller.hidden;
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    const overflowing = maxScroll > EDGE_TOLERANCE_PX;
    wrap.classList.toggle("has-overflow", overflowing);
    previous.hidden = !overflowing;
    next.hidden = !overflowing;
    previous.disabled = scroller.scrollLeft <= EDGE_TOLERANCE_PX;
    next.disabled = scroller.scrollLeft >= maxScroll - EDGE_TOLERANCE_PX;
  }

  function scrollByPage(direction) {
    scroller.scrollBy({
      left: direction * Math.max(40, scroller.clientWidth * SCROLL_STEP_RATIO),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  previous.addEventListener("click", () => scrollByPage(-1));
  next.addEventListener("click", () => scrollByPage(1));
  scroller.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(scroller);
  // Tabs are re-rendered and the strip is hidden in flat view.
  new MutationObserver(update).observe(scroller, { childList: true, attributes: true, attributeFilter: ["hidden"] });
  update();
  return update;
}

/** Horizontal tab strips scroll with the vertical mouse wheel. */
export function enableWheelScrolling(scroller) {
  scroller.addEventListener(
    "wheel",
    (event) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      event.preventDefault();
      scroller.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    },
    { passive: false },
  );
}
