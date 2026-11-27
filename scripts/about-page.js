// About page: shows the installed version. Everything else is static; the
// guides live on the Docs page (docs-page.js, content in docs/sections.js).
const badge = document.getElementById("about-version");
try {
  badge.textContent = `v${chrome.runtime.getManifest().version}`;
} catch {
  badge.hidden = true;
}
