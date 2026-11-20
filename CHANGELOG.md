## [1.2.0] - Unreleased

### Added

- Focus Mode (`Alt+A`): a full-screen workspace with a top bar (page and
  site profile, layout preset, active and muted tag counts, live sync, exit),
  an image preview (fit or 1:1, with dimensions), a tag list, and a
  full-height palette. Badges switch between active and muted without being
  deleted, `×` removes them, and an inline input adds tags. The list has
  Badges and Raw text views and can be sorted (A–Z, Z–A, added order, by pack
  group), deduplicated, copied as one string, or cleared. The page's tag field
  stays in sync both ways while Live sync is on.
- Focus Mode settings: toggle and close shortcuts (defaults `Alt+A` and
  `Esc`; `Esc` closes open menus and dialogs first), and strict shortcut
  capture, which lets QuickTag handle its shortcuts before the page.
- Focus Mode layout JSON with presets (Default, Wide palette, Image review):
  grid areas, column and row sizes, and panel visibility. It can be viewed,
  edited, imported, exported, and reset from Focus Mode, and is included in
  configuration backups.
- Assets tab next to Settings: browse the QuickTag tag packs on File Hub
  (`showtimefox-file-hub.pages.dev`) with search by name, author, or
  description, a category filter, and sorting (recently updated, newest, top
  rated, most downloaded, name). One-click Install adds and selects a pack;
  installed packs are marked, and Update replaces a pack with a newer File Hub
  version after a confirmation click. Downloads run in the background script,
  are limited to 2 MB, are checked against the published SHA-256 checksum, and
  must be valid tag pack JSON without `__proto__`, `constructor`, or
  `prototype` keys. File Hub is contacted only when the tab is opened.
- Automated browser tests in `tools/browser-tests/` that load the extension
  into installed Chrome and Firefox (headless, no dependencies) and check the
  tagger, background script, popup, and editor on a plain page and a
  strict-CSP page.
- Semi-transparent left and right arrows on the group and category tab strips
  scroll them smoothly. They appear only when the strip overflows, and the
  arrow at an edge is disabled.
- A link to the project website (`showtimefox.github.io`) and the GitHub
  repository on the About page.

### Changed

- Split all scripts into ES modules: `scripts/shared/` (constants, storage, tag,
  palette, site profile, and validation helpers), `scripts/content/` and
  `scripts/content/ui/` (tagger logic and interface components),
  `scripts/background/` (messages, update checks, ComfyUI), and
  `scripts/editor/` (easyJson and code editor components).
- `scripts/content.js` is now a loader that imports the content modules. The
  shared manifest lists the module folders in `web_accessible_resources` and
  declares the background entry with `"type": "module"`.
- Storage keys, message actions, and defaults are defined once in
  `scripts/shared/constants.js` instead of being repeated across scripts.
- Replaced the remaining `innerHTML` assignments with `replaceChildren()`.
- Imported tag packs skip groups and categories named `__proto__`,
  `constructor`, or `prototype`.
- The tag counter now also updates when the page's tag field is edited
  directly or the Palette tab is opened.

### Fixed

- The window buttons, including close (x), no longer shift when the site
  profile badge is long, when a theme decorates the title, or when the page
  sets inherited text styles such as `line-height`, `letter-spacing`, or
  `text-transform`. Long profile names are truncated, with the full name in a
  tooltip.
- Long tags and lists no longer overflow horizontally: tag lists stay within
  the window, chip text wraps, and a side-docked window never exceeds the
  viewport width at larger window scales.
- Translated the remaining Polish interface text (copy confirmation and the AI
  blacklist editor title) to English.
- On a fresh install, editing a default tag pack failed with "The selected
  palette could not be found" until the pack selection changed. The initial
  palette state is now saved on first load.
- Chip states and the tag counter now follow direct edits of the page's tag
  field immediately, instead of after the first 1.5-second page check.
- Firefox: on pages with a strict Content Security Policy, the Settings view
  and the AI "Add all" button showed on load, and the theme stylesheet could
  stay blocked. The tagger template no longer uses inline style attributes,
  and theme styles are inserted with their content.
- Opening the legacy `builtin-import` pack, whose `data/import.json` is no
  longer bundled, now shows a clear error in both browsers instead of
  "Failed to fetch" or "The operation was aborted".

### Documentation

- Renamed `project.md` to `PROJECT.md` to match the links in `README.md`.
- Documented browser loading, `web_accessible_resources`, Firefox CSP
  behavior, and the release and update-metadata workflow in `PROJECT.md`.

## [1.1.0] - 2026-10-21

### Added

- Global Visibility Toggle: Extension visibility state is now stored in `chrome.storage.local` and synchronized in real-time across all browser tabs without page reloads.
- Added a word-wrap toggle to the palette editor.
- Added clear JSON format guidelines and examples to `README.md`.
- Added this changelog, documented the source layout, and added development checks in the README.
- Added the MIT license in `LICENCE`.

### Changed

- Users can now delete any tag pack, including pre-installed default packs.
- Combined separate manifest.json files into a single file shared across all browsers.
- Organized extension files into `scripts/`, `pages/`, `styles/`, `data/`, and `assets/` while keeping `manifest.json` at the project root.
- Renamed the shared tagger stylesheet to `styles/tagger.css`.
- Compacted the toolbar popup and moved the About link into its banner.
- Improved 'theme-halloween' CSS performance for Firefox.

### Fixed

- The palette editor now resets its scroll position to the top when content is loaded or replaced.
- Word-wrap mode now keeps line numbers and current-line highlighting visible and aligns them with wrapped lines.

### Removed

- Per-site Blacklist/Whitelist System: Removed the old per-site filtering logic in favor of the new simplified Global Visibility Toggle.
