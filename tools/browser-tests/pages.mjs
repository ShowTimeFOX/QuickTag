// Local test server (plain page + strict-CSP page) and the probe expressions
// both runners evaluate in pages.
import http from "node:http";
import crypto from "node:crypto";

// --- Mock File Hub (the test copies point FILE_HUB_BASE_URL at /hub/) ---
// `hubState` is mutable from the checks (same Node process).
export const hubState = { goodVersion: "1.0.0", failCatalogue: false, catalogueRequests: 0 };

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const packJson = (name, tags) => JSON.stringify({ name, groups: { "Hub Group": { "Hub Category": tags } } });
const HUB_FILES = {
  "good-1.0.0.json": packJson("Mock Hub Pack", ["hub_tag_one", "hub_tag_two"]),
  "good-1.1.0.json": packJson("Mock Hub Pack", ["hub_tag_one", "hub_tag_two", "hub_tag_three"]),
  "fallback.json": packJson("Fallback Pack", ["fallback_tag"]),
  "tampered.json": packJson("Tampered Pack", ["tampered_tag"]),
  // JSON.parse keeps "__proto__" as an own key.
  "proto.json": '{"name":"Proto Pack","groups":{"G":{"C":["x"]}},"__proto__":{"polluted":true}}',
  "toobig.json": packJson("Huge Pack", Array.from({ length: 150000 }, (_, index) => `huge_tag_${index}`)),
};

function hubCatalogue(base) {
  const goodFile = `good-${hubState.goodVersion}.json`;
  const entry = (id, fields) => ({
    id,
    version: "1.0.0",
    author: "tester",
    description: "Mock package",
    targetApp: "quicktag",
    targetAppName: "QuickTag",
    category: "tags",
    tags: ["quicktag", "tag-pack"],
    fileType: "json",
    downloads: 0,
    score: 0,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...fields,
  });
  const packages = [
    entry("good", { name: "Mock Hub Pack", version: hubState.goodVersion, author: "alice", description: "Primary download endpoint", assetId: "1001", fileSize: HUB_FILES[goodFile].length, sha256: sha256(HUB_FILES[goodFile]), downloads: 50, score: 5, updatedAt: "2026-11-15T00:00:00.000Z" }),
    entry("fallback", { name: "Fallback Pack", description: "Asset endpoint fails, downloadUrl works", assetId: "404404", downloadUrl: `${base}files/fallback.json`, sha256: sha256(HUB_FILES["fallback.json"]), downloads: 200, score: 1 }),
    entry("tampered", { name: "Tampered Pack", downloadUrl: `${base}files/tampered.json`, sha256: sha256("something else") }),
    entry("proto", { name: "Proto Pack", downloadUrl: `${base}files/proto.json`, sha256: sha256(HUB_FILES["proto.json"]) }),
    entry("toobig", { name: "Huge Pack", downloadUrl: `${base}files/toobig.json` }),
    entry("zipped", { name: "Zipped Pack", category: "themes", fileType: "zip", downloadUrl: `${base}files/zipped.zip` }),
    entry("otherapp", { name: "Other App Plugin", targetApp: "otherapp", downloadUrl: `${base}files/fallback.json` }),
    { id: "__proto__", name: "Bad id" },
  ];
  return { version: "1.0", total: packages.length, generatedAt: new Date().toISOString(), packages };
}

