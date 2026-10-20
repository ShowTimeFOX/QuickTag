# QuickTag LazyMod

QuickTag LazyMod is a Manifest V3 browser extension for tagging images with a
floating interface. It provides editable tag palettes, site-specific profiles,
interface customization, and optional image analysis through a local ComfyUI
installation with the WD14 Tagger node.

## Features

- **Tag palettes:** Use the built-in starter palette or create palettes
  organized into groups and categories. Switch palettes, import and export JSON
  files, edit palettes, and remove custom palettes.
- **Tag management:** Toggle tags individually or add and remove visible tags
  in batches. The same batch actions are available for AI suggestions.
- **Fuzzy search:** Find approximate matches. Keyboard controls include the
  arrow keys, Enter, and Escape; typing mode can start a search when focus is
  outside an editable field, including when the page uses an open shadow root.
- **AI image analysis:** Send an image to the local ComfyUI-WD14-Tagger
  integration. Review progress, filter suggestions by confidence threshold,
  and exclude selected tags. The confidence threshold is saved locally.
- **Configuration backup:** Export or import QuickTag settings, including
  palettes, site profiles, the AI blacklist, window settings, domain rules,
  per-site blacklist overrides, and the global enabled state. Import replaces
  the current configuration.
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

## Build and install for development

Chrome and Firefox use different Manifest V3 background configurations. Build
the package for the browser you want to test:

```powershell
.\build-extension.ps1 -Browser chrome
.\build-extension.ps1 -Browser firefox
```

The package is written to `dist/chrome` or `dist/firefox`.

### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the `dist/chrome` directory.
4. Click the QuickTag LazyMod toolbar icon to open its control panel.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on...**.
3. Choose `dist/firefox/manifest.json`.
4. Click the QuickTag LazyMod toolbar icon to open its control panel.

After changing source files, rebuild the package, reload the extension from the
browser's extensions page, and refresh the website where you are testing.
Temporary Firefox add-ons are removed when Firefox closes. Unpacked extensions
are not installed or updated automatically.

The build script copies the shared extension files and selects the
browser-specific manifest. It does not require a JavaScript package manager or
external JavaScript dependencies.

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
| `manifest.json` | Chrome Manifest V3 configuration, permissions, service worker, and content script. |
| `manifests/firefox.json` | Firefox Manifest V3 configuration using a background script. |
| `build-extension.ps1` | Builds a browser-specific extension directory from shared source files. |
| `assets/icon.png` | Icon used in the browser toolbar and extension popup. |
| `scripts/background.js` | Handles extension messages, opens editor and information pages, and integrates with ComfyUI and WD14. |
| `scripts/content.js` | Injects and manages the tagger, palettes, site profiles, search, tag state, and interface settings. |
| `scripts/extension-popup.js` | Handles global visibility, ComfyUI connectivity, and update checks in the toolbar popup. |
| `scripts/palette-editor.js` | Loads, validates, converts, and saves palettes, site profiles, and the AI blacklist. |
| `pages/extension-popup.html` | Toolbar popup for global controls, domain rules, ComfyUI status, and the About link. |
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
| `data/import.json` | Built-in starter palette loaded by the extension. |

## Architecture and data storage

- `scripts/content.js` runs on pages matched by `content_scripts` and creates
  the interface inside a Shadow DOM to reduce style conflicts with the host
  page. The host remains hidden while resources and settings load, then becomes
  visible after the saved window state has been restored to prevent flicker.
- Shared tagger components use `styles/tagger.css`. The selected theme is
  loaded asynchronously from `styles/theme-<name>.css` into the same Shadow
  DOM. The theme stylesheets are listed in `web_accessible_resources`.
- `scripts/background.js` handles extension events and messages and sends
  requests to the local ComfyUI server. Chrome uses it as an MV3 service worker;
  Firefox loads it as an MV3 background script. The browser-specific manifests
  are assembled by `build-extension.ps1`.
- The extension uses the `chrome.*` WebExtension API namespace, which is
  supported by both target browsers.
- Settings, site profiles, palettes, and the AI blacklist are stored locally
  with `chrome.storage.local`.
-   The toolbar's global visibility toggle stores a single boolean in
  `lazymod_enabled`. Content scripts hide or show the existing tagger across
  pages when this setting changes; the popup does not reload tabs. Older
  per-site blacklist and domain-rule values may remain in stored configuration
  backups, but they no longer control visibility.
- Update checks fetch `update.json` from the public Gist
  `ShowTimeFOX/1c601aab8d8a4b7540b34fc3e273d74f`, compare its version with the
  manifest, and set a "NEW" badge through the browser action API. Checks run at
  startup, every six hours, and when requested from the toolbar popup. The
  button opens the GitHub Releases page; unpacked installations still require
  a manual update and reload.
- Docking mode, dock edge, visibility, and floating position are saved per
  origin under `lazymod_site_layout_<origin>`. New pages start hidden; later
  loads restore the saved visibility and handle position.
- Export includes entries from the extension's local storage. Import validates
  the file and replaces the saved entries. Restoring defaults clears extension
  storage and reloads the current page to apply the initial state.
- The palette editor opens as an internal extension page. Its easyJson mode
  edits palette structure without requiring users to write JSON syntax by hand.
- ComfyUI analysis uses the `WD14Tagger|pysssss` node. The extension fetches
  the page image, uploads it to `/upload/image`, submits a workflow to `/prompt`,
  checks `/history` and `/queue`, and reads the resulting tags.
- The ComfyUI address is set in the code to `http://127.0.0.1:8188`. Changing
  its host or port requires matching changes to the configuration and host
  permissions in both manifests.

## Validation

Check JavaScript syntax after changing scripts:

```powershell
node --check scripts/background.js
node --check scripts/content.js
node --check scripts/extension-popup.js
node --check scripts/palette-editor.js
```

Validate both manifest files as JSON, build each browser package, and test by
loading the corresponding output directory in the browser. Full AI analysis
testing requires a running ComfyUI instance with the WD14 node installed.

## Documentation maintenance

Keep `README.md`, `PROJECT.md`, and `CHANGELOG.md` in English. Update
`PROJECT.md` and `CHANGELOG.md` in the same change when project features,
architecture, configuration, or file structure changes. Describe the current
implementation and omit cosmetic changes that do not affect use or maintenance.
