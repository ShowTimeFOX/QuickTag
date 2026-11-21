// Shared paths and temp-directory handling for the browser test runners.
//
// Everything temporary (browser profiles, the test copies of the
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
 * Both runners load a temporary copy of the extension (the repository is
 * never modified):
 * - `hubBaseUrl` points FILE_HUB_BASE_URL at the local mock File Hub, so the
 *   Assets checks never depend on the live site.
 * - `exposePages` (Firefox): WebDriver BiDi refuses to navigate directly to
 *   moz-extension:// pages, so the copy's manifest also exposes the popup and
 *   editor pages as web-accessible, and a test page navigates to them itself.
 */
export function createTestCopy({ label, hubBaseUrl, exposePages = false }) {
  const dir = makeTempDir(`${label}-ext`);
  for (const entry of EXTENSION_ENTRIES) {
    fs.cpSync(path.join(REPO_ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  if (hubBaseUrl) {
    const constantsPath = path.join(dir, "scripts", "shared", "constants.js");
    const source = fs.readFileSync(constantsPath, "utf8");
    const pattern = /export const FILE_HUB_BASE_URL = "[^"]*";/;
    if (!pattern.test(source)) throw new Error("FILE_HUB_BASE_URL not found in scripts/shared/constants.js");
    fs.writeFileSync(constantsPath, source.replace(pattern, `export const FILE_HUB_BASE_URL = ${JSON.stringify(hubBaseUrl)};`));
  }
  if (exposePages) {
    const manifestPath = path.join(dir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.web_accessible_resources[0].resources.push("pages/extension-popup.html", "pages/palette-editor.html", "pages/about.html", "pages/permissions.html");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
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
