// Shared paths and temp-directory handling for the browser test runners.
//
// Everything temporary (browser profiles, the Firefox test copy of the
// extension) is created under the OS temp directory and removed afterwards,
// so nothing is written into the repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFAULT_BROWSERS = {
  win32: {
    chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    firefox: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
  },
  darwin: {
    chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    firefox: "/Applications/Firefox.app/Contents/MacOS/firefox",
  },
  linux: { chrome: "google-chrome", firefox: "firefox" },
};

export function browserPath(name) {
  const fromEnv = process.env[`${name.toUpperCase()}_PATH`];
  return fromEnv || DEFAULT_BROWSERS[process.platform]?.[name] || name;
}

const tempDirs = [];

export function makeTempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `quicktag-${label}-`));
  tempDirs.push(dir);
  return dir;
}

export function cleanupTempDirs() {
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch (error) {
      console.warn(`Could not remove ${dir}: ${error.message}`);
    }
  }
}

const EXTENSION_ENTRIES = ["manifest.json", "assets", "data", "pages", "scripts", "styles"];

/**
 * Firefox's WebDriver BiDi refuses to navigate directly to moz-extension://
 * pages, so the Firefox run uses a temporary copy whose manifest also exposes
 * the popup and editor pages as web-accessible. A test page then navigates to
 * them itself. The repository manifest is never modified.
 */
export function createFirefoxTestCopy() {
  const dir = makeTempDir("firefox-ext");
  for (const entry of EXTENSION_ENTRIES) {
    fs.cpSync(path.join(REPO_ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.web_accessible_resources[0].resources.push("pages/extension-popup.html", "pages/palette-editor.html");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

/** Prints results and returns the process exit code (1 if any check failed). */
export function reportResults(browserName, results, problemsTitle, problems) {
  console.log(`\n=== RESULTS (${browserName}) ===`);
  for (const { name, ok, details } of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) console.log("      ", JSON.stringify(details));
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  console.log(`\n=== ${problemsTitle} ===`);
  console.log(problems.length ? problems.join("\n") : "(none)");
  return failed > 0 || results.length === 0 ? 1 : 0;
}
