// Focus Mode image preview: the page image found by the site profile.
//
// One view model for every zoom level: the image is absolutely positioned
// and sized from `view.scale` (displayed px per image px) and `view.x/y`.
// - Fit (default) starts at the scale that fits the panel (never upscaled);
//   1:1 starts at the natural size.
// - The mouse wheel zooms around the pointer; dragging pans. Wheel events
//   are only handled inside the image area (never the page or panel).
// - Fit, 1:1, double-click, and the zoom label reset the view, so it can't
//   get stuck; pan is clamped so the image always stays in view.
//
// The preview is an <img> in the page's document, so the page's CSP
// (img-src) and the image server's rules apply exactly as for the page
// itself; a blocked or failed load shows a message instead.
import { getTargetImageURL } from "../page.js";
import { el, button, ICONS } from "./dom.js";

const MAX_SCALE = 8;
const WHEEL_ZOOM_SPEED = 0.0015;

export function createFocusImagePanel(api) {
  const image = el("img", { className: "lm-focus-image", attrs: { alt: "Image from this page", decoding: "async", draggable: "false" } });
  const message = el("p", { className: "lm-focus-empty", hidden: true });
  const viewport = el("div", { className: "lm-focus-image-viewport", attrs: { title: "Scroll to zoom, drag to move, double-click to reset" } }, [image, message]);
  const dimensions = el("span", { className: "lm-focus-meta", attrs: { "aria-live": "polite" } });
  const zoomLabel = el("button", { className: "lazymod-btn lm-focus-zoom-label", text: "100%", title: "Reset zoom and position", attrs: { type: "button" } });
  const fitButton = button("Fit", { iconPath: ICONS.fit, title: "Fit the image to the panel" });
  const actualButton = button("1:1", { iconPath: ICONS.actual, title: "Show the image at its natural size" });
  const reloadButton = button("", { iconPath: ICONS.sync, className: "lazymod-btn lm-focus-icon-btn", title: "Find the page image again", attrs: { "aria-label": "Find the page image again" } });

  const element = el("section", { className: "lm-focus-panel lm-focus-image-panel", attrs: { "aria-label": "Image preview" } }, [
    el("div", { className: "lm-focus-panel-header" }, [
      el("h2", { className: "lazymod-title", text: "Image" }),
      el("div", { className: "lm-focus-toolbar" }, [dimensions, zoomLabel, fitButton, actualButton, reloadButton]),
    ]),
    viewport,
  ]);

  let currentUrl = null;
  const view = { scale: 1, x: 0, y: 0, ready: false, drag: null };

  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
    image.hidden = Boolean(text);
    viewport.classList.toggle("has-image", !text);
  }

  const natural = () => ({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });

  function fitScale() {
    const { width, height } = natural();
    if (!width || !height || !viewport.clientWidth || !viewport.clientHeight) return 1;
    return Math.min(1, viewport.clientWidth / width, viewport.clientHeight / height);
  }

  /** Keeps the image in view: centered when smaller than the panel, edges never inside when larger. */
  function clampPosition() {
    const { width, height } = natural();
    const shownWidth = width * view.scale;
    const shownHeight = height * view.scale;
    const clampAxis = (offset, shown, space) => (shown <= space ? (space - shown) / 2 : Math.min(0, Math.max(space - shown, offset)));
    view.x = clampAxis(view.x, shownWidth, viewport.clientWidth);
    view.y = clampAxis(view.y, shownHeight, viewport.clientHeight);
  }

  function applyView() {
    if (!view.ready) return;
    clampPosition();
    const { width, height } = natural();
    image.style.width = `${width * view.scale}px`;
    image.style.height = `${height * view.scale}px`;
    image.style.transform = `translate(${view.x}px, ${view.y}px)`;
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    viewport.classList.toggle("can-pan", width * view.scale > viewport.clientWidth + 0.5 || height * view.scale > viewport.clientHeight + 0.5);
  }

  /** Back to the selected mode's start: fit (or 1:1), centered. */
  function resetView() {
    const zoom = api.getPrefs().imageZoom;
    view.scale = zoom === "actual" ? 1 : fitScale();
    // Top-left for a larger image; clampPosition centers a smaller one.
    view.x = 0;
    view.y = 0;
    applyView();
  }

  function applyZoom() {
    const zoom = api.getPrefs().imageZoom;
    viewport.dataset.zoom = zoom;
    fitButton.setAttribute("aria-pressed", String(zoom === "fit"));
    actualButton.setAttribute("aria-pressed", String(zoom === "actual"));
  }

  function setZoom(zoom) {
    api.setPref("imageZoom", zoom);
    applyZoom();
    resetView();
  }

  /** Zooms to `scale`, keeping the image point under (clientX, clientY) in place. */
  function zoomAt(scale, clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const minScale = Math.min(fitScale(), 1);
    const next = Math.min(MAX_SCALE, Math.max(minScale, scale));
    view.x = pointX - ((pointX - view.x) * next) / view.scale;
    view.y = pointY - ((pointY - view.y) * next) / view.scale;
    view.scale = next;
    applyView();
  }

  function refresh() {
    applyZoom();
    const url = getTargetImageURL();
    if (!url) {
      currentUrl = null;
      view.ready = false;
      image.removeAttribute("src");
      dimensions.textContent = "";
      showMessage("No image found on this page. Set the image selector with Pick element in Settings.");
      return;
    }
    if (url === currentUrl && image.complete && image.naturalWidth) {
      resetView();
      return;
    }
    currentUrl = url;
    view.ready = false;
    dimensions.textContent = "Loading…";
    showMessage("");
    image.src = url;
  }

  image.addEventListener("load", () => {
    dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    showMessage("");
    view.ready = true;
    resetView();
  });
  image.addEventListener("error", () => {
    view.ready = false;
    dimensions.textContent = "";
    showMessage("The image could not be loaded here. The page's security policy or the image server may block it.");
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!view.ready || image.hidden) return;
      event.preventDefault();
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * viewport.clientHeight : event.deltaY;
      zoomAt(view.scale * Math.exp(-pixels * WHEEL_ZOOM_SPEED), event.clientX, event.clientY);
    },
    { passive: false },
  );

  viewport.addEventListener("pointerdown", (event) => {
    if (!view.ready || image.hidden || event.button !== 0) return;
    event.preventDefault();
    view.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: view.x, y: view.y };
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; dragging still works inside the panel.
    }
    viewport.classList.add("is-dragging");
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!view.drag || event.pointerId !== view.drag.pointerId) return;
    view.x = view.drag.x + event.clientX - view.drag.startX;
    view.y = view.drag.y + event.clientY - view.drag.startY;
    applyView();
  });
  const endDrag = (event) => {
    if (!view.drag || event.pointerId !== view.drag.pointerId) return;
    view.drag = null;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("lostpointercapture", endDrag);
  // Double-click resets to the selected mode (fit or 1:1).
  viewport.addEventListener("dblclick", resetView);

  fitButton.addEventListener("click", () => setZoom("fit"));
  actualButton.addEventListener("click", () => setZoom("actual"));
  zoomLabel.addEventListener("click", resetView);
  reloadButton.addEventListener("click", () => {
    currentUrl = null;
    refresh();
  });

  // Panel size changes (layout, window, scale): refit in fit mode, else keep the image in view.
  let lastWidth = 0;
  let lastHeight = 0;
  new ResizeObserver(() => {
    if (!view.ready || (viewport.clientWidth === lastWidth && viewport.clientHeight === lastHeight)) return;
    const wasFit = Math.abs(view.scale - fitScaleFor(lastWidth, lastHeight)) < 0.001;
    lastWidth = viewport.clientWidth;
    lastHeight = viewport.clientHeight;
    if (wasFit && api.getPrefs().imageZoom === "fit") resetView();
    else applyView();
  }).observe(viewport);

  function fitScaleFor(width, height) {
    const size = natural();
    if (!size.width || !width || !height) return -1;
    return Math.min(1, width / size.width, height / size.height);
  }

  return { element, refresh };
}
