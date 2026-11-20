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
- Find any installed tag pack by name, group, category, or tag from the pack
  selector, and uninstall packs with Undo.
- Open Focus Mode (`Alt+A`) for a full-screen workspace with the page image,
  the tag list, and the palette side by side.
- Browse and install community tag packs from
  [File Hub](https://showtimefox-file-hub.pages.dev/) in the **Assets** tab.
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

## Switching, searching, and uninstalling tag packs

Click the tag pack selector (it shows the selected pack) to open the pack
list: every installed pack, local and from File Hub, with its source, group
count, and tag count. Type to filter by pack name, File Hub version, or any
group, category, or tag name (case-insensitive); a matching tag or category
is shown under the pack. Click a pack, or use the arrow keys and Enter, to
switch to it. While you scroll the list, the pack in the middle is shown
larger and named in an overlay, and the others are dimmed. Scrolling the list
never scrolls the tagger or the page. `Esc` or a click outside closes the
list.

**Uninstall** (in the list, or **Uninstall** in the palette header for the
selected pack) removes a pack right away and offers **Undo** for 10 seconds
below the pack selector. If the removed pack was selected, the next pack in
the list is selected. A pack installed from File Hub can also be uninstalled
from its card in the **Assets** tab, which then offers **Install** again.

## Focus Mode

Press `Alt+A` on any page, select the Focus Mode button next to the ghost
mode button in the tagger header, or select **Open** under **Settings › Focus
Mode**, to open a full-screen workspace:

- **Top bar:** the page host and site profile, the layout preset, the number
  of active and muted tags, the **Live sync** switch, and **Exit**.
- **Image:** the page image found by the site profile, fitted to the panel or
  at 1:1 (double-click to switch), with its dimensions.
- **Tags:** click a badge to mute it (it leaves the page's tag field but stays
  in the list) and click again to switch it back on; `×` removes it. Type in
  the input to add tags (Enter, space, or comma separate them). Switch between
  **Badges** and **Raw text**, sort (A–Z, Z–A, added order, or by pack group),
  deduplicate, copy all active tags as one string, or clear.
- **Palette:** every category of the selected group; clicking a tag adds it,
  mutes it, or switches it back on.

With **Live sync** on, the page's tag field follows every change, and edits
made on the page appear in Focus Mode. With it off, use **Apply to page** and
**Reload from page**. Muted tags are kept only until the page is reloaded.

`Esc` closes an open menu or dialog first, then Focus Mode. Both shortcuts can
be changed in **Settings › Focus Mode**. By default the page handles keys
first, and QuickTag skips a shortcut the page already uses; turn on **Strict
shortcut capture** to let QuickTag handle its shortcuts before the page.
On macOS, `Option+A` works for the default `Alt+A`.

**Focus Mode scale** (Settings › Focus Mode) follows **Window scale** by
default; turn off **Match window scale** to give Focus Mode its own size.

### Customizing the layout

Select **Customize** in the Focus Mode top bar. Each panel shows arrows that
move it (it swaps places with the panel in that direction) and **Width −/+**
and **Height −/+** buttons; a size button is disabled where the layout cannot
change that size (for example, a panel that spans the full width). Changes are
saved to the selected layout right away. Type a name and select **Save as new
layout** to add the arrangement to the **Layout** list. **Delete layout**
removes the selected saved layout (select it twice) and shows **Default**
again; the built-in layouts cannot be deleted. `Esc` or **Done** stops
customizing. **Reset to defaults** in the layout JSON dialog restores the
built-in layouts. Messages appear as a small notice at the bottom of the
screen and never move the panels.

### Focus Mode layout JSON

Select **Layout** in Focus Mode (or **Edit layout JSON** in Settings) to view,
edit, import, or export the layout. Each preset places the panels `topbar`,
`image`, `tags`, and `palette` on a CSS grid:

```json
{
  "version": 1,
  "activePreset": "default",
  "presets": {
    "default": {
      "name": "Default",
      "columns": "minmax(280px, 2fr) minmax(320px, 3fr)",
      "rows": "auto minmax(0, 1fr) minmax(0, 1.25fr)",
      "areas": ["topbar topbar", "image palette", "tags palette"],
      "panels": {
        "topbar": { "visible": true },
        "image": { "visible": true },
        "tags": { "visible": true },
        "palette": { "visible": true }
      }
    }
  }
}
```

`areas` lists the grid rows; each word is a panel or `.` for an empty cell,
every row needs the same number of cells, and each panel must form a
rectangle. `columns` and `rows` are CSS grid track sizes. A panel that is not
placed in `areas`, or has `"visible": false`, is hidden. Preset ids use
lowercase letters, digits, and hyphens. On narrow windows the panels are
stacked. The built-in presets are **Default**, **Wide palette**, and **Image
review**; **Reset to defaults** restores them.

## Assets (File Hub)

The **Assets** tab lists the QuickTag tag packs published on
[File Hub](https://showtimefox-file-hub.pages.dev/). Search by name, author,
or description, filter by category, and sort by update date, newest, score,
downloads, or name. **Install** adds the pack to your tag packs and selects
it; an installed pack shows **Installed**, and **Update** appears when File
Hub has a newer version (select it twice: updating replaces the installed
pack, including your edits to it). On each card, the eye button (**Preview
contents**) shows the groups, categories, and first tags of a package before
you install it, and the open-in-new-tab button (**Show in Hub**) opens File
Hub filtered to QuickTag packages in the same category. The refresh button
next to **Website** reloads the package list.

QuickTag contacts File Hub only when you open the Assets tab or select
**Refresh**. Package files are checked before anything is saved: at most
2 MB, matching the SHA-256 checksum published on File Hub, and valid tag pack
JSON. Only JSON tag packs can be installed. In Firefox, installing requires
QuickTag's permission to access websites; if it is turned off, the error
message explains how to allow it.

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

- `manifest.json` is the single Manifest V3 manifest shared by Chrome and
  Firefox.
- `scripts/` contains ES modules: `content/` (the tagger, with `content/ui/`
  for its interface components), `background/` (messages, update checks,
  ComfyUI, File Hub), `editor/` (palette editor components), and `shared/` (constants,
  storage, and validation used by every context). `scripts/content.js` is a
  small loader that imports the content modules.
- `pages/` contains the extension pages and the tagger interface template.
- `styles/` is the stylesheet catalog, including `tagger.css`, page styles, and
  themes.
- `data/` contains built-in palette data; `assets/` contains extension images.

The toolbar popup's **Global visibility** toggle immediately shows or hides
QuickTag across all open pages without reloading them. Newly opened pages use
the saved global visibility setting.

## Development

After changing JavaScript files, check the syntax of every script (Node.js 22
or later detects ES module syntax automatically):

```powershell
Get-ChildItem scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Validate `manifest.json` as JSON and reload the unpacked extension in your
browser after making changes. Full AI analysis testing requires a running
ComfyUI instance with the WD14 Tagger node installed.

See [CHANGELOG.md](CHANGELOG.md) for project changes and [LICENCE](LICENCE) for
the MIT license.
