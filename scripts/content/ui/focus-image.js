// Focus Mode image preview: the page image found by the site profile, shown
// fitted or at 1:1 with its natural dimensions.
//
// The preview is an <img> in the page's document, so the page's CSP
// (img-src) and the image server's rules apply exactly as for the page
// itself; a blocked or failed load shows a message instead.
import { getTargetImageURL } from "../page.js";
import { el, button, ICONS } from "./dom.js";

export function createFocusImagePanel(api) {
  const image = el("img", { className: "lm-focus-image", attrs: { alt: "Image from this page", decoding: "async" } });
  const message = el("p", { className: "lm-focus-empty", hidden: true });
  const viewport = el("div", { className: "lm-focus-image-viewport" }, [image, message]);
  const dimensions = el("span", { className: "lm-focus-meta", attrs: { "aria-live": "polite" } });
  const fitButton = button("Fit", { iconPath: ICONS.fit, title: "Fit the image to the panel" });
  const actualButton = button("1:1", { iconPath: ICONS.actual, title: "Show the image at its natural size" });
  const reloadButton = button("", { iconPath: ICONS.sync, className: "lazymod-btn lm-focus-icon-btn", title: "Find the page image again", attrs: { "aria-label": "Find the page image again" } });

  const element = el("section", { className: "lm-focus-panel lm-focus-image-panel", attrs: { "aria-label": "Image preview" } }, [
    el("div", { className: "lm-focus-panel-header" }, [
      el("h2", { className: "lazymod-title", text: "Image" }),
      el("div", { className: "lm-focus-toolbar" }, [dimensions, fitButton, actualButton, reloadButton]),
    ]),
    viewport,
  ]);

  let currentUrl = null;

  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
    image.hidden = Boolean(text);
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
  }

  function refresh() {
    applyZoom();
    const url = getTargetImageURL();
    if (!url) {
      currentUrl = null;
      image.removeAttribute("src");
      dimensions.textContent = "";
      showMessage("No image found on this page. Set the image selector with Pick element in Settings.");
      return;
    }
    if (url === currentUrl && image.complete && image.naturalWidth) return;
    currentUrl = url;
    dimensions.textContent = "Loading…";
    showMessage("");
    image.src = url;
  }

  image.addEventListener("load", () => {
    dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    showMessage("");
  });
  image.addEventListener("error", () => {
    dimensions.textContent = "";
    showMessage("The image could not be loaded here. The page's security policy or the image server may block it.");
  });
  fitButton.addEventListener("click", () => setZoom("fit"));
  actualButton.addEventListener("click", () => setZoom("actual"));
  reloadButton.addEventListener("click", () => {
    currentUrl = null;
    refresh();
  });
  // Double-click switches between fit and 1:1.
  viewport.addEventListener("dblclick", () => setZoom(api.getPrefs().imageZoom === "fit" ? "actual" : "fit"));

  return { element, refresh };
}
