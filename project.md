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
| `scripts/background.js` | Handles extension messages, opens editor and information pages, checks for updates, and coordinates ComfyUI analysis. |
| `scripts/content.js` | Injects and manages the tagger, global visibility, tag packs, site profiles, search, tag state, and per-origin interface settings. |
| `scripts/extension-popup.js` | Handles global visibility, ComfyUI connectivity, and update checks in the toolbar popup. |
| `scripts/palette-editor.js` | Loads, validates, converts, and saves tag packs, site profiles, and the AI blacklist. |
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

- `scripts/content.js` runs on pages matched by `content_scripts` and creates
  the interface inside a Shadow DOM to reduce style conflicts with the host
  page. It restores page layout and visibility state before revealing the
  interface to prevent flicker.
- Shared tagger components use `styles/tagger.css`. The selected theme is
  loaded asynchronously from `styles/theme-<name>.css` into the same Shadow
  DOM. Theme stylesheets, the popup template, and both default pack JSON files
  are listed in `web_accessible_resources`.
- `scripts/background.js` handles extension events and messages, runs scheduled
  update checks, opens extension pages, and sends requests to the local ComfyUI
  server. The root manifest declares the background worker form for Chrome and
  the background script form for Firefox.
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
  `ShowTimeFOX/1c601aab8d8a4b7540b34fc3e273d74f`, compare its version with the
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
- The ComfyUI address is set in the code to `http://127.0.0.1:8188`. Changing
  its host or port requires matching changes to the configuration and
  `host_permissions` in `manifest.json`.

## Validation

Check JavaScript syntax after changing scripts:

```powershell
node --check scripts/background.js
node --check scripts/content.js
node --check scripts/extension-popup.js
node --check scripts/palette-editor.js
```

Validate `manifest.json` as JSON, then load the repository root in each target
browser and test the extension. Check JavaScript syntax with the commands
above. Full AI analysis testing requires a running ComfyUI instance with the
WD14 node installed.

## Documentation maintenance

Keep `README.md`, `PROJECT.md`, and `CHANGELOG.md` in English. Update
`PROJECT.md` and `CHANGELOG.md` in the same change when project features,
architecture, configuration, or file structure changes. Describe the current
implementation and omit cosmetic changes that do not affect use or maintenance.
