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
  in batches (**+ All**). AI suggestions appear as an "AI" group at the start
  of the palette groups, with the same batch action.
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
  source links, and the tag separator per site. The element picker
  highlights the selected element; changes save into the site's profile.
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
  layout with presets are configurable. A header button next to ghost mode
  opens it. **Customize** moves and resizes panels and saves arrangements as
  new layouts. Its scale follows Window scale or a separate setting.
- **Pack switcher:** The pack selector opens a dropdown panel that searches
  every installed pack (name, File Hub metadata, groups, categories, tags),
  switches packs, and uninstalls them with Undo. Scrolling the list shows a
  "ghost" overlay with the centered pack.
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
  saved locally and included in configuration backups. **Reduce visual
  effects** turns off blur, shadows, filters, transitions, and animations.
- **Quick actions:** Copy tags, clear the tag field, and view the tag count.
- **About and Docs pages:** About (`pages/about.html`) is a short overview
  with the installed version and a link to Docs. Docs (`pages/docs.html`) is
  the user guide: a left sidebar with Getting Started, Tag Palette & AI
  Suggestions, Window Controls / Ghost Mode / Focus Mode, Site Profiles &
  Auto-Detect, Assets & File Hub, Troubleshooting, and What's New. Sections
  open by address (`docs.html#troubleshooting`), and a Troubleshooting
  question by `docs.html#troubleshooting/<question id>`.
- **Consistent interface:** The tagger, editor, About, and Docs pages use English
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
5. Open a page containing an image and select **AI** in the tag palettes.
   Progress and connection errors are shown in the "AI" group.

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
| `scripts/shared/` | ES modules used by every context: `constants.js` (storage keys, message actions, defaults), `storage.js`, `tags.js`, `palette.js`, `site-configs.js`, `shortcuts.js`, `focus-layout.js` (layout schema, presets, and layout editing), `file-hub.js` (File Hub catalogue and pack validation), and `validation.js`. No DOM access at module level. |
| `scripts/background.js` | Background entry module; registers event listeners. |
| `scripts/background/` | `messages.js` (message router, opens extension pages), `updates.js` (update check and badge), `comfyui.js` (WD14 analysis), `file-hub.js` (File Hub catalogue and package downloads). |
| `scripts/content.js` | Classic-script loader that imports `scripts/content/main.js`. |
| `scripts/content/` | Tagger logic: `main.js` (startup order), `state.js` (shared runtime state), `events.js` (event bus), `visibility.js`, `page.js` (host page DOM and tag field), `site-profiles.js`, `palettes.js`, `fuzzy-search.js`, `config-backup.js`, `messaging.js`, `focus-tags.js` (Focus Mode tag model and page sync), `file-hub.js` (File Hub install records), `pack-manager.js` (uninstall with undo, installed-pack search). |
| `scripts/content/ui/` | Tagger interface components: `shell.js` (Shadow DOM), `theme.js`, `tabs.js`, `palette-panel.js` (tag palettes and the "AI" group), `chips.js`, `ai-settings.js` (AI threshold), `settings-panel.js`, `quick-actions.js`, `element-picker.js`, `window-layout.js`, `window-controls.js`, `ghost-mode.js`, `status.js`, `scroll-arrows.js`, `dom.js` (safe element builder), `shortcut-recorder.js`, `assets-panel.js` (Assets tab), `pack-browser.js` (pack switcher dropdown: search, uninstall), `pack-ghost-scroll.js` (wheel ghost scroll reel for the tagger and Focus Mode pack selectors, and its setting); Focus Mode: `focus-mode.js` (controller), `focus-topbar.js`, `focus-image.js`, `focus-tags-panel.js`, `focus-palette.js`, `focus-layout-dialog.js`, `focus-layout-editor.js` (Customize), `focus-settings.js`. |
| `scripts/extension-popup.js` | Toolbar popup module: global visibility, ComfyUI connectivity, and update checks. |
| `scripts/about-page.js` | About page module: shows the installed version (`chrome.runtime.getManifest()`). |
| `scripts/docs-page.js` | Docs page module: sidebar, one section at a time, `#section` and `#section/question` addresses, previous/next links. |
| `scripts/docs/` | Docs content and rendering: `sections.js` (all Docs text as plain data: `DOCS_SECTIONS` and `RELEASES`; editing notes at the top) and `render.js` (blocks and inline `**bold**`, `` `code` ``, `[label](target)` to DOM with `createElement`/`textContent`). |
| `scripts/palette-editor.js` | Editor page module: loads, validates, converts, and saves tag packs, site profiles, and the AI blacklist. |
| `scripts/editor/` | Editor components: `easy-json.js` (easyJson format) and `code-editor.js` (line numbers and word wrap). |
| `pages/extension-popup.html` | Toolbar popup for global visibility, ComfyUI status, updates, and the About link. |
| `pages/palette-editor.html` | Palette and settings editor page. |
| `pages/about.html` | Short About page: what QuickTag is, who it is for, highlights, version, and links to Docs. |
| `pages/docs.html` | Docs page shell; the content comes from `scripts/docs/sections.js`. |
| `pages/popup.html` | Floating tagger interface template. |
| `styles/tagger.css` | Shared styles for the tagger and its overlays. |
| `styles/extension-popup.css` | Toolbar popup styles. |
| `styles/palette-editor.css` | Palette editor styles. |
| `styles/about.css` | About page styles and the shared base of the guide pages (colors, brand, buttons, code, footer). |
| `styles/docs.css` | Docs page layout: sidebar (a scrolling row on narrow screens), sections, Troubleshooting questions, What's New. |
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
  image zoom, and `scale`: `"window"` to follow Window scale, or a number from
  0.75 to 1.5). With `strictCapture` off, shortcuts are handled by a
  bubble-phase `document` listener that skips events the page already
  handled; with it on, by a capture-phase `window` listener that stops the
  event. Page listeners registered on `window` in the capture phase before
  QuickTag loaded still run first. Shortcuts act only on `keydown` and ignore
  auto-repeat (`event.repeat`): opening Focus Mode moves focus into the
  overlay, so the `keyup` of the same press arrives there and must not toggle
  again.
