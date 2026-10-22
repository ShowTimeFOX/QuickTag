# QuickTag LazyMod

QuickTag LazyMod is a browser extension for tagging images with a floating
tagger in Chrome and Firefox. It includes editable tag palettes, page-specific
profiles, interface customization, and optional image analysis through a local
ComfyUI installation with the WD14 Tagger node.

> **Work in progress:** QuickTag LazyMod is actively being developed. Some
> features or interface elements may be incomplete or may not work as expected.
> Please save your work regularly and report issues with steps to reproduce them.

## Features

- Organize tags into palettes, groups, and categories; import and export palette
  JSON files.
- Edit palettes with JSON formatting, easyJson mode, and optional word wrap
  with aligned line numbers and current-line highlighting.
- Add or remove tags individually or in batches, and search with fuzzy matching.
- Analyze the current image with ComfyUI-WD14-Tagger and adjust the confidence
  threshold for suggestions.
- Configure page-specific selectors for tag fields, images, and source links.
- Move, resize, dock, collapse, or hide the tagger. Its layout is remembered
  separately for each site.
- Choose a built-in theme or a custom accent color.
- Show or hide QuickTag across all pages from the toolbar popup.
- Export or import the extension configuration and restore default settings.
- Check for a newer version from the toolbar popup.

The extension interface and project documentation are in English.

## Custom Tag Packs Format

Custom tag packs are JSON files with a `name` and a `groups` object. Each group
contains categories, and each category contains an array of tag strings. Use at
least one group and category; names are labels shown in the tagger.

```json
{
  "name": "Landscape Pack",
  "groups": {
    "Environment": {
      "Location": ["forest", "mountain", "beach"],
      "Weather": ["sunny", "rain", "snow"]
    },
    "Composition": {
      "Framing": ["wide_shot", "close-up", "from_above"]
    }
  }
}
```

`name` is the pack’s display name. `groups` organizes tags into top-level
sections; each group’s properties are category names, and each category’s
value must be an array of strings. Save the file as `.json`, then choose
**Import** in the tagger to add it.

## Requirements

- Chrome or Firefox with Manifest V3 support.
- Access to the websites where you want to use the tagger.
- Optional: ComfyUI running locally at `http://127.0.0.1:8188`, with the
  [ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)
  custom node installed.

## Install

- **Chrome (Unpacked):** open `chrome://extensions`, enable **Developer mode**, click Load unpacked, and select the unpacked extension folder. Updates require clicking the reload button after rebuilding.
- **Firefox (Signed .xpi):** install the final signed .xpi file (downloaded from GitHub Releases or generated via Mozilla AMO) directly by dragging it into Firefox or using Install Add-on From File....
- **Firefox (Temporary debugging):** open `about:debugging#/runtime/this-firefox`, choose **Load
  Temporary Add-on...**, and select downloaded package (temporary add-ons are removed when Firefox closes).

Click the QuickTag LazyMod toolbar icon to open its control panel.

After changing the source files, click **Reload** for the extension on the
browser's extensions page, rebuild the relevant package, and refresh the
website where you are testing it. Temporary Firefox add-ons are removed when
Firefox closes. Unpacked extensions are not installed or updated automatically.

## Optional: enable AI image analysis

1. Install and start ComfyUI, making sure it is available at
   `http://127.0.0.1:8188`.
2. Install the **ComfyUI-WD14-Tagger** custom node using ComfyUI-Manager or the
   installation instructions in its
   [GitHub repository](https://github.com/pythongosssss/ComfyUI-WD14-Tagger).
3. Restart ComfyUI after installing the node.
4. Open a page with an image and select **Analyze image** in QuickTag LazyMod.

The extension's **About** page contains more detailed setup instructions.
Palette editing, tagging, and other non-AI features do not require ComfyUI.

## Checking for updates

The toolbar popup checks the configured public GitHub Gist for update metadata.
When it detects a newer version, the extension displays a **NEW** badge on its
toolbar icon and provides a link to the GitHub release page.

This check does not install updates automatically. For an unpacked extension,
download the updated source, replace the local files, and reload the extension
from the browser's extensions page. The release page and its files must be
accessible to your GitHub account.

## Project notes

The extension is loaded directly from this folder and does not currently
require a JavaScript package manager or build step. See
[PROJECT.md](PROJECT.md) for additional project details and development notes.

## Source layout

- `manifest.json` is the Manifest V3 source manifest for Chrome and Firefox.
- `scripts/` contains the background worker, content script, and page scripts.
- `pages/` contains the extension pages and the tagger interface template.
- `styles/` is the stylesheet catalog, including `tagger.css`, page styles, and
  themes.
- `data/` contains built-in palette data; `assets/` contains extension images.

The toolbar popup's **Global visibility** toggle immediately shows or hides
QuickTag across all open pages without reloading them. Newly opened pages use
the saved global visibility setting.

## Development

After changing JavaScript files, check their syntax with:

```powershell
node --check scripts/background.js
node --check scripts/content.js
node --check scripts/extension-popup.js
node --check scripts/palette-editor.js
```

Validate `manifest.json` as JSON and reload the unpacked extension in your
browser after making changes. Full AI analysis testing requires a running
ComfyUI instance with the WD14 Tagger node installed.

See [CHANGELOG.md](CHANGELOG.md) for project changes and [LICENCE](LICENCE) for
the MIT license.
