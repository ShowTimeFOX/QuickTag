// Theme stylesheet loading and the theme controls in Settings.
import { LOG_PREFIX, STORAGE_KEYS, THEME_NAMES, DEFAULT_THEME, DEFAULT_CUSTOM_ACCENT, HEX_COLOR_PATTERN } from "../../shared/constants.js";
import { loadData, onLocalStorageChange } from "../../shared/storage.js";
import { state } from "../state.js";
import { emit, EVENTS } from "../events.js";
import { $, shell } from "./shell.js";
import { setConfigStatus } from "./status.js";

let themeStyleElement = null;
let themeStyleLoadId = 0;

export async function loadSavedTheme() {
  let theme = await loadData(STORAGE_KEYS.theme, DEFAULT_THEME);
  let accent = await loadData(STORAGE_KEYS.customAccent, DEFAULT_CUSTOM_ACCENT);
  if (!THEME_NAMES.includes(theme)) {
    console.error(`${LOG_PREFIX} Saved theme is invalid; using the default theme.`);
    theme = DEFAULT_THEME;
  }
  if (typeof accent !== "string" || !HEX_COLOR_PATTERN.test(accent)) {
    console.error(`${LOG_PREFIX} Saved custom accent color is invalid; using the default color.`);
    accent = DEFAULT_CUSTOM_ACCENT;
  }
  state.theme = theme;
  state.customAccent = accent;
}

/**
 * Loads `styles/theme-<name>.css` into the shadow root. Resolves false when a
 * newer load started meanwhile (so rapid switches never apply a stale theme).
 */
export async function loadThemeStyles(theme) {
  if (!THEME_NAMES.includes(theme)) throw new Error(`Unsupported theme: ${theme}`);
  const loadId = ++themeStyleLoadId;
  try {
    const response = await fetch(chrome.runtime.getURL(`styles/theme-${theme}.css`));
    if (loadId !== themeStyleLoadId) return false;
    if (!response.ok) throw new Error(`Could not load theme stylesheet (HTTP ${response.status}).`);
    const themeCss = await response.text();
    if (loadId !== themeStyleLoadId) return false;
    // Always insert a new, already-filled <style> and swap it in. Firefox
    // checks a page's CSP when the element is inserted; an element inserted
    // empty and filled later can stay blocked on strict-CSP pages.
    const styleElement = document.createElement("style");
    styleElement.id = "lazymod-theme-styles";
    styleElement.textContent = themeCss;
    if (themeStyleElement) themeStyleElement.replaceWith(styleElement);
    else shell.root.appendChild(styleElement);
    themeStyleElement = styleElement;
    return true;
  } catch (error) {
    if (loadId !== themeStyleLoadId) return false;
    throw error;
  }
}

function colorToRgba(hex, alpha) {
  const value = hex.slice(1);
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function applyTheme(theme = state.theme, accent = state.customAccent) {
  const { windowEl } = shell;
  windowEl.classList.remove(...THEME_NAMES.map((name) => `theme-${name}`));
  windowEl.classList.add(`theme-${theme}`);
  windowEl.style.removeProperty("--lm-custom-accent");
  windowEl.style.removeProperty("--lm-custom-accent-soft");
  if (theme === "custom") {
    windowEl.style.setProperty("--lm-custom-accent", accent);
    windowEl.style.setProperty("--lm-custom-accent-soft", colorToRgba(accent, 0.16));
  }
  $("#lm-theme-select").value = theme;
  $("#lm-theme-color").value = accent;
  $("#lm-custom-color-control").hidden = theme !== "custom";
  emit(EVENTS.themeChanged, { theme, accent });
}

export function initThemeControls() {
  $("#lm-theme-select").addEventListener("change", async (event) => {
    const theme = event.currentTarget.value;
    if (!THEME_NAMES.includes(theme)) {
      setConfigStatus("Select a supported theme.", "error");
      return;
    }
    try {
      if (!(await loadThemeStyles(theme))) return;
      await chrome.storage.local.set({ [STORAGE_KEYS.theme]: theme });
      state.theme = theme;
      applyTheme();
      setConfigStatus("Theme saved.", "success");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not save the selected theme.`, error);
      setConfigStatus(`Could not save theme: ${error.message}`, "error");
      applyTheme();
    }
  });

  // Live preview while dragging the color picker; saved on "change".
  $("#lm-theme-color").addEventListener("input", (event) => {
    const accent = event.currentTarget.value;
    if (HEX_COLOR_PATTERN.test(accent) && state.theme === "custom") applyTheme("custom", accent);
  });

  $("#lm-theme-color").addEventListener("change", async (event) => {
    const accent = event.currentTarget.value;
    if (!HEX_COLOR_PATTERN.test(accent)) {
      setConfigStatus("Choose a valid custom color.", "error");
      return;
    }
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.theme]: "custom", [STORAGE_KEYS.customAccent]: accent });
      state.theme = "custom";
      state.customAccent = accent;
      applyTheme();
      setConfigStatus("Custom theme saved.", "success");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not save the custom theme.`, error);
      setConfigStatus(`Could not save custom theme: ${error.message}`, "error");
      applyTheme();
    }
  });

  onLocalStorageChange((changes) => {
    const theme = changes[STORAGE_KEYS.theme]?.newValue;
    if (theme && THEME_NAMES.includes(theme)) {
      loadThemeStyles(theme)
        .then((loaded) => {
          if (!loaded) return;
          state.theme = theme;
          applyTheme();
        })
        .catch((error) => {
          console.error(`${LOG_PREFIX} Could not load the selected theme.`, error);
          setConfigStatus(`Could not load theme: ${error.message}`, "error");
        });
    }
    const accent = changes[STORAGE_KEYS.customAccent]?.newValue;
    if (accent && HEX_COLOR_PATTERN.test(accent)) {
      state.customAccent = accent;
      applyTheme();
    }
  });
}
