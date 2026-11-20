// Element picker: click an element on the page to save its CSS selector into
// the active site profile.
import { LOG_PREFIX } from "../../shared/constants.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { getUniqueElementSelector } from "../page.js";
import { getActiveSiteConfig, getFallbackSiteConfig, saveSiteConfigs } from "../site-profiles.js";
import { $$, shell } from "./shell.js";

const FIELD_LABELS = {
  tagInputSelector: "the tag input",
  imgSelector: "the image",
  linkSelector: "the source link or field",
};

// Each picker type accepts only matching elements: [isAccepted, error message].
const TARGET_RULES = {
  tagInputSelector: [
    (target) => target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && ["text", "search"].includes(target.type)),
    "Pick a text or textarea input for the tag field.",
  ],
  imgSelector: [(target) => target instanceof HTMLImageElement, "Pick an image element."],
  linkSelector: [
    (target) => target instanceof HTMLAnchorElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement,
    "Pick a link or a source input field.",
  ],
};

const picker = {
  type: null,
  profileKey: null,
  target: null,
  marker: null,
  label: null,
  banner: null,
  originalCursor: null,
};

function createOverlay(className) {
  const element = document.createElement("div");
  element.className = className;
  shell.root.appendChild(element);
  return element;
}

function hideMarker() {
  picker.marker.style.display = "none";
  picker.label.style.display = "none";
}

function updatePickerMarkerPosition() {
  const target = picker.target;
  if (!target?.isConnected) {
    hideMarker();
    return;
  }
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hideMarker();
    return;
  }
  Object.assign(picker.marker.style, {
    display: "block",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  const identifier = target.id ? `#${target.id}` : "";
  const classes = [...target.classList]
    .slice(0, 2)
    .map((className) => `.${className}`)
    .join("");
  picker.label.textContent = `${target.tagName.toLowerCase()}${identifier}${classes}`;
  picker.label.style.display = "block";
  const labelWidth = picker.label.getBoundingClientRect().width;
  picker.label.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - labelWidth - 8))}px`;
  picker.label.style.top = `${Math.max(8, rect.top - 30)}px`;
}

function updatePickerMarker(event) {
  if (shell.host.contains(event.target)) {
    hideMarker();
    picker.target = null;
    return;
  }
  if (!(event.target instanceof Element)) return;
  picker.target = event.target;
  updatePickerMarkerPosition();
}

function handlePickerKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    stopElementPicker();
  }
}

function handlePickerClick(event) {
  if (shell.host.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const target = event.target;
  const selectorKey = picker.type;
  const [isAccepted, errorMessage] = TARGET_RULES[selectorKey];
  if (!isAccepted(target)) {
    alert(errorMessage);
    stopElementPicker();
    return;
  }

  const profileKey = picker.profileKey;
  const config = state.siteConfigs[profileKey] || getFallbackSiteConfig();
  saveSiteConfigs({
    ...state.siteConfigs,
    [profileKey]: { ...config, [selectorKey]: getUniqueElementSelector(target), isXPath: false },
  }).catch((error) => {
    console.error(`${LOG_PREFIX} Could not save the picked selector.`, error);
    alert(`Could not save selector: ${error.message}`);
  });
  stopElementPicker();
}

export function stopElementPicker() {
  if (!picker.type) return;
  document.removeEventListener("pointermove", updatePickerMarker, true);
  document.removeEventListener("scroll", updatePickerMarkerPosition, true);
  document.removeEventListener("click", handlePickerClick, true);
  document.removeEventListener("keydown", handlePickerKeydown, true);
  picker.marker?.remove();
  picker.label?.remove();
  picker.banner?.remove();
  Object.assign(picker, { type: null, profileKey: null, target: null, marker: null, label: null, banner: null });
  state.elementPickerActive = false;

  const rootStyle = document.documentElement.style;
  if (picker.originalCursor) {
    if (picker.originalCursor.value) {
      rootStyle.setProperty("cursor", picker.originalCursor.value, picker.originalCursor.priority);
    } else {
      rootStyle.removeProperty("cursor");
    }
    picker.originalCursor = null;
  }
}

export function startElementPicker(selectorKey) {
  stopElementPicker();
  if (!TARGET_RULES[selectorKey]) return;
  if (getActiveSiteConfig().isXPath) {
    alert("This profile uses XPath selectors. Change isXPath to false in the profiles JSON editor before using the CSS picker.");
    return;
  }
  picker.type = selectorKey;
  picker.profileKey = state.activeSiteKey;
  state.elementPickerActive = true;
  picker.marker = createOverlay("lazymod-picker-highlight");
  picker.label = createOverlay("lazymod-picker-label");
  picker.banner = createOverlay("lazymod-picker-banner");
  picker.banner.textContent = `Click ${FIELD_LABELS[selectorKey]} on the page. Press Esc to cancel.`;

  const rootStyle = document.documentElement.style;
  picker.originalCursor = {
    value: rootStyle.getPropertyValue("cursor"),
    priority: rootStyle.getPropertyPriority("cursor"),
  };
  rootStyle.setProperty("cursor", "crosshair", "important");
  document.addEventListener("pointermove", updatePickerMarker, true);
  document.addEventListener("scroll", updatePickerMarkerPosition, true);
  document.addEventListener("click", handlePickerClick, true);
  document.addEventListener("keydown", handlePickerKeydown, true);
}

export function initElementPicker() {
  $$("[data-pick-type]").forEach((button) => {
    button.onclick = () => startElementPicker(button.dataset.pickType);
  });
  on(EVENTS.extensionHidden, stopElementPicker);
}
