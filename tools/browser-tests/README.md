# Browser tests

Automated checks that load QuickTag into real, installed Chrome and Firefox
(headless) and exercise the tagger, background script, popup, and editor on a
plain page and on a page with a strict Content Security Policy. Run them before
a release and after changes to loading, manifest, or shared modules.

No dependencies are needed: the runners use only Node.js (22 or later) and the
browsers' built-in automation protocols.

## Run

From the repository root:

```powershell
node tools/browser-tests/chrome.mjs
node tools/browser-tests/firefox.mjs
```

Each runner prints PASS/FAIL per check, a summary, and any console errors or
warnings, and exits with code 1 if a check failed. Run them one after the
other: the checks use fixed wait times, and running both browsers at once can
make a slow machine miss them.

Browser paths default to the standard install locations. Override them with
environment variables:

```powershell
$env:CHROME_PATH = "C:\path\to\chrome.exe"
$env:FIREFOX_PATH = "C:\path\to\firefox.exe"
```

## How it works

| File | Purpose |
| --- | --- |
| `pages.mjs` | Local HTTP server with a plain page and a strict-CSP page (`default-src 'none'` and Trusted Types), plus the probe expressions evaluated in pages. |
| `chrome.mjs` | Starts Chrome with `--remote-debugging-pipe --enable-unsafe-extension-debugging` and loads the repository with the DevTools `Extensions.loadUnpacked` command (branded Chrome no longer accepts `--load-extension`). |
| `firefox.mjs` | Starts Firefox with WebDriver BiDi and installs a temporary add-on with `webExtension.install`. |
| `config.mjs` | Browser paths, temporary directories, the Firefox test copy, and result reporting. |

- Browser profiles are created in the OS temp directory and deleted afterwards.
- Firefox's BiDi refuses direct navigation to `moz-extension://` pages, so
  the Firefox run uses a temporary copy of the extension whose manifest also
  lists `pages/extension-popup.html` and `pages/palette-editor.html` as
  web-accessible. A test page then navigates to them. The copy is created in
  the OS temp directory and deleted afterwards; the repository manifest is
  never changed. Evaluating scripts in extension pages also requires
  `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`, which the runner sets for Firefox only.
- Firefox has no direct check of the background script; it is verified
  through its replies (update check, AI analysis request, opening the About
  page).

## Expected console output

With ComfyUI not running, these entries are expected:

- A refused connection to `http://127.0.0.1:8188/system_stats` (popup status).
- `data/import.json` not found and "This legacy starter palette is no longer
  bundled" (the legacy `builtin-import` editor check runs on purpose).

The update check contacts the public GitHub Gist, as the extension does.

## Not covered

Visual appearance, real mouse dragging and resizing, physical key presses,
file dialogs, clipboard access, the toolbar button itself, and analysis with a
running ComfyUI instance still need a manual check.
