// Local test server (plain page + strict-CSP page) and the probe expressions
// both runners evaluate in pages.
import http from "node:http";

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const PAGE = (title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body><h1>${title}</h1><textarea id="tags" rows="3" cols="60"></textarea><br><img id="image" src="/img.png" width="200" height="200"></body></html>`;

export const STRICT_CSP = "default-src 'none'; img-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'";

export function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/img.png")) {
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(PNG);
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
      packOptions: root ? [...root.querySelectorAll("#lm-pack-select option")].map((o) => o.textContent) : [],
      badge: root?.querySelector("#lm-active-badge")?.textContent,
      windowBg: win ? getComputedStyle(win).backgroundColor : null,
      windowPosition: win ? getComputedStyle(win).position : null,
      themeClass: win ? [...win.classList].find((c) => c.startsWith("theme-")) : null,
      tabBg: root?.querySelector("#lm-tab-btn-main") ? getComputedStyle(root.querySelector("#lm-tab-btn-main")).backgroundColor : null,
      sitesViewDisplay: root?.querySelector("#lm-view-sites") ? getComputedStyle(root.querySelector("#lm-view-sites")).display : null,
      addAllAiDisplay: root?.querySelector("#lm-add-all-ai") ? getComputedStyle(root.querySelector("#lm-add-all-ai")).display : null,
      placeholderFont: root?.querySelector(".lazymod-ai-placeholder") ? getComputedStyle(root.querySelector(".lazymod-ai-placeholder")).fontSize : null,
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
  aiStatus: `document.getElementById("quicktag-extension-root").shadowRoot.querySelector("#lm-ai-status").textContent`,
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
