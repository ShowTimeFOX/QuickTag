## [1.2.0] - Unreleased

### Added

- Automated browser tests in `tools/browser-tests/` that load the extension
  into installed Chrome and Firefox (headless, no dependencies) and check the
  tagger, background script, popup, and editor on a plain page and a
  strict-CSP page.

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
- The tag counter now also updates when the page's tag field is edited
  directly or the Palette tab is opened.

### Fixed

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
