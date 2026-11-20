// The tagger's host element and Shadow DOM, plus scoped query helpers.
//
// The template (pages/popup.html) is a packaged, trusted extension file. It is
// parsed with DOMParser and adopted as nodes; dynamic data is never injected
// as HTML anywhere in the tagger.

export const shell = {
  /** `#quicktag-extension-root` in the page; display:none when globally hidden. */
  host: null,
  root: null,
  /** `#lazymod-window`, the tagger window. */
  windowEl: null,
};

export const $ = (selector) => shell.root.querySelector(selector);
export const $$ = (selector) => shell.root.querySelectorAll(selector);

/** Creates the host hidden (visibility) so state can be restored before reveal. */
export function createHost({ enabled }) {
  const host = document.createElement("div");
  host.id = "quicktag-extension-root";
  host.style.visibility = "hidden";
  host.style.display = enabled ? "" : "none";
  document.documentElement.appendChild(host);
  shell.host = host;
  shell.root = host.attachShadow({ mode: "open" });
}

async function fetchExtensionText(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return response.text();
}

export async function injectStylesheet(path) {
  const style = document.createElement("style");
  style.textContent = await fetchExtensionText(path);
  shell.root.appendChild(style);
}

export async function mountTemplate(path) {
  const doc = new DOMParser().parseFromString(await fetchExtensionText(path), "text/html");
  const rootElement = doc.body.firstElementChild;
  if (rootElement) shell.root.appendChild(rootElement);
  shell.windowEl = shell.root.querySelector("#lazymod-window");
  if (!shell.windowEl) throw new Error(`${path} does not contain #lazymod-window.`);
}

export function revealHost() {
  shell.host.style.visibility = "visible";
}

/** Replaces the SVG path of an icon button (no markup injection). */
export function setIconPath(button, pathData, selector = "svg path") {
  const path = button.querySelector(selector);
  if (path) path.setAttribute("d", pathData);
}

export const ICON_PATHS = Object.freeze({
  plus: "M8 2.5v11M2.5 8h11",
  minus: "M2.5 8h11",
  collapse: "M3 8h10",
  expand: "M3 3.5h10v9H3z",
});
