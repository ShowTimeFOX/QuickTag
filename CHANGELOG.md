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
