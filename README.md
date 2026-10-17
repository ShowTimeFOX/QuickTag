# QuickTag LazyMod

QuickTag LazyMod is a Chromium extension for tagging images with a floating
tagger. It includes editable tag palettes, page-specific profiles, interface
customization, and optional image analysis through a local ComfyUI installation
with the WD14 Tagger node.

> **Work in progress:** QuickTag LazyMod is actively being developed. Some
> features or interface elements may be incomplete or may not work as expected.
> Please save your work regularly and report issues with steps to reproduce them.

## Features

- Organize tags into palettes, groups, and categories; import and export palette
  JSON files.
- Add or remove tags individually or in batches, and search with fuzzy matching.
- Analyze the current image with ComfyUI-WD14-Tagger and adjust the confidence
  threshold for suggestions.
- Configure page-specific selectors for tag fields, images, and source links.
- Move, resize, dock, collapse, or hide the tagger. Its layout is remembered
  separately for each site.
- Choose a built-in theme or a custom accent color.
- Enable or disable the extension globally and allow or block selected domains
  from the toolbar popup.
- Export or import the extension configuration and restore default settings.
- Check for a newer version from the toolbar popup.

The extension interface is in English. The project notes in `project.md` are
maintained in Polish.

## Requirements

- A Chromium-based browser that supports Manifest V3, such as Chrome or Edge.
- Access to the websites where you want to use the tagger.
- Optional: ComfyUI running locally at `http://127.0.0.1:8188`, with the
  [ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)
  custom node installed.

## Install from this source folder

1. Download or clone this project to your computer.
2. Open your browser's extensions page (for example, `chrome://extensions`).
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the folder containing `manifest.json`.
5. Click the QuickTag LazyMod toolbar icon to open its control panel.

After changing the source files, click **Reload** for the extension on the
extensions page, then refresh the website where you are testing it. Unpacked
extensions are not installed or updated automatically by the browser.

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
require a JavaScript package manager or build step. See `project.md` for
additional project details and development notes.
