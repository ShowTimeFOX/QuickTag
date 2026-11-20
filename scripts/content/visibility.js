// Global visibility (toolbar toggle, `lazymod_enabled`). Applied live in every
// tab by showing or hiding the extension host, without reloading pages.
import { STORAGE_KEYS } from "../shared/constants.js";
import { onLocalStorageChange } from "../shared/storage.js";
import { state } from "./state.js";
import { emit, EVENTS } from "./events.js";
import { restoreBodyMargins } from "./page.js";
import { shell } from "./ui/shell.js";
import { updateDockPageSpace } from "./ui/window-layout.js";

function applyGlobalVisibility(enabledValue) {
  state.extensionEnabled = enabledValue !== false;
  if (!shell.host) return;

  shell.host.style.display = state.extensionEnabled ? "" : "none";
  if (!state.extensionEnabled) {
    restoreBodyMargins();
    if (state.extensionReady) emit(EVENTS.extensionHidden);
  } else if (state.extensionReady) {
    updateDockPageSpace();
  }
}

/** Starts listening, then reads the saved value (a change wins over the read). */
export async function initGlobalVisibility() {
  let revision = 0;
  onLocalStorageChange((changes) => {
    if (!Object.hasOwn(changes, STORAGE_KEYS.enabled)) return;
    revision += 1;
    applyGlobalVisibility(changes[STORAGE_KEYS.enabled].newValue);
  });

  const initialRevision = revision;
  const stored = await chrome.storage.local.get([STORAGE_KEYS.enabled]);
  if (initialRevision === revision) applyGlobalVisibility(stored[STORAGE_KEYS.enabled]);
}
