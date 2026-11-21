// "Reduce visual effects" (Settings › Appearance): for slower computers and
// browsers. One class on the shadow host turns off blur, shadows, filters,
// transitions, and animations for everything in the tagger's shadow root
// (tagger window, Focus Mode, and theme styles); see `:host(.lm-reduced-effects)`
// in tagger.css and focus-mode.css. Saved globally (`lazymod_reduced_effects`).
import { LOG_PREFIX, STORAGE_KEYS } from "../../shared/constants.js";
import { loadData, onLocalStorageChange } from "../../shared/storage.js";
import { $, shell } from "./shell.js";

const HOST_CLASS = "lm-reduced-effects";

function apply(enabled) {
  shell.host.classList.toggle(HOST_CLASS, enabled);
  $("#lm-reduce-effects").checked = enabled;
}

export async function initVisualEffects() {
  apply((await loadData(STORAGE_KEYS.reducedEffects, false)) === true);
  const checkbox = $("#lm-reduce-effects");
  checkbox.addEventListener("change", () => {
    apply(checkbox.checked);
    chrome.storage.local.set({ [STORAGE_KEYS.reducedEffects]: checkbox.checked }).catch((error) => {
      console.error(`${LOG_PREFIX} Could not save the visual effects setting.`, error);
    });
  });
  // Same setting in every tab.
  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.reducedEffects]) apply(changes[STORAGE_KEYS.reducedEffects].newValue === true);
  });
}
