// Helpers that read or change the host page (outside the tagger's shadow DOM).
import { formatTag } from "../shared/tags.js";
import { FALLBACK_SITE_KEY, LOG_PREFIX } from "../shared/constants.js";
import { state } from "./state.js";
import { emit, EVENTS } from "./events.js";
import { getActiveSiteConfig, getFallbackSiteConfig } from "./site-profiles.js";

// --- Body margins (docked tagger reserves page space) ---

const MARGIN_PROPERTIES = { left: "marginLeft", right: "marginRight", top: "marginTop", bottom: "marginBottom" };
let originalBodyMargins = null;

export function captureBodyMargins() {
  if (!document.body) return;
  const { marginLeft, marginRight, marginTop, marginBottom } = document.body.style;
  originalBodyMargins = { marginLeft, marginRight, marginTop, marginBottom };
}

export function restoreBodyMargins() {
  if (document.body && originalBodyMargins) Object.assign(document.body.style, originalBodyMargins);
}

export function setBodyMargin(edge, value) {
  if (document.body) document.body.style[MARGIN_PROPERTIES[edge]] = value;
}

// --- Element lookup via site profiles ---

export function getElementBySelector(selectorText, isXPath = false) {
  if (!selectorText) return null;
  if (isXPath) {
    try {
      return document.evaluate(selectorText, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch {
      return null;
    }
  }
  const selectors = selectorText
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean);
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

/** Finds a profile element, retrying with the ".*" profile on miss. */
function findProfileElement(selectorKey) {
  const config = getActiveSiteConfig();
  let element = getElementBySelector(config?.[selectorKey], config?.isXPath);
  if (!element && state.activeSiteKey !== FALLBACK_SITE_KEY) {
    element = getElementBySelector(getFallbackSiteConfig()?.[selectorKey], false);
  }
  return element;
}

export function getMainInput() {
  return findProfileElement("tagInputSelector");
}

export function getSourceInput() {
  return findProfileElement("linkSelector");
}

export function getTargetImageURL() {
  const image = findProfileElement("imgSelector");
  if (image && image.src) return image.src;

  const link = getSourceInput();
  if (link) {
    if (link.tagName === "A" && link.href) return link.href;
    if (link.tagName === "INPUT" || link.tagName === "TEXTAREA") return link.value.trim();
    if (link.src) return link.src;
  }
  return null;
}

// --- Page tag field ---

export function getMainTags() {
  const input = getMainInput();
  if (!input) return [];
  return input.value.split(/\s+/).map(formatTag).filter(Boolean);
}

export function notifyTagsChanged() {
  emit(EVENTS.tagsChanged);
}

/** Writes tags to the page field and fires input/change so the site reacts. */
export function setMainTags(tags) {
  const input = getMainInput();
  if (!input) return;
  input.value = tags.join(" ");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  notifyTagsChanged();
}

export function toggleTagInMain(tag) {
  const cleanTag = formatTag(tag);
  if (!cleanTag) return;
  const tags = getMainTags();
  const index = tags.indexOf(cleanTag);
  if (index > -1) tags.splice(index, 1);
  else tags.push(cleanTag);
  setMainTags(tags);
}

export function addTagToMain(tag) {
  const tags = getMainTags();
  if (tags.includes(tag)) return;
  tags.push(tag);
  setMainTags(tags);
}

/** Keeps chip states in sync when the user edits the page field directly. */
export function watchMainInput() {
  const input = getMainInput();
  if (!input) return;
  // Same function reference each time, so repeated calls never stack listeners.
  input.removeEventListener("input", notifyTagsChanged);
  input.addEventListener("input", notifyTagsChanged);
}

// --- Misc page helpers ---

export function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

/** Identifier used to store this page's window layout. */
export function getPageLayoutId() {
  return window.location.origin === "null" ? window.location.hostname || "unknown" : window.location.origin;
}

export function downloadJsonFile(fileName, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toSafeFileName(name) {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_");
}

// --- CSS selector generation (element picker) ---

function escapeCssIdentifier(value) {
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function isUniqueSelector(selector) {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not validate a generated CSS selector.`, error);
    return false;
  }
}

/** Builds a CSS selector that matches only `element` on the current page. */
export function getUniqueElementSelector(element) {
  if (element.id) {
    const idSelector = `#${escapeCssIdentifier(element.id)}`;
    if (document.querySelectorAll(idSelector).length === 1) return idSelector;
  }

  const tagName = element.tagName.toLowerCase();
  const candidates = [];
  const nameAttribute = element.getAttribute("name");
  if (nameAttribute) {
    candidates.push(`${tagName}[name="${nameAttribute.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
  }
  if (element.classList.length) {
    candidates.push(`${tagName}${[...element.classList].map((className) => `.${escapeCssIdentifier(className)}`).join("")}`);
  }
  for (const selector of candidates) {
    if (isUniqueSelector(selector)) return selector;
  }

  const parts = [];
  let current = element;
  while (current && current !== document.documentElement) {
    if (current.id) {
      parts.unshift(`#${escapeCssIdentifier(current.id)}`);
      const selector = parts.join(" > ");
      if (isUniqueSelector(selector)) return selector;
      break;
    }

    let part = current.tagName.toLowerCase();
    const siblings = current.parentElement ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName) : [];
    if (siblings.length > 1) {
      part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(" > ");
    if (isUniqueSelector(selector)) return selector;
    current = current.parentElement;
  }
  return parts.join(" > ");
}