- **Site profiles** (`content/site-profiles.js`). "Add profile for this site"
  creates a profile keyed by `location.host` (port included) whose pattern
  matches every page of that origin, starting from the `.*` selectors, and
  puts it first so it wins on later loads. The active profile is kept while
  it still matches the URL (`resolveActiveSiteKey`), so storage echoes and the
  1.5 s page watcher cannot switch away from a profile the user just added.
  `saveActiveProfileFields()` saves picks and the tag separator; on the `.*`
  fallback it creates this site's profile first. (Before, the profile pattern
  was host + path without the port, so it never matched on ports and only
  matched one page, and picks on `.*` changed every site.)
- **Tag separator** (`tagSeparator` in a site profile, default a space;
  `shared/tags.js` `splitTagText` / `joinTags`). `page.js` reads and writes
  the tag field with it; whitespace separators split on any whitespace, other
  separators on their non-space part. Focus Mode's Copy, Raw text, and input
  parsing use it too.
- **AI suggestions** (`content/ai-analysis.js`, no DOM) hold the analysis
  state (`idle`, `busy`, `done`, `error`), request, and results;
  `aiSuggestionsChanged` updates both palettes. The **AI** button sits in the
  palette controls and shows `aria-busy` and a spinner while running. Its
  results are a virtual "AI" group placed first in the group tabs (category
  "Suggestions") once an analysis has run; selecting it is view state in each
  palette, never written to `lazymod_global_palettes`, so it cannot clash
  with a pack group named "AI". The threshold control is in Settings
  (`ui/ai-settings.js`).
- **Palettes** in the tagger and Focus Mode share one structure: group tabs,
  category sub-tabs, or Flat view (category labels with all tags of the
  group; Focus Mode saves it as the `paletteFlat` pref), and **+ All** on the
  visible tags. Focus Mode palette chips add or remove tags (no muting; mute
  on the badges). In the tagger, the Tagging view is a flex column and the
  chips take the free height (`#lm-user-chips` `flex: 1 1 0`).
