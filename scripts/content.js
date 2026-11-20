// Classic-script loader for the content-script ES modules.
//
// Manifest V3 cannot declare content scripts as modules, so this file (listed
// in manifest.json `content_scripts`) imports the entry module dynamically.
// Supported by Chrome and Firefox (89+). The module files must be listed in
// `web_accessible_resources` (scripts/content/*, scripts/shared/*).
(async () => {
  try {
    await import(chrome.runtime.getURL("scripts/content/main.js"));
  } catch (error) {
    console.error("[QuickTag] Could not load the tagger modules.", error);
  }
})();
