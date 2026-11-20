// Safe element builder: only createElement / textContent / setAttribute /
// addEventListener — never HTML strings.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * el("button", { className: "lazymod-btn", text: "Copy", attrs: { type: "button" }, on: { click } }, [children])
 * `dataset` sets data-* attributes; `hidden`, `title`, `id` are set directly.
 */
export function el(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  const { className, text, attrs, dataset, on, hidden, title, id } = options;
  if (className) element.className = className;
  if (id) element.id = id;
  if (title) element.title = title;
  if (hidden !== undefined) element.hidden = hidden;
  if (text !== undefined) element.textContent = text;
  Object.entries(attrs || {}).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== false) element.setAttribute(name, value === true ? "" : String(value));
  });
  Object.assign(element.dataset, dataset || {});
  Object.entries(on || {}).forEach(([type, listener]) => element.addEventListener(type, listener));
  element.append(...children.filter(Boolean));
  return element;
}

/** A 16×16 stroke icon from one SVG path (same style as the tagger icons). */
export function icon(pathData, className = "lazymod-action-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
  return svg;
}

/** Icon + label button. */
export function button(label, { iconPath, className = "lazymod-btn", title, onClick, attrs } = {}) {
  return el("button", { className, title, attrs: { type: "button", ...attrs }, on: onClick ? { click: onClick } : undefined }, [
    iconPath ? icon(iconPath) : null,
    label ? el("span", { text: label }) : null,
  ]);
}

export const ICONS = Object.freeze({
  close: "m4 4 8 8m0-8-8 8",
  copy: "M5 3h8v10H5zM3 10V2h7",
  trash: "M3 4.5h10M6 4.5v-2h4v2m2 0-.6 9H4.6l-.6-9m2.5 2.5v4m3-4v4",
  sort: "M4 3v10m0 0-2-2m2 2 2-2M10 4h4M10 8h3M10 12h2",
  dedupe: "M3 4h7v7H3zM6 7h7v7H6z",
  layout: "M2.5 2.5h11v11h-11zM2.5 6h11M7 6v7.5",
  sync: "M3 8a5 5 0 0 1 8.5-3.5L13 6M13 2.5V6H9.5M13 8a5 5 0 0 1-8.5 3.5L3 10M3 13.5V10h3.5",
  upload: "M8 10V2.5m0 0L5 5.5m3-3 3 3M3 9.5v3h10v-3",
  download: "M8 2.5V10m0 0 3-3m-3 3L5 7M3 10.5v2h10v-2",
  reset: "M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5",
  fit: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  actual: "M3 3h10v10H3zM6.5 6.5h3v3h-3z",
  focus: "M2.5 5.5v-3h3m5 0h3v3m0 5v3h-3m-5 0h-3v-3",
  // QuickTag brand mark (same as the tagger header).
  brand: "M9.5 1.5 3.5 8h4L7 14.5 12.5 7h-4z",
});