- **Title bar drag** (`initDragging` in `ui/window-controls.js`): pointer
  events; presses on controls (checked along the event path, so a button's
  icon counts) never drag; a drag starts after 4 px; positions come from the
  window's CSS `left`/`top` (its bounding box is offset by `transform:
  scale()` with `transform-origin: top right`); pointer capture, and ending
  on `pointercancel`, lost capture, or a move with no button pressed.
- **Window layout.** The tagger window is a flex column: the title bar and
  the tab strip (`#lm-main-tabs`) are `flex: 0 0 auto` and never shrink (the
  strip's `overflow-x: auto` would otherwise let it collapse to its padding in
  a short window); the active view (`#lm-view-main`, `#lm-view-sites`,
  `#lm-view-assets`) is the scroll area (`flex: 1 1 auto; min-height: 0;
  overflow-y: auto`). The body's flex layout uses a class selector so the
  collapse rules (`display: none`) still win.
- **Order in storage.** Chrome's `storage.local` returns object keys sorted
  alphabetically (Firefox keeps insertion order), which reordered groups,
  categories, and packs after the first save. Palette data is written with
  `encodePaletteData()` (adds `packOrder`, and `groupOrder` / `categoryOrder`
  per pack) and read with `decodePaletteData()` (`shared/palette.js`). Site
  profiles, which are matched in order, store their key order in
  `lazymod_site_profile_order`. Integer-like keys (e.g. a group named "2024")
  still sort first: JavaScript orders them before other keys.
- **Focus Mode image** (`ui/focus-image.js`): one pan/zoom model for Fit and
  1:1. The image is absolutely positioned and sized from a scale and offset;
  the wheel zooms around the pointer (handled only inside the image area,
  `passive: false`), dragging pans (pointer capture), and the offset is
  clamped so the image stays in view. Fit, 1:1, double-click, and the zoom
  label reset the view; a `ResizeObserver` refits when the panel changes size.
  The background is a soft gradient instead of a checkerboard.
- **Reduce visual effects** (`ui/visual-effects.js`, `lazymod_reduced_effects`)
  toggles `lm-reduced-effects` on the shadow host; `:host(.lm-reduced-effects)`
  rules in `tagger.css` and `focus-mode.css` cover every element in the shadow
  root, including theme styles.
- **Undo** after an uninstall is offered for `UNDO_TIMEOUT_MS` (5 s,
  `content/pack-manager.js`) in the pack switcher notice and on Assets cards.
- **Focus Mode scale** is CSS `zoom` on `#lm-focus-root`, so text,
  controls, and gaps scale together while the overlay still fills the
  viewport (Firefox supports `zoom` since version 126). The tagger window's
  own scale stays a `transform`. Focus Mode follows the Window scale slider
  live; only the `scale` pref is adopted from storage changes, so an echo of
  this tab's own earlier write can never undo a newer view change.
- **Customize** (`ui/focus-layout-editor.js`) uses pure preset transforms in
  `shared/focus-layout.js`: `swapPanels` swaps two panel names in `areas`
  (both stay rectangles), `neighborPanel` finds the panel to swap with in a
  direction, and `resizePanel` multiplies or divides the `fr` factors of the
  tracks a panel spans by 1.25 (clamped to 0.25–8; `minmax()` minimums are
  kept). Tracks without `fr`, `repeat()` lists, and panels spanning every
  track cannot be resized, and their buttons are disabled. Edits are saved to
  the active preset; `addPresetCopy` saves a named copy with a unique id.
  `Esc` leaves Customize before it exits Focus Mode (dismiss stack).
  `removePreset` deletes a user-saved preset (two clicks on **Delete
  layout**); built-in presets (`BUILT_IN_PRESET_IDS`) and the last preset are
  kept, and an active deleted preset falls back to `default`.
