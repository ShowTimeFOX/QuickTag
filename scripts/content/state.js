// Runtime state shared across content-script modules.
//
// ES module bindings are read-only for importers, so cross-module mutable state
// lives on this one object. Keep feature-private state inside its own module;
// only put values here that several modules read or write.
import { DEFAULT_CUSTOM_ACCENT, DEFAULT_THEME, FALLBACK_SITE_KEY } from "../shared/constants.js";

export const state = {
  /** Global visibility from the toolbar toggle (`lazymod_enabled`). */
  extensionEnabled: true,
  /** True once the tagger UI is fully wired and revealed. */
  extensionReady: false,

  siteConfigs: {},
  activeSiteKey: FALLBACK_SITE_KEY,
  /** Formatted tags always hidden from AI suggestions. */
  tagBlacklist: [],

  /** `{ packs, activePackId, activeGroup, activeCategory, defaultPacksLoaded }` */
  paletteData: null,

  theme: DEFAULT_THEME,
  customAccent: DEFAULT_CUSTOM_ACCENT,

  /** Keyboard features must stand down while these modes capture input. */
  elementPickerActive: false,
  /** A shortcut recorder (ghost mode, Focus Mode) is waiting for a key. */
  recordingShortcut: false,
  /** The Focus Mode overlay is open. */
  focusModeActive: false,
};
