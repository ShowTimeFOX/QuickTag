// Content-script entry module, loaded by scripts/content.js.
//
// Startup order matters:
//   1. Load saved state (visibility, profiles, theme, palettes).
//   2. Create the hidden host and mount styles + template into the Shadow DOM.
//   3. Restore this page's window layout.
//   4. Wire every feature module.
//   5. Render, then reveal the host. Revealing last prevents layout flicker.
//
// New features plug in as a module under ./ui/ (or ./ for non-UI logic) with an
// `init…()` called from step 4. Communicate through ./state.js and ./events.js
// rather than importing sibling feature modules.
import { LOG_PREFIX } from "../shared/constants.js";
import { state } from "./state.js";
import { initGlobalVisibility } from "./visibility.js";
import { captureBodyMargins, watchMainInput } from "./page.js";
import { loadSiteProfileState, refreshActiveSiteKey, watchSiteProfileStorage } from "./site-profiles.js";
import { loadInitialPalettes } from "./palettes.js";
import { emit, EVENTS } from "./events.js";
import { createHost, injectStylesheet, mountTemplate, revealHost } from "./ui/shell.js";
import { applyTheme, initThemeControls, loadSavedTheme, loadThemeStyles } from "./ui/theme.js";
import { restoreWindowLayout, updateDockPageSpace } from "./ui/window-layout.js";
import { initTabs } from "./ui/tabs.js";
import { initPalettePanel, renderPalettePanel } from "./ui/palette-panel.js";
import { initAiPanel } from "./ui/ai-panel.js";
import { initQuickActions } from "./ui/quick-actions.js";
import { initSettingsPanel, renderActiveSiteBadge } from "./ui/settings-panel.js";
import { initAssetsPanel } from "./ui/assets-panel.js";
import { initElementPicker } from "./ui/element-picker.js";
import { initWindowControls } from "./ui/window-controls.js";
import { initGhostMode } from "./ui/ghost-mode.js";
import { initFocusMode } from "./ui/focus-mode.js";

const PAGE_WATCH_INTERVAL_MS = 1500;

/** Single-page apps change URL and replace fields without reloading. */
function watchPageChanges() {
  watchMainInput();
  setInterval(() => {
    if (refreshActiveSiteKey()) emit(EVENTS.siteProfilesChanged);
    watchMainInput();
  }, PAGE_WATCH_INTERVAL_MS);
}

async function main() {
  // 1. Saved state
  await initGlobalVisibility();
  captureBodyMargins();
  await loadSiteProfileState();
  await loadSavedTheme();
  state.paletteData = await loadInitialPalettes();

  // 2. Shadow DOM
  createHost({ enabled: state.extensionEnabled });
  try {
    await injectStylesheet("styles/tagger.css");
    await injectStylesheet("styles/focus-mode.css");
    await loadThemeStyles(state.theme);
    await mountTemplate("pages/popup.html");
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not load extension resources:`, error);
    return;
  }

  // 3. Layout
  await restoreWindowLayout();
  renderActiveSiteBadge();

  // 4. Features. Keydown listeners run in registration order: the palette's
  // type-to-search must be registered before ghost mode's shortcut handler.
  initTabs();
  initPalettePanel();
  await initAiPanel();
  initQuickActions();
  initSettingsPanel();
  initAssetsPanel();
  watchSiteProfileStorage();
  initThemeControls();
  initElementPicker();
  initWindowControls();
  await initGhostMode();
  await initFocusMode();
  watchPageChanges();

  // 5. Render and reveal
  applyTheme();
  renderPalettePanel();
  state.extensionReady = true;
  revealHost();
  if (state.extensionEnabled) updateDockPageSpace();
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} The tagger failed to start.`, error);
});
