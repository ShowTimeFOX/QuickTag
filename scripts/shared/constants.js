// Shared constants for every extension context (content, background, pages).
// Must not touch `window` or `document` at module level: the background
// service worker imports this file too.

export const LOG_PREFIX = "[QuickTag]";

export const STORAGE_KEY_PREFIX = "lazymod_";

export const STORAGE_KEYS = Object.freeze({
  enabled: "lazymod_enabled",
  palettes: "lazymod_global_palettes",
  siteConfigs: "lazymod_global_site_configs",
  aiBlacklist: "lazymod_global_ai_blacklist",
  builtinPaletteOverride: "lazymod_builtin_palette_override",
  theme: "lazymod_theme",
  customAccent: "lazymod_custom_accent",
  scale: "lazymod_scale",
  ghostMode: "lazymod_ghost_mode",
  ghostHoldMode: "lazymod_ghost_hold_mode",
  ghostShortcut: "lazymod_ghost_shortcut",
  windowSize: "lazymod_win_size",
  windowPosition: "lazymod_win_pos",
  aiThreshold: "lazymod_ai_threshold",
  // Focus Mode: shortcuts + capture priority, layout JSON, and view preferences.
  focusSettings: "lazymod_focus_settings",
  focusLayout: "lazymod_focus_layout",
  focusPrefs: "lazymod_focus_prefs",
  // Per-origin layout: `${siteLayoutPrefix}${encodeURIComponent(origin)}`.
  siteLayoutPrefix: "lazymod_site_layout_",
});

// Keys from older versions that can still appear in imported backups. They are
// validated on import but no longer drive any behavior.
export const LEGACY_STORAGE_KEYS = Object.freeze({
  docked: "lazymod_docked",
  dockPosition: "lazymod_dock_position",
  domainMode: "lazymod_domain_mode",
  domains: "lazymod_domains",
  siteBlacklist: "lazymod_site_blacklist",
});

export const MESSAGE_ACTIONS = Object.freeze({
  checkUpdates: "check_updates",
  analyzeImage: "analyze_image",
  analysisProgress: "analysis_progress",
  openAboutPage: "open_about_page",
  openPaletteEditor: "open_palette_editor",
  openSiteConfigEditor: "open_site_config_editor",
  openAiBlacklistEditor: "open_ai_blacklist_editor",
});

export const THEME_NAMES = Object.freeze(["dark", "light", "femboy", "halloween", "minimalistic", "cyberpunk", "custom"]);
export const DEFAULT_THEME = "dark";
export const DEFAULT_CUSTOM_ACCENT = "#7cafff";
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const DOCK_EDGES = Object.freeze(["left", "right", "top", "bottom"]);
export const DEFAULT_DOCK_EDGE = "right";
export const DEFAULT_WINDOW_POSITION = Object.freeze({ top: "100px", left: "100px" });
export const DEFAULT_GHOST_SHORTCUT = Object.freeze({ ctrl: true, alt: false, shift: true, meta: false, key: "g" });

export const DEFAULT_FOCUS_SETTINGS = Object.freeze({
  toggleShortcut: Object.freeze({ ctrl: false, alt: true, shift: false, meta: false, key: "a" }),
  closeShortcut: Object.freeze({ ctrl: false, alt: false, shift: false, meta: false, key: "escape" }),
  // false: the page handles keys first (QuickTag skips keys the page already
  // handled). true: QuickTag captures its shortcuts before page handlers.
  strictCapture: false,
});

export const DEFAULT_FOCUS_PREFS = Object.freeze({
  liveSync: true,
  tagView: "badges",
  imageZoom: "fit",
});
export const FOCUS_TAG_VIEWS = Object.freeze(["badges", "raw"]);
export const FOCUS_IMAGE_ZOOMS = Object.freeze(["fit", "actual"]);

export const FALLBACK_SITE_KEY = ".*";
export const SITE_SELECTOR_KEYS = Object.freeze(["tagInputSelector", "imgSelector", "linkSelector"]);

const DEFAULT_SITE_CONFIGS = Object.freeze({
  [FALLBACK_SITE_KEY]: Object.freeze({
    urlPattern: FALLBACK_SITE_KEY,
    tagInputSelector: "#tags, #post_tag_string, textarea[name='tags'], input[name='tags']",
    imgSelector: "#image, .main-image, img:not([src^='data:image/svg'])",
    linkSelector: "a.image-link, input[name='source'], input[name='file_url']",
    isXPath: false,
  }),
});

/** Returns a fresh, mutable copy of the default site profiles. */
export function createDefaultSiteConfigs() {
  return structuredClone(DEFAULT_SITE_CONFIGS);
}

// Selectors used when the user adds a profile for the current page.
export const NEW_SITE_PROFILE_SELECTORS = Object.freeze({
  tagInputSelector: "#tags, textarea[name='tags']",
  imgSelector: "#image, img",
  linkSelector: "a.image-link, input[name='source']",
});

export const DEFAULT_PALETTE_FILES = Object.freeze({
  "default-character": "data/character.json",
  "default-anthro": "data/anthro.json",
});

export const DEFAULT_AI_BLACKLIST = Object.freeze([
  "uncensored",
  "censored",
  "furry_with_furry",
  "explicit",
  "yaoi",
  "bara",
  "questionable",
  "hetero",
  "realistic",
  "sensitive",
  "two-tone_fur",
  "watermark",
  "artist_name",
  "pubic_hair",
  "loli",
  "interspecies",
  "furry_with_non-furry",
  "english_text",
]);

// Ranges mirror the min/max of the matching controls in pages/popup.html.
export const SCALE_RANGE = Object.freeze({ min: 0.75, max: 1.3 });
export const AI_THRESHOLD_RANGE = Object.freeze({ min: 0.1, max: 0.8 });

export const BACKUP_FORMAT = "quicktag-lazymod-backup";
export const BACKUP_VERSION = 1;

// Changing the ComfyUI host or port also requires updating `host_permissions`
// in manifest.json.
export const COMFYUI_BASE_URL = "http://127.0.0.1:8188";
export const WD14_NODE_TYPE = "WD14Tagger|pysssss";
