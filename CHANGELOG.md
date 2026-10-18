# Changelog

Notable changes to QuickTag LazyMod are documented here.

## [Unreleased]

### Fixed

- The palette editor now resets its scroll position to the top when content is
  loaded or replaced.
- Word-wrap mode now keeps line numbers and current-line highlighting visible
  and aligns them with wrapped lines.
- Restored type-to-search in the tagger and prevented page inputs, including
  inputs inside open shadow roots, from being intercepted.
- Replaced the toolbar's global enable and whitelist/blacklist controls with a
  current-site override that hides or shows QuickTag without reloading tabs.
- Compacted the toolbar popup, removed the domain-list controls, and moved the
  About link into its update banner as an information icon.

### Changed

- Renamed the project guide to `PROJECT.md` and translated it into English.
- Split the Manifest V3 background configuration for Chrome and Firefox and
  added a browser-specific packaging script.
- Organized extension files into `scripts/`, `pages/`, `styles/`, `data/`, and
  `assets/` while keeping `manifest.json` at the project root.
- Renamed the shared tagger stylesheet to `styles/tagger.css`.

### Added

- Added a word-wrap toggle to the palette editor.
- Added this changelog and documented the source layout and development checks
  in the README.
- Added the MIT license in `LICENCE`.
