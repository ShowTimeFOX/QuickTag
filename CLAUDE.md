# CLAUDE.md

QuickTag LazyMod is a Manifest V3 browser extension (Chrome and Firefox) for
tagging images with a floating tagger. There is no build step and no package
manager: the repository root is loaded as an unpacked extension. Read
`PROJECT.md` (architecture, storage) and `README.md` (user docs) before larger
changes.

## Standing rules

- **ES modules, well scoped.** All code lives in ES modules with one clear
  responsibility each. New features (e.g. Focus Mode) plug in as a new module
  with an `init…()` called from `scripts/content/main.js`, not as additions to
  an existing large file.
- **No `innerHTML` (or `outerHTML`, `insertAdjacentHTML`, `document.write`)
  with dynamic or untrusted data.** Build DOM with `document.createElement`,
  `textContent`, `setAttribute`, `classList`, and `addEventListener`. Clear
  elements with `replaceChildren()`. The only HTML parsing allowed is the
  packaged `pages/popup.html` template via `DOMParser` in `ui/shell.js`.
- **Chrome and Firefox compatible.** Use the `chrome.*` namespace (works in
  both). Don't use Chrome-only or Firefox-only APIs without a fallback.
  Firefox minimum is `strict_min_version` in `manifest.json`.
- **Strict-CSP safe in Firefox.** Firefox applies the page's CSP to inline
  styles the content script adds: no `style="…"` attributes in
  `pages/popup.html` (use `tagger.css` or `element.style` from JS), and insert
  `<style>` elements only after setting their `textContent`. See
  "Browser loading notes" in `PROJECT.md`.
- **Versioning.** `manifest.json` `version` stays at the last release while the
  CHANGELOG has `[x.y.z] - Unreleased`. Bump it only when releasing, and update
  the Gist `update.json` last (see `PROJECT.md` → Releases).
- **One shared `manifest.json`.** Never split it into per-browser manifests or
  add a build step that generates them. It intentionally declares both
  `background.service_worker` (Chrome) and `background.scripts` (Firefox).
- **Don't add unrequested features.** Refactors keep behavior identical unless
  a change is called out.
- **Docs in the same change.** Keep `README.md`, `PROJECT.md`, and
  `CHANGELOG.md` in English. Update `PROJECT.md` and `CHANGELOG.md` whenever
  features, architecture, configuration, or file structure change.
- **English UI and comments.**

## Module layout

```
scripts/
  content.js            classic loader → import("scripts/content/main.js")
  content/              tagger logic (no rendering)
    main.js             startup order: load state → mount hidden → restore layout → init features → reveal
    state.js            shared mutable runtime state (one object)
    events.js           event bus: tagsChanged, extensionHidden, siteProfilesChanged, blacklistChanged
    page.js             host-page DOM: tag field, selectors, body margins
    site-profiles.js, palettes.js, fuzzy-search.js, config-backup.js, visibility.js, messaging.js
    focus-tags.js       Focus Mode tag model (active/muted, sort, page sync) — no DOM
    file-hub.js         File Hub install records (Assets tab) — no DOM
    pack-manager.js     uninstall/undo and installed-pack search — no DOM
    ui/                 Shadow-DOM interface components (shell, theme, tabs, palette-panel, ai-panel, ...)
      dom.js            el()/icon()/button() — the safe way to build UI from JS
      shortcut-recorder.js  reusable "press a shortcut" buttons
      focus-mode.js     Focus Mode controller; focus-*.js are its panels (they get an `api`, never import it)
      assets-panel.js   Assets tab (File Hub browse/install)
      pack-browser.js   pack switcher dropdown: search, ghost scroll, uninstall with undo
  background.js         background entry (registers listeners synchronously)
  background/           messages.js, updates.js, comfyui.js, file-hub.js (all File Hub network requests)
  shared/               used by every context; NO window/document at module level (service worker imports it)
    constants.js        storage keys, message actions, defaults — single source of truth
    shortcuts.js        shortcut match/format (macOS Option fallback); focus-layout.js = layout JSON schema
    file-hub.js         File Hub catalogue/pack validation (unsafe keys, limits, sha256)
  editor/               palette editor components
  extension-popup.js, palette-editor.js   page entry modules (<script type="module">)
```

- Feature modules talk through `state.js` and `events.js` instead of importing
  each other, to avoid circular imports.
- Content-script modules are loaded from extension URLs, so every content
  module folder must be listed in `web_accessible_resources` (currently
  `scripts/content/*`, `scripts/content/ui/*`, `scripts/shared/*`). Adding a
  new subfolder means adding it there.
- Keydown listeners on `document` (capture phase) run in registration order;
  `main.js` documents the required order.

## Conventions

- Storage: `chrome.storage.local` only; every key starts with `lazymod_` and is
  defined in `STORAGE_KEYS` in `scripts/shared/constants.js`. Per-origin layout
  keys are `lazymod_site_layout_<encoded origin>`. Config backup import rejects
  keys without the prefix, and validates known keys in `content/config-backup.js`
  (add a rule there when adding a key).
- Message actions: `MESSAGE_ACTIONS` in `shared/constants.js`.
- Log prefix: `LOG_PREFIX` (`[QuickTag]`).
- DOM ids/classes in the tagger use `lm-` / `lazymod-` prefixes.
- ComfyUI URL is `COMFYUI_BASE_URL`; changing it also requires `host_permissions`.
- File Hub URL is `FILE_HUB_BASE_URL`. Network requests to it (and package
  downloads) go through the background script, never the content script.
  Untrusted JSON must be checked with `hasUnsafeKeys`/`isSafeKey`
  (`shared/validation.js`) before keys are copied into objects.
- The browser tests load a temporary copy of the extension with
  `FILE_HUB_BASE_URL` rewritten to a local mock hub; keep that constant a
  single-line string literal.

## Validation

```powershell
Get-ChildItem scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
```

Real-browser tests (installed Chrome and Firefox, headless, no dependencies;
run sequentially; exit code 1 on failure). Run them after changes to loading,
the manifest, shared modules, or anything they cover, and extend
`tools/browser-tests/` when adding features:

```powershell
node tools/browser-tests/chrome.mjs
node tools/browser-tests/firefox.mjs
```

Then reload the unpacked extension in Chrome (`chrome://extensions`) and
Firefox (`about:debugging#/runtime/this-firefox`) for the manual checks listed
in `tools/browser-tests/README.md`.