- **Focus Mode notices** (`setStatus`) are a toast on `#lm-focus-root`
  (absolute, `pointer-events: none`), so a message never resizes the top bar
  or moves panels; errors stay 8 seconds, other messages 3.5 seconds.
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
  - Host access: before downloading, the background checks the origins in
    `hubPermissionOrigins()` (the hub, the `downloadUrl` host, and GitHub's
    release-asset hosts). Firefox lets users withhold MV3 host permissions;
    if any is missing, the background opens `pages/permissions.html` in a
    popup window (content scripts cannot use `chrome.permissions`, and
    `permissions.request()` needs a user gesture in an extension page). Its
    **Allow access** click calls `permissions.request()` first thing, then
    sends `file_hub_permission_result` to the background, which forwards it
    to the tab; the Assets card retries the install or preview, or explains
    the manual steps. The page accepts only https origins (http on loopback)
    validated by `isValidPermissionOrigin()`. Origins are within the declared
    `<all_urls>` host permission, so the manifest is unchanged.
  - Installs are stored as normal packs (`hub-<package id>`) in
    `lazymod_global_palettes` and recorded in `lazymod_hub_packages`
    (`{ [package id]: { packId, version, sha256, name, installedAt } }`). A
    record whose pack was deleted counts as not installed. Update replaces
    the pack after a second confirmation click.
  - Only `json` packages for `targetApp: "quicktag"` can be installed; other
    file types are listed as not supported.
  - **Preview** uses the same background download and validation as an
    install, but saves nothing; the card shows `summarizePack()` (groups,
    categories, tag counts, the first tags per category). Previews are cached
    per package version.
  - **Show in Hub** links to `hubPackageUrl()`: the catalogue's `pageUrl`
    when set, otherwise the package deep link `index.html?package=<id>`
    (only a package without an id falls back to the hub list filtered to
    QuickTag and its category).
- **Pack switcher** (`ui/pack-browser.js`). The Tagging view's pack selector
  is a button (`#lm-pack-switcher`) that opens a dropdown panel, not a native
  `<select>`: browsers close a native select popup whenever an ancestor
  scrolls (a wheel over the select scrolls `#lazymod-body`). The panel
  closes on a pack choice, `Escape`, the
  switcher button, or a `pointerdown` outside it; the outside check uses
  `composedPath()` because document listeners see shadow-DOM clicks
  retargeted to the host. The list is rendered while closed too, so the label
  and list follow every palette change. The list scrolls natively, with no
  wheel handling or ghost effects (`overscroll-behavior: contain` keeps it
  from scrolling the tagger). Focus Mode's palette keeps a native
  `<select>`; nothing around it scrolls.
- **Uninstall and pack search** (`content/pack-manager.js`, shown by
  `ui/pack-browser.js` and the Assets cards). `palettes.removePack` deletes a
  pack and, if it was active, activates its neighbor (next, else previous,
  else none); it returns what `restorePack` needs to put the pack back at the
  same position. Uninstall also removes the pack's `lazymod_hub_packages`
  record, and Undo restores both. Uninstall acts immediately; Undo is offered
  for 5 seconds (`UNDO_TIMEOUT_MS`) instead of a blocking confirmation. It is the only way to
  remove a pack: the palette header's **Uninstall** (formerly a Delete
  button with `confirm()`) runs the same flow on the selected pack, and its
  Undo appears in `#lm-pack-notice` under the switcher, visible whether the
  list is open or not. Views learn about changes
  through `paletteChanged` (sources `packs` and `assets`) and storage change
  events. Search matches case-insensitive substrings against a per-pack index
  cached by pack object (a `WeakMap`), and never modifies packs.
