# QuickTag LazyMod

QuickTag LazyMod is a Manifest V3 browser extension for tagging images with a
floating interface. It provides editable tag packs, site-specific profiles,
interface customization, and optional image analysis through a local ComfyUI
installation with the WD14 Tagger node. The repository root is the extension
source directory; `manifest.json` contains the shared browser configuration.

## Features

- **Tag packs:** Start with the Character Portrait and Anthro & Fursuit packs
  from `data/character.json` and `data/anthro.json`. Import, export, edit, and
  delete any pack, including defaults. Organize tags into groups and categories.
- **Tag management:** Toggle tags individually or add and remove visible tags
  in batches. The same batch actions are available for AI suggestions.
- **Fuzzy search:** Find approximate matches. Keyboard controls include the
  arrow keys, Enter, and Escape; typing mode can start a search when focus is
  outside an editable field, including when the page uses an open shadow root.
- **AI image analysis:** Send an image to the local ComfyUI-WD14-Tagger
  integration. Review progress, filter suggestions by confidence threshold,
  and exclude selected tags. The confidence threshold is saved locally.
- **Configuration backup:** Export or import QuickTag settings, including tag
  packs, site profiles, the AI blacklist, window settings, and global
  visibility. Import replaces the current configuration.
- **Restore defaults:** Clear saved extension data and restore the default
  values after the page is reloaded.
- **Site profiles:** Configure CSS selectors for tag fields, images, and
  source links. The element picker highlights the selected element.
- **Toolbar popup:** Show or hide the tagger across all pages, check the
  ComfyUI connection and available updates, and open the About page. Global
  visibility changes apply immediately without reloading pages. A newer
  version is indicated by a "NEW" badge.
- **Palette editor:** Edit palette JSON with formatting support, word wrapping,
  or the easier-to-read easyJson format.
- **Tab strips:** Group and category strips scroll with the mouse wheel or
  with arrow buttons that appear when the strip overflows.
- **Focus Mode:** `Alt+A` opens a full-screen workspace with the page image
  (fit or 1:1), a tag list with mutable badges, a Raw text view, sorting,
  deduplication, copy, and clear, and a full-height palette. The page's tag
  field follows live (two-way) unless Live sync is off. `Esc` closes menus and
  dialogs first, then Focus Mode. Shortcuts, strict capture, and a JSON grid
  layout with presets are configurable.
- **Assets:** The Assets tab lists the community tag packs on File Hub
  (`https://showtimefox-file-hub.pages.dev/`) with search, a category filter,
  and sorting, and installs a pack with one click. Installed packs show as
  installed, and a newer hub version can replace them (Update).
- **Interface controls:** Move, resize, dock, collapse, or hide the tagger.
  Ghost mode can be toggled with a keyboard shortcut, including while an
  editable field has focus; it can optionally be active only while a button or
  shortcut is held. Transparency works when docked and across themes. Docking
  mode, dock edge, visibility, and floating position are saved per page origin.
  A page starts hidden with a handle at the right edge until a visibility state
  has been saved for it.
- **Themes:** Choose Dark mode, Light mode, Femboy, Halloween, Minimalistic, or
  Cyberpunk, or select a custom accent color. The theme and custom accent are
  saved locally and included in configuration backups.
- **Quick actions:** Copy tags, clear the tag field, and view the tag count.
- **Consistent interface:** The tagger, editor, and About page use English
  labels, consistent control states, and lightweight SVG action icons. Themes
  retain their own color palettes and visual details.

## Requirements

- Chrome or Firefox with Manifest V3 support.
- Access to the websites where you want to use the tagger.
- Optional: ComfyUI running locally at `http://127.0.0.1:8188`, with the
  [ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)
  custom node installed.

## Load for development

There is no package manager or build step. Load the repository root directly
as an unpacked extension:

- **Chrome:** Open `chrome://extensions`, enable **Developer mode**, select
  **Load unpacked**, and choose this repository directory.
- **Firefox:** Open `about:debugging#/runtime/this-firefox`, select **Load
  Temporary Add-on...**, and choose the root `manifest.json`.