function handleHub(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const base = `http://${req.headers.host}/hub/`;
  if (url.pathname === "/hub/api/v1/packages") {
    hubState.catalogueRequests += 1;
    if (hubState.failCatalogue) {
      res.writeHead(503, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      return res.end('{"error":"Unavailable"}');
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
    return res.end(JSON.stringify(hubCatalogue(base)));
  }
  // Like the real hub, downloads send no CORS headers.
  const download = /^\/hub\/api\/download\/([^/]+)$/.exec(url.pathname);
  const file = download ? (download[1] === "1001" ? `good-${hubState.goodVersion}.json` : null) : /^\/hub\/files\/([^/]+)$/.exec(url.pathname)?.[1];
  if (file && HUB_FILES[file]) {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    return res.end(HUB_FILES[file]);
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  return res.end('{"error":"File not found."}');
}

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const PAGE = (title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body><h1>${title}</h1><textarea id="tags" rows="3" cols="60"></textarea><br><img id="image" src="/img.png" width="200" height="200"></body></html>`;

export const STRICT_CSP = "default-src 'none'; img-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'";

export function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/hub/")) return handleHub(req, res);
    if (req.url.startsWith("/img.png")) {
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(PNG);
    }
    // Large images for the Focus Mode Fit / 1:1 checks.
    const svgSize = { "/tall.svg": [300, 3000], "/wide.svg": [3000, 300] }[req.url.split("?")[0]];
    if (svgSize) {
      const [width, height] = svgSize;
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#4f8fee"/></svg>`);
    }
    if (req.url.startsWith("/hostile")) {
      // Inherited text properties cross the Shadow DOM boundary; `div` also
      // matches the extension's host element and beats its :host rules.
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(
        PAGE("Hostile styles page").replace(
          "</head>",
          `<style>html, body, div { line-height: 3 !important; letter-spacing: 4px !important; word-spacing: 20px !important; text-transform: uppercase !important; white-space: nowrap !important; text-align: right !important; } html { direction: rtl; }</style></head>`,
        ),
      );
    }
    if (req.url.startsWith("/csp")) {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": STRICT_CSP });
      return res.end(PAGE("Strict CSP page"));
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE("Plain page"));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/** Expressions evaluated in the page's main world (the shadow root is open). */
export const PROBES = {
  hostState: `(() => {
    const host = document.getElementById("quicktag-extension-root");
    if (!host) return { host: false };
    const root = host.shadowRoot;
    const win = root?.querySelector("#lazymod-window");
    return {
      host: true,
      visibility: host.style.visibility,
      display: host.style.display,
      styleCount: root ? root.querySelectorAll("style").length : 0,
      themeStyleBytes: root?.querySelector("#lazymod-theme-styles")?.textContent.length || 0,
      window: Boolean(win),
      windowHidden: win ? win.hidden : null,
      showButtonVisible: root?.querySelector("#lm-show-tagger") ? !root.querySelector("#lm-show-tagger").hidden : null,
      chipCount: root ? root.querySelectorAll("#lm-user-chips .lazymod-chip").length : 0,
      packOptions: root ? [...root.querySelectorAll("#lm-pack-list .lazymod-pack-item-name")].map((name) => name.textContent) : [],
      badge: root?.querySelector("#lm-active-badge")?.textContent,
      windowBg: win ? getComputedStyle(win).backgroundColor : null,
      windowPosition: win ? getComputedStyle(win).position : null,
      themeClass: win ? [...win.classList].find((c) => c.startsWith("theme-")) : null,
      tabBg: root?.querySelector("#lm-tab-btn-main") ? getComputedStyle(root.querySelector("#lm-tab-btn-main")).backgroundColor : null,
      sitesViewDisplay: root?.querySelector("#lm-view-sites") ? getComputedStyle(root.querySelector("#lm-view-sites")).display : null,
      mainViewDisplay: root?.querySelector("#lm-view-main") ? getComputedStyle(root.querySelector("#lm-view-main")).display : null,
      aiButton: root?.querySelector("#lm-fetch-ai")?.textContent.trim() || null,
      noAiGroup: root ? !root.querySelector("#lm-palette-tabs .lazymod-ai-tab") : null,
      tabsMargin: root?.querySelector("#lm-main-tabs") ? getComputedStyle(root.querySelector("#lm-main-tabs")).marginBottom : null,
    };
  })()`,
  showTagger: `(() => { const b = document.getElementById("quicktag-extension-root").shadowRoot.querySelector("#lm-show-tagger"); b.click(); return !b.hidden; })()`,
  clickFirstChip: `(() => {
    const root = document.getElementById("quicktag-extension-root").shadowRoot;
    const chip = root.querySelector("#lm-user-chips .lazymod-chip");
    chip.click();
    return { tag: chip.dataset.tag, field: document.getElementById("tags").value, counter: root.querySelector("#lm-tag-count-badge").textContent, chipActive: chip.classList.contains("active") };
  })()`,
  typeIntoField: `(() => {
    const field = document.getElementById("tags");
    field.value += " typed_one typed_two";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`,
  counter: `document.getElementById("quicktag-extension-root").shadowRoot.querySelector("#lm-tag-count-badge").textContent`,
  dock: `(() => {
    const root = document.getElementById("quicktag-extension-root").shadowRoot;
    root.querySelector("#lm-dock-btn").click();
    const win = root.querySelector("#lazymod-window");
    return { docked: win.classList.contains("docked"), edgeClass: [...win.classList].find((c) => c.startsWith("docked-")), bodyMarginRight: document.body.style.marginRight, button: root.querySelector("#lm-dock-btn").textContent };
  })()`,
  layoutAfterReload: `(() => {
    const root = document.getElementById("quicktag-extension-root")?.shadowRoot;
    const win = root?.querySelector("#lazymod-window");
    return win ? { hidden: win.hidden, docked: win.classList.contains("docked"), bodyMarginRight: document.body.style.marginRight } : null;
  })()`,
  typeToSearch: `(() => {
    document.body.focus();
    for (const key of ["h", "a", "i", "r"]) document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    const root = document.getElementById("quicktag-extension-root").shadowRoot;
    return { query: root.querySelector("#lm-palette-search").value, results: root.querySelectorAll("#lm-user-chips .lazymod-chip").length, highlighted: root.querySelectorAll(".search-highlighted").length };
  })()`,
  settingsTab: `(() => {
    const root = document.getElementById("quicktag-extension-root").shadowRoot;
    root.querySelector("#lm-tab-btn-sites").click();
    return { profile: root.querySelector("#lm-settings-profile").textContent, blacklist: root.querySelector("#lm-blacklist-count").textContent, sitesVisible: root.querySelector("#lm-view-sites").style.display };
  })()`,
  analyze: `(() => { document.getElementById("quicktag-extension-root").shadowRoot.querySelector("#lm-fetch-ai").click(); return true; })()`,
  // The AI group in the palette shows the analysis state.
  aiStatus: `document.getElementById("quicktag-extension-root").shadowRoot.querySelector("#lm-user-chips .lazymod-ai-message")?.textContent || ""`,
  clickAbout: `(() => { document.getElementById("quicktag-extension-root").shadowRoot.querySelector("#lm-tab-btn-about").click(); return true; })()`,
  hostDisplay: `document.getElementById("quicktag-extension-root")?.style.display`,
  popupState: `(() => ({
    toggle: document.querySelector("#global-toggle")?.checked,
    toggleDisabled: document.querySelector("#global-toggle")?.disabled,
    globalStatus: document.querySelector("#global-status")?.textContent,
    updateStatus: document.querySelector("#update-status")?.textContent,
    updateVersion: document.querySelector("#update-version")?.textContent,
    connection: document.querySelector("#connection-status")?.textContent,
    saveError: document.querySelector("#save-error")?.hidden === false ? document.querySelector("#save-error").textContent : "",
  }))()`,
  clickGlobalToggle: `(() => { document.querySelector("#global-toggle").click(); return true; })()`,
  editorState: `(() => ({
    title: document.title,
    editorTitle: document.querySelector("#editor-title")?.textContent,
    name: document.querySelector("#palette-name")?.textContent,
    status: document.querySelector("#editor-status")?.textContent,
    statusState: document.querySelector("#editor-status")?.dataset.state,
    textLength: document.querySelector("#palette-json")?.value.length,
    disabled: document.querySelector("#palette-json")?.disabled,
    lineNumbers: document.querySelectorAll("#line-numbers span").length,
  }))()`,
  editorToggleEasyJson: `(() => { document.querySelector("#easy-json-toggle").click(); return { label: document.querySelector(".editor-meta > span").textContent, start: document.querySelector("#palette-json").value.slice(0, 40) }; })()`,
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