- **Ghost scroll** (`ui/pack-ghost-scroll.js`). A mouse wheel over a pack
  selector opens a floating pack "reel" centered on it, with the active
  pack's row on the selector; hovering alone does nothing, and the selector's
  own list stays closed. One core serves both selectors through
  `attachGhostScroll({ trigger, list, isBlocked, onOpen, onClose })`, and only
  one reel is open at a time: the tagger's pack switcher (reel
  `#lm-pack-ghost-list`, a direct child of the tagger window; blocked while
  the dropdown is open) and the Focus Mode pack `<select>` (reel
  `#lm-focus-ghost-list`, created by `focus-palette.js` as a child of
  `#lm-focus-root`, `z-index` above the panels; registered with
  `api.pushDismissable` while open, so `Escape` closes it before Focus Mode).
  Being direct children of their positioned containers keeps scrolling views
  from clipping them. The containers scale differently (the window with
  `transform: scale()`, Focus Mode with CSS `zoom`), so the reel measures the
  container's scale and origin by placing itself as a 100 px probe, then
  positions itself in the container's CSS pixels, kept inside the container
  and the viewport. Spacer elements above and below the packs are sized so
  pack i sits on the switcher's row at `scrollTop = i × row height`, which
  lets the first and last pack reach it too; for that, the reel has no
  vertical padding or top/bottom border. Each wheel step moves a target index
  by exactly one pack, clamped at both ends: a mouse notch (a line/page
  delta, or one pixel delta of at least 50 px) is one step whatever its size;
  smaller pixel deltas (touchpads) add up to 40 px, step at most once per
  90 ms, and start over on a change of direction. `scrollTo` slides there smoothly (instantly with
  Reduce visual effects or reduced motion), so packs pass under the still
  pointer. Wheel input is handled with `preventDefault` only while ghost
  scroll is on and the dropdown is closed, so the tagger body never scrolls
  under it. The pack under the pointer gets `is-hovered` from
  `elementFromPoint` on pointer moves and every scroll frame, because
  `:hover` does not follow content scrolling under a still pointer; the
  highlighted pack is raised slightly (`scale(1.05)`, `z-index: 1`, an opaque
  background over its neighbors; the reel's side padding leaves room for it
  inside the borders). Styling: borders on the left and right only, and a `mask-image` (with
  `-webkit-mask-image`) gradient fades the background and packs out at the
  top and bottom; a click selects it (`paletteChanged`, source
  `ghost-scroll`). Leaving the list and the switcher, or 2 s without wheel or
  pointer movement, fades it out (`is-closing`: opacity, 150 ms ease-out); a
  choice, `Escape`, a `pointerdown` outside, opening the dropdown, hiding the
  extension, or turning the setting off close it at once. Setting:
  **Settings › Interface › Ghost scroll on the pack selector**
  (`lazymod_ghost_scroll`, on unless `false`), applied immediately and in
  every tab through storage change events; when it is off, wheel events over
  the switcher are left alone.

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
tab (against a local mock File Hub), the pack switcher (real mouse and wheel
input, search, native dropdown scrolling, wheel ghost scroll and its setting,
uninstall and undo), the background script, the popup, and
the editor. Then load the repository root in each target
browser for the manual checks listed in that README. Full AI analysis testing
requires a running ComfyUI instance with the WD14 node installed.

## Documentation maintenance

Keep `README.md`, `PROJECT.md`, and `CHANGELOG.md` in English. Update
`PROJECT.md` and `CHANGELOG.md` in the same change when project features,
architecture, configuration, or file structure changes. Describe the current
implementation and omit cosmetic changes that do not affect use or maintenance.

### About and Docs pages (user-facing)

- **About stays high-level:** what QuickTag is, who it is for, a few
  highlights, the version, and links to Docs. No release notes, setup guides,
  or feature details there.
- **Docs is the user guide.** Whenever a user-facing feature or a common
  workflow changes, update `scripts/docs/sections.js` in the same change:
  the section where people would look for it (mark new things with
  `since: "x.y.z"`), a **Troubleshooting** question for problems users are
  likely to hit, and the **What's New** entry (`RELEASES`, newest first) for
  the version being developed.
- **Plain, non-technical language:** say what to click and what happens. No
  file, module, storage, or API names; use the labels users see in the
  interface. The browser tests reject a few internal terms in Docs text.
- Keep section ids stable; About and the Troubleshooting deep links use them.