The manifest includes the Chrome service-worker and Firefox background-script
entries, plus Firefox's `browser_specific_settings`. After changing source
files, reload the extension in the browser and refresh the page being tested.
Firefox temporary add-ons are removed when Firefox closes.

## Set up ComfyUI and WD14

AI analysis is optional. Tagging, palette editing, and other non-AI features do
not require ComfyUI.

1. Install Python 3 and Git.
2. Install and start ComfyUI. One installation method provided by `comfy-cli`
   is:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   python -m pip install comfy-cli
   comfy install
   comfy launch
   ```

   Confirm that ComfyUI is available at `http://127.0.0.1:8188` and keep it
   running while using image analysis. See the
   [Comfy-Org/comfy-cli](https://github.com/Comfy-Org/comfy-cli) documentation.
3. Install **ComfyUI-WD14-Tagger** through ComfyUI-Manager by searching for
   "WD14 Tagger", or clone it into `ComfyUI\custom_nodes`:

   ```powershell
   git clone https://github.com/pythongosssss/ComfyUI-WD14-Tagger.git
   ```

4. Install the node's requirements in the Python environment used by ComfyUI,
   following the node repository's instructions, then restart ComfyUI. WD14
   models are downloaded on first use if they are not already available.
5. Open a page containing an image and select **Analyze image** in QuickTag.
   Progress and connection errors are shown in the AI suggestions section.

Requirements may differ between portable installations, `comfy-cli`, and
other ways of running ComfyUI. Refer to the
[ComfyUI-WD14-Tagger documentation](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)
if you need help.

## Project structure

| File or directory | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 configuration, shared permissions and resources, and browser-specific background settings. |
| `assets/icon.png` | Icon used in the browser toolbar and extension popup. |
| `data/character.json` | Default Character Portrait tag pack. |
| `data/anthro.json` | Default Anthro & Fursuit tag pack. |
| `scripts/shared/` | ES modules used by every context: `constants.js` (storage keys, message actions, defaults), `storage.js`, `tags.js`, `palette.js`, `site-configs.js`, `shortcuts.js`, `focus-layout.js` (layout schema and presets), `file-hub.js` (File Hub catalogue and pack validation), and `validation.js`. No DOM access at module level. |
| `scripts/background.js` | Background entry module; registers event listeners. |
| `scripts/background/` | `messages.js` (message router, opens extension pages), `updates.js` (update check and badge), `comfyui.js` (WD14 analysis), `file-hub.js` (File Hub catalogue and package downloads). |
| `scripts/content.js` | Classic-script loader that imports `scripts/content/main.js`. |
| `scripts/content/` | Tagger logic: `main.js` (startup order), `state.js` (shared runtime state), `events.js` (event bus), `visibility.js`, `page.js` (host page DOM and tag field), `site-profiles.js`, `palettes.js`, `fuzzy-search.js`, `config-backup.js`, `messaging.js`, `focus-tags.js` (Focus Mode tag model and page sync), `file-hub.js` (File Hub install records). |
| `scripts/content/ui/` | Tagger interface components: `shell.js` (Shadow DOM), `theme.js`, `tabs.js`, `palette-panel.js`, `chips.js`, `ai-panel.js`, `settings-panel.js`, `quick-actions.js`, `element-picker.js`, `window-layout.js`, `window-controls.js`, `ghost-mode.js`, `status.js`, `scroll-arrows.js`, `dom.js` (safe element builder), `shortcut-recorder.js`, `assets-panel.js` (Assets tab); Focus Mode: `focus-mode.js` (controller), `focus-topbar.js`, `focus-image.js`, `focus-tags-panel.js`, `focus-palette.js`, `focus-layout-dialog.js`, `focus-settings.js`. |
| `scripts/extension-popup.js` | Toolbar popup module: global visibility, ComfyUI connectivity, and update checks. |
| `scripts/palette-editor.js` | Editor page module: loads, validates, converts, and saves tag packs, site profiles, and the AI blacklist. |
| `scripts/editor/` | Editor components: `easy-json.js` (easyJson format) and `code-editor.js` (line numbers and word wrap). |
| `pages/extension-popup.html` | Toolbar popup for global visibility, ComfyUI status, updates, and the About link. |
| `pages/palette-editor.html` | Palette and settings editor page. |
| `pages/about.html` | Feature and setup guide. |
| `pages/popup.html` | Floating tagger interface template. |
| `styles/tagger.css` | Shared styles for the tagger and its overlays. |
| `styles/extension-popup.css` | Toolbar popup styles. |
| `styles/palette-editor.css` | Palette editor styles. |
| `styles/about.css` | About page styles. |
| `styles/theme-dark.css` | Dark mode theme. |
| `styles/theme-light.css` | Light mode theme. |
| `styles/theme-femboy.css` | Femboy theme. |
| `styles/theme-halloween.css` | Halloween theme. |
| `styles/theme-minimalistic.css` | Minimalistic theme. |
| `styles/theme-cyberpunk.css` | Cyberpunk theme. |
| `styles/theme-custom.css` | Base styles for the custom accent color theme. |
| `README.md` | User guide, including the custom tag pack JSON format. |
| `CHANGELOG.md` | Release and project change history. |

## Architecture and data storage

- All scripts are ES modules. Manifest V3 cannot declare module content
  scripts, so `scripts/content.js` (listed in `content_scripts`) imports
  `scripts/content/main.js` with a dynamic `import()`. The content and shared
  module folders are listed in `web_accessible_resources` so both browsers can
  load them. Extension pages use `<script type="module">`, and the background
  entry is declared with `"type": "module"`.
- `scripts/content/main.js` runs on pages matched by `content_scripts` and
  creates the interface inside a Shadow DOM to reduce style conflicts with the
  host page. It loads saved state, mounts the interface hidden, restores page
  layout and visibility, wires each feature module, and reveals the interface
  last to prevent flicker. Feature modules share mutable values through
  `content/state.js` and react to each other through `content/events.js`
  (`tagsChanged`, `extensionHidden`, `siteProfilesChanged`,
  `blacklistChanged`, `themeChanged`, `paletteChanged`, `focusModeChanged`,
  `focusTagsChanged`) instead of importing each other.
- Interface elements are built with `document.createElement`, `textContent`,
  and explicit attributes. The packaged `pages/popup.html` template is parsed
  with `DOMParser`; no dynamic data is inserted as HTML.
- Shared tagger components use `styles/tagger.css`. The selected theme is
  loaded asynchronously from `styles/theme-<name>.css` into the same Shadow
  DOM. Theme stylesheets, the popup template, and both default pack JSON files
  are listed in `web_accessible_resources`.
- `scripts/background.js` registers extension event listeners; the modules in
  `scripts/background/` handle messages, run scheduled update checks, open
  extension pages, and send requests to the local ComfyUI server. The root
  manifest declares the background worker form for Chrome and the background
  script form for Firefox.
- The extension uses the `chrome.*` WebExtension API namespace, which is
  supported by both target browsers.
- Settings, site profiles, palettes, and the AI blacklist are stored locally
  with `chrome.storage.local`.
- The toolbar's global visibility toggle stores a single boolean in
  `lazymod_enabled`. Each content script listens for storage changes and hides
  or shows its existing extension host immediately, without reloading tabs.
  New pages read the same saved setting on startup. Older per-site blacklist
  and domain-rule values may remain in imported backups but do not control
  visibility.
- Update checks fetch `update.json` from the public Gist
  `30eeb54c1474ffedee3eae97d10eb715` (set in `scripts/background/updates.js`),
  compare its version with the
  manifest, and set a "NEW" badge through the browser action API. Checks run at
  startup, every six hours, and when requested from the toolbar popup. The
  button opens the GitHub Releases page; unpacked installations still require
  a manual update and reload.
- Docking mode, dock edge, panel visibility, and floating position are saved
  per origin under `lazymod_site_layout_<origin>`. Panel visibility is distinct
  from the global toggle: it controls that page's tagger window and handle,
  while global visibility hides the extension host everywhere.
- Export includes entries from the extension's local storage. Import validates
  the file and replaces the saved entries. Restoring defaults clears extension
  storage and reloads the current page to apply the initial state.
- The palette editor opens as an internal extension page. Its easyJson mode
  edits pack structure without requiring users to write JSON syntax by hand.
  Default packs are fetched from the two bundled JSON files on first
  initialization. A saved initialization marker prevents deleted default packs
  from being re-added on later page loads.
- ComfyUI analysis uses the `WD14Tagger|pysssss` node. The extension fetches
  the page image, uploads it to `/upload/image`, submits a workflow to `/prompt`,
  checks `/history` and `/queue`, and reads the resulting tags.
- The ComfyUI address is `COMFYUI_BASE_URL` (`http://127.0.0.1:8188`) in
  `scripts/shared/constants.js`. Changing its host or port requires matching
  changes to `host_permissions` in `manifest.json`.
- Storage keys, message action names, and default values are defined once in
  `scripts/shared/constants.js`. All storage keys start with `lazymod_`.
- Focus Mode (`ui/focus-mode.js`) is an overlay (`#lm-focus-root`) in the
  same Shadow DOM, styled by `styles/focus-mode.css`. The theme rules are
  scoped to `#lazymod-window`, so the controller copies the computed `--lm-*`
  theme variables onto the overlay whenever the theme changes. Panels receive
  an `api` object from the controller instead of importing it. Menus and
  dialogs register on a dismiss stack, which the close shortcut empties
  before it exits. While Focus Mode is open, page scrolling is locked, and
  keys typed inside the overlay do not reach the page's bubble-phase handlers.
- Focus Mode stores `lazymod_focus_settings` (toggle and close shortcuts,
  `strictCapture`), `lazymod_focus_layout` (the layout JSON, validated by
  `shared/focus-layout.js`), and `lazymod_focus_prefs` (live sync, tag view,
  image zoom). With `strictCapture` off, shortcuts are handled by a
  bubble-phase `document` listener that skips events the page already
  handled; with it on, by a capture-phase `window` listener that stops the
  event. Page listeners registered on `window` in the capture phase before
  QuickTag loaded still run first. Shortcuts act only on `keydown` and ignore
  auto-repeat (`event.repeat`): opening Focus Mode moves focus into the
  overlay, so the `keyup` of the same press arrives there and must not toggle
  again.
- The Focus Mode tag model (`content/focus-tags.js`) keeps muted tags in
  memory only. The page's tag field always holds the active tags in list
  order; with live sync on, changes are written immediately and page edits
  are merged back through `tagsChanged`.
- **Assets (File Hub).** The catalogue (`GET api/v1/packages?app=quicktag`)
  is requested only when the Assets tab is first opened or **Refresh** is
  selected, never at page load. All File Hub requests run in the background
  script (`background/file-hub.js`): the download endpoints send no CORS
  headers, and Chrome applies the page's CORS rules to content-script
  requests. The `<all_urls>` host permission covers the hub and GitHub
  release downloads, so the manifest needs no extra entry.
  - The content script sends only a package id; the background script looks
    up the download address, size, and checksum in the catalogue it fetched
    itself (cached for two minutes).
  - Downloads try `api/download/:assetId` when the catalogue provides an
    `assetId` (the hub endpoint takes the GitHub release asset id, not the
    package `id`), then `downloadUrl`. Only `https` addresses are accepted,
    including after redirects.
  - The file must be at most 2 MB (checked while streaming), match `sha256`
    when the catalogue provides one (otherwise `fileSize`), be UTF-8 JSON
    without `__proto__`, `constructor`, or `prototype` keys at any depth, and
    have an explicit `groups` object in the tag pack format, within size
    limits. Checks live in `shared/file-hub.js`.
  - In Firefox, users can withhold MV3 host permissions; the download then
    reports how to allow access instead of failing with a CORS error.
  - Installs are stored as normal packs (`hub-<package id>`) in
    `lazymod_global_palettes` and recorded in `lazymod_hub_packages`
    (`{ [package id]: { packId, version, sha256, name, installedAt } }`). A
    record whose pack was deleted counts as not installed. Update replaces
    the pack after a second confirmation click.
  - Only `json` packages for `targetApp: "quicktag"` can be installed; other
    file types are listed as not supported.

## Browser loading notes

| Part | Chrome (unpacked) | Firefox (temporary add-on) |
| --- | --- | --- |
| Background | `background.service_worker` with `"type": "module"` (module service worker; `background.scripts` is ignored) | `background.scripts` with `"type": "module"` (event page; `service_worker` is ignored) |
| Content script | `scripts/content.js` runs `import(chrome.runtime.getURL("scripts/content/main.js"))`; imported modules run in the content script's isolated world | Same; supported since Firefox 89 |
| Popup and editor | `<script type="module">` | Same |

- Every module that the content script imports must be listed in
  `web_accessible_resources` (`scripts/content/*`, `scripts/content/ui/*`,
  `scripts/shared/*`). The entry uses `"matches": ["<all_urls>"]` because the
  tagger runs on every page. A new module subfolder must be added explicitly;
  a `*` is not relied on to match nested folders.
- `use_dynamic_url` is not set; loading was verified without it. It is a
  Chrome-only option that limits fingerprinting through the fixed extension
  ID, and enabling it would need a separate test in Chrome. Firefox already
  uses a random per-install UUID. Like the stylesheets and template that were
  already web-accessible, the module files let a page detect that QuickTag is
  installed in Chrome.
- Page CSPs do not block module loading or the extension's `fetch()` calls
  for packaged files in either browser. Firefox does apply a strict page CSP
  to inline styles that the content script adds to the page's DOM, including
  its Shadow DOM:
  - `pages/popup.html` must not contain `style="…"` attributes
    (`style-src-attr`). Use rules in `styles/tagger.css`, or set
    `element.style` from script (CSSOM is not blocked).
  - A `<style>` element must already contain its CSS when it is inserted
    (`style-src-elem`); `ui/theme.js` creates a new, filled element for each
    theme change.
- For a missing packaged file, Chrome rejects `fetch()`, while Firefox
  resolves it and rejects while the body is read (`AbortError`). Handle both
  when fetching optional files.
- The editor's `builtin-import` pack ID and its `data/import.json` fallback
  are kept for palettes saved by early versions. The file is no longer
  bundled, so opening that ID without a saved override shows a clear error.
- On first initialization, the content script saves the palette state
  (including the default packs and `defaultPacksLoaded`) so the editor page
  can open default packs immediately.

## Releases and update metadata

`manifest.json` `version` stays at the last released version during
development; the next version is listed as `[x.y.z] - Unreleased` in
`CHANGELOG.md`. To release: bump `version` in `manifest.json`, date the
changelog entry, publish the GitHub release, and only then update `version`
in the Gist's `update.json`. If the Gist is updated first, installed copies
show a "NEW" badge that links to a release that does not exist yet.

## Validation

Check JavaScript syntax after changing scripts (Node.js 22 or later detects ES
module syntax automatically):

```powershell
Get-ChildItem scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Validate `manifest.json` as JSON, then run the automated browser tests in
installed Chrome and Firefox, one after the other (see
`tools/browser-tests/README.md`):

```powershell
node tools/browser-tests/chrome.mjs
node tools/browser-tests/firefox.mjs
```

They cover loading, the strict-CSP page, the tagger, Focus Mode, the Assets
tab (against a local mock File Hub), the background script, the popup, and
the editor. Then load the repository root in each target
browser for the manual checks listed in that README. Full AI analysis testing
requires a running ComfyUI instance with the WD14 node installed.

## Documentation maintenance

Keep `README.md`, `PROJECT.md`, and `CHANGELOG.md` in English. Update
`PROJECT.md` and `CHANGELOG.md` in the same change when project features,
architecture, configuration, or file structure changes. Describe the current
implementation and omit cosmetic changes that do not affect use or maintenance.
