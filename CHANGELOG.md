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
- A Focus Mode button in the tagger header, next to the ghost mode button, and
  the QuickTag mark with the "Focus Mode" title in the top-left corner of
  Focus Mode.
- Customize in Focus Mode: move panels (swap with a neighbor), make them wider,
  narrower, taller, or shorter, and save the arrangement as a new layout in the
  Layout list.
- Focus Mode scale: follows Settings › Window scale, or a separate scale from
  75% to 150%.
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
- Pack switcher: the tag pack selector opens a list that searches every
  installed pack by name, File Hub version, or group, category, and tag names,
  switches packs (also with the arrow keys), and uninstalls packs with Undo.
  It replaces the native drop-down, which closed whenever the tagger scrolled
  under the pointer. If the selected pack is
  uninstalled, the next one is selected. The opened list scrolls natively.
- Ghost scroll on the pack selector: scrolling the mouse wheel over the
  closed selector opens a floating list of packs right over it (hovering alone
  does nothing). The pack under the pointer is highlighted and a click selects
  it; the list fades out (150 ms, ease-out) when the pointer leaves it or after
  2 seconds without movement, and closes on Escape or a click outside. It can
  be turned off in Settings › Interface › Ghost scroll on the pack selector
  (on by default).
- Uninstall with Undo for installed packs on their Assets cards; the card
  offers Install again afterwards.
- Delete layout in Focus Mode Customize removes a saved layout (built-in
  layouts are kept) and shows Default again.
- Docs page (`pages/docs.html`, opened from About): a user guide with a left
  sidebar (Getting Started, Tag Palette & AI Suggestions, Window Controls /
  Ghost Mode / Focus Mode, Site Profiles & Auto-Detect, Assets & File Hub,
  Troubleshooting, What's New), written in plain language with small version
  badges for new features. Troubleshooting covers a window that moved or is
  off-screen, URL patterns with IDs or `*`, profiles that don't find the tag
  field, unsaved editor changes, File Hub loading, and AI setup. Sections and
  questions can be linked directly (`docs.html#troubleshooting/url-pattern`).
- Assets cards: Preview shows a package's groups, categories, and first tags
  before installing (validated like an install, nothing is saved), and Show
  in Hub opens the package's page on File Hub.
- Tag separator per site profile (Settings › Current page profile): how tags
  are joined and split in the site's tag field, for example `, ` for
  comma-separated sites; a space by default.
- Reduce visual effects (Settings › Appearance): turns off blur, shadows, and
  animations in the tagger and Focus Mode for slower computers.
- AI suggestions live in the tag palettes: the AI button (with a loading
  spinner) analyzes the image, and the suggestions appear as an "AI" group at
  the start of the groups in the tagger and Focus Mode, with loading, empty,
  and error states.
- Focus Mode palette: group and category tabs like the tagger, Flat view, and
  "+ All".
- Focus Mode image: zoom with the mouse wheel and drag to move; double-click,
  the zoom percentage, Fit, or 1:1 reset the view.
- File Hub: when QuickTag lacks access to the download sites, a small QuickTag
  window asks the browser for it and the install or preview continues.
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
- The separate AI Suggestions section is gone (now the AI button and "AI"
  group in the palettes). "Add tags" is now "+ All", Flat view shows category
  labels, and the palette uses the full height of the Tagging tab.
- The title bar and tab strip stay in place; each tab's content scrolls in its
  own area below them (and keeps its scroll position when you switch tabs).
- The Focus Mode image area uses a calm gradient instead of a checkerboard.
- Focus Mode: the tag list controls sit next to the "Tags" heading as compact
  buttons, badges use the normal chip size, and palette chips add or remove
  tags (muting stays on the badges).
- The Undo prompt after an uninstall disappears after 5 seconds (and can be
  dismissed); on Assets cards it now expires too.
- "Add current page profile" is now "Add profile for this site": the profile
  covers every page of the site (host and port) and starts from the `.*`
  selectors.
- The palette header's Delete button is now Uninstall: packs are removed the
  same way everywhere, right away with Undo, instead of after
  a confirmation dialog.
- About page: now a short overview (what QuickTag is, who it's for, four
  highlights, the installed version) with links to Docs. The feature list,
  ComfyUI and WD14 setup, tag pack format, and troubleshooting moved to Docs.
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
- Settings › Current page profile: the profile editor button reads "Edit
  profiles", with its icon on the left on one line (the icon used to sit on
  its own line above the label in Settings and Assets).
- Assets: the Website link has an open-in-new-tab icon; Refresh, Show in Hub,
  and Preview are compact icon buttons with tooltips and accessible names.
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
- Importing a tag pack threw an error after the import and did not reset the
  file picker, so selecting the same file again did nothing.
- Title bar: clicking Ghost Mode (or another title bar button) on its icon
  could start dragging the window. At a window scale other than 100% the
  window then jumped sideways on the slightest movement, so the button moved
  out from under the pointer and the click was lost. Buttons never start a
  drag now, a drag needs a few pixels of movement, the window follows the
  pointer exactly at any scale, and a release outside the page no longer
  leaves the window stuck to the cursor.
- Chrome: tag groups, categories, and packs switched to alphabetical order
  after the first save, because Chrome's storage returns object keys sorted.
  Their order is now saved with them; site profile order is saved too (it
  decides which profile matches first).
- Settings › Current page profile: changes did not reliably stay. A new
  profile only matched its exact page and never matched sites with a port, so
  the tagger switched back to `.*` right away, and element picks on `.*`
  changed the fallback for every site. Picks and the separator now save into
  this site's profile, which stays active.
- Opening the legacy `builtin-import` pack, whose `data/import.json` is no
  longer bundled, now shows a clear error in both browsers instead of
  "Failed to fetch" or "The operation was aborted".

### Documentation

- Renamed `project.md` to `PROJECT.md` to match the links in `README.md`.
- Added `docs/v1.2.0-todo.html`, an interactive checklist of the remaining
  manual checks, known issues, polish, and release steps.
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
