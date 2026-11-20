// Loads the repository as an unpacked extension into installed Chrome via the
// DevTools protocol (Extensions.loadUnpacked over --remote-debugging-pipe) and
// runs functional checks. See README.md in this folder.
import { spawn } from "node:child_process";
import { startServer, PROBES, sleep } from "./pages.mjs";
import { REPO_ROOT, browserPath, makeTempDir, cleanupTempDirs, reportResults } from "./config.mjs";

const extensionDir = process.argv[2] || REPO_ROOT;
const chromeExe = browserPath("chrome");
const profileDir = makeTempDir("chrome-profile");

const chrome = spawn(
  chromeExe,
  [
    "--remote-debugging-pipe",
    "--enable-unsafe-extension-debugging",
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate,OptimizationHints",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
);
const toChrome = chrome.stdio[3];
const fromChrome = chrome.stdio[4];

let nextId = 1;
const pending = new Map();
const listeners = [];
let buffer = "";
fromChrome.on("data", (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf("\0")) >= 0) {
    const message = JSON.parse(buffer.slice(0, index));
    buffer = buffer.slice(index + 1);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    } else {
      listeners.forEach((listener) => listener(message));
    }
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  toChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => pending.has(id) && reject(new Error(`timeout ${method}`)), 30000);
  });
}

const problems = [];
const sessionLabels = new Map();
listeners.push((message) => {
  const label = sessionLabels.get(message.sessionId) || message.sessionId;
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    problems.push(`[${label}] exception: ${details.exception?.description || details.text}`);
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params.type)) {
    problems.push(`[${label}] console.${message.params.type}: ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
  }
  if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
    problems.push(`[${label}] log ${message.params.entry.level} (${message.params.entry.source}): ${message.params.entry.text} ${message.params.entry.url || ""}`);
  }
});

async function attach(targetId, label) {
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  sessionLabels.set(sessionId, label);
  await send("Runtime.enable", {}, sessionId);
  await send("Log.enable", {}, sessionId).catch(() => {});
  await send("Page.enable", {}, sessionId).catch(() => {});
  return sessionId;
}

async function evaluate(sessionId, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function openTab(url, label) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const sessionId = await attach(targetId, label);
  await send("Page.navigate", { url }, sessionId);
  return { targetId, sessionId };
}

async function waitFor(sessionId, expression, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    try {
      value = await evaluate(sessionId, expression);
      if (predicate(value)) return value;
    } catch (error) {
      value = `error: ${error.message}`;
    }
    await sleep(150);
  }
  return value;
}

const results = [];
function check(name, ok, details) {
  results.push({ name, ok: Boolean(ok), details });
}

const { server, origin } = await startServer();
try {
  await sleep(1500);
  const version = await send("Browser.getVersion");
  console.log("Browser:", version.product);

  const { id: extensionId } = await send("Extensions.loadUnpacked", { path: extensionDir });
  console.log("Extension id:", extensionId);
  check("Extension loads unpacked (manifest accepted)", extensionId, extensionId);

  // Background service worker
  await send("Target.setDiscoverTargets", { discover: true });
  let worker;
  for (let attempt = 0; attempt < 40 && !worker; attempt += 1) {
    const { targetInfos } = await send("Target.getTargets");
    worker = targetInfos.find((target) => target.type === "service_worker" && target.url.includes(extensionId));
    if (!worker) await sleep(250);
  }
  check("Background module service worker starts", worker, worker?.url);
  if (worker) {
    const swSession = await attach(worker.targetId, "service-worker");
    const swInfo = await evaluate(swSession, "({ isModule: typeof importScripts === 'function' ? 'importScripts present' : 'n/a', hasListeners: chrome.runtime.onMessage.hasListeners(), alarms: 0 })");
    const alarms = await evaluate(swSession, "chrome.alarms.getAll().then((a) => a.map((x) => x.name))");
    check("Service worker registered listeners", swInfo.hasListeners, { ...swInfo, alarms });
  }

  // Plain page
  const plain = await openTab(`${origin}/plain`, "plain-page");
  const plainState = await waitFor(plain.sessionId, PROBES.hostState, (state) => state?.visibility === "visible" && state.chipCount > 0);
  check("Plain page: content.js imports modules and mounts tagger", plainState?.visibility === "visible" && plainState.window, plainState);
  check("Plain page: tagger.css + theme CSS injected in shadow root", plainState?.styleCount >= 2 && plainState.themeStyleBytes > 0, { styles: plainState?.styleCount, themeBytes: plainState?.themeStyleBytes, bg: plainState?.windowBg, position: plainState?.windowPosition });
  check("Plain page: default packs loaded and chips rendered", plainState?.packOptions?.length >= 2 && plainState.chipCount > 0, plainState?.packOptions);
  check("Plain page: first visit starts hidden with edge handle", plainState?.windowHidden === true && plainState.showButtonVisible === true, plainState);

  check("Initial view state (Settings hidden, AI 'Add all' hidden, moved styles apply)", plainState?.sitesViewDisplay === "none" && plainState.addAllAiDisplay === "none" && plainState.placeholderFont === "11px" && plainState.tabsMargin === "10px", plainState);
  await evaluate(plain.sessionId, PROBES.showTagger);
  await sleep(300);
  const chip = await evaluate(plain.sessionId, PROBES.clickFirstChip);
  check("Palette chip toggles tag into page field + counter", chip.field.includes(chip.tag) && chip.counter === "Tags: 1" && chip.chipActive, chip);
  await evaluate(plain.sessionId, PROBES.typeIntoField);
  await sleep(200);
  const counter = await evaluate(plain.sessionId, PROBES.counter);
  check("Tag counter follows direct edits of page field", counter === "Tags: 3", counter);

  const search = await evaluate(plain.sessionId, `(async () => { const r = ${PROBES.typeToSearch}; return r; })()`);
  check("Type-to-search outside inputs", search.query === "hair" && search.results > 0 && search.highlighted === 1, search);

  await evaluate(plain.sessionId, PROBES.analyze);
  const aiStatus = await waitFor(plain.sessionId, PROBES.aiStatus, (text) => /Analysis failed|Fetched/.test(text), 20000);
  check("AI analyze round-trips through background (ComfyUI offline → clear error)", /Analysis failed: Could not connect to ComfyUI/.test(aiStatus), aiStatus);

  await evaluate(plain.sessionId, PROBES.clickAbout);
  let aboutTab;
  for (let attempt = 0; attempt < 30 && !aboutTab; attempt += 1) {
    await sleep(200);
    aboutTab = (await send("Target.getTargets")).targetInfos.find((target) => target.url.endsWith("/pages/about.html"));
  }
  check("About button: background opens about.html tab", aboutTab, aboutTab?.url);

  const settings = await evaluate(plain.sessionId, PROBES.settingsTab);
  check("Settings tab renders profile + blacklist", settings.profile === ".*" && /excluded/.test(settings.blacklist), settings);

  const dock = await evaluate(plain.sessionId, PROBES.dock);
  await sleep(300);
  const dockMargin = await evaluate(plain.sessionId, "document.body.style.marginRight");
  check("Dock: docks right and reserves body margin", dock.docked && dock.edgeClass === "docked-right" && parseInt(dockMargin) > 0, { ...dock, dockMargin });

  await sleep(500);
  await send("Page.reload", {}, plain.sessionId);
  const reloaded = await waitFor(plain.sessionId, PROBES.layoutAfterReload, (state) => state && state.docked);
  check("Per-origin layout persists across reload (visible + docked)", reloaded?.hidden === false && reloaded.docked && parseInt(reloaded.bodyMarginRight) > 0, reloaded);

  // Strict CSP page
  const csp = await openTab(`${origin}/csp`, "csp-page");
  const cspState = await waitFor(csp.sessionId, PROBES.hostState, (state) => state?.visibility === "visible" && state.chipCount > 0);
  check("Strict CSP page: modules load and tagger mounts", cspState?.visibility === "visible" && cspState.window && cspState.chipCount > 0, cspState);
  check("Strict CSP page: shadow-root styles apply", cspState?.styleCount >= 2 && cspState.windowPosition === "fixed", { styles: cspState?.styleCount, position: cspState?.windowPosition, bg: cspState?.windowBg });
  check("Strict CSP page: theme CSS + template styles match plain page", cspState?.themeClass === plainState?.themeClass && cspState.windowBg === plainState.windowBg && cspState.sitesViewDisplay === "none" && cspState.addAllAiDisplay === "none" && cspState.placeholderFont === "11px", { csp: cspState, plain: { tabBg: plainState?.tabBg, windowBg: plainState?.windowBg } });

  // Popup page
  const popup = await openTab(`chrome-extension://${extensionId}/pages/extension-popup.html`, "popup");
  const popupState = await waitFor(popup.sessionId, PROBES.popupState, (state) => state && !/Checking/.test(state.updateStatus));
  check("Popup module loads; background answers check_updates", popupState && !/Could not contact/.test(popupState.updateStatus), popupState);

  await evaluate(popup.sessionId, PROBES.clickGlobalToggle);
  const hiddenDisplay = await waitFor(plain.sessionId, PROBES.hostDisplay, (display) => display === "none");
  const marginWhileHidden = await evaluate(plain.sessionId, "document.body.style.marginRight");
  check("Global toggle off hides tagger live in other tab + restores margin", hiddenDisplay === "none" && marginWhileHidden === "", { hiddenDisplay, marginWhileHidden });
  await evaluate(popup.sessionId, PROBES.clickGlobalToggle);
  const shownDisplay = await waitFor(plain.sessionId, PROBES.hostDisplay, (display) => display === "");
  check("Global toggle on shows tagger again", shownDisplay === "", shownDisplay);

  // Editor modes
  const editorUrl = (query) => `chrome-extension://${extensionId}/pages/palette-editor.html?${query}`;
  const palette = await openTab(editorUrl("packId=default-character"), "editor-palette");
  const paletteState = await waitFor(palette.sessionId, PROBES.editorState, (state) => state?.status === "Ready");
  check("Editor: palette mode loads pack", paletteState?.status === "Ready" && paletteState.textLength > 100 && paletteState.lineNumbers > 5, paletteState);
  const easy = await evaluate(palette.sessionId, PROBES.editorToggleEasyJson);
  check("Editor: easyJson toggle converts", easy.label === "EASYJSON" && !easy.start.startsWith("{"), easy);

  const sites = await openTab(editorUrl("mode=site-configs"), "editor-sites");
  const sitesState = await waitFor(sites.sessionId, PROBES.editorState, (state) => state?.status === "Ready");
  check("Editor: site-configs mode loads", sitesState?.status === "Ready" && sitesState.editorTitle === "Settings editor", sitesState);

  const blacklist = await openTab(editorUrl("mode=ai-blacklist"), "editor-blacklist");
  const blacklistState = await waitFor(blacklist.sessionId, PROBES.editorState, (state) => state?.status === "Ready");
  check("Editor: ai-blacklist mode loads", blacklistState?.status === "Ready" && /excluded tags/.test(blacklistState.name), blacklistState);

  const builtin = await openTab(editorUrl("packId=builtin-import"), "editor-builtin-import");
  const builtinState = await waitFor(builtin.sessionId, PROBES.editorState, (state) => state?.statusState === "error" || state?.status === "Ready");
  check("Editor: missing data/import.json fails gracefully", builtinState?.statusState === "error" && /no longer bundled/.test(builtinState.status) && builtinState.disabled === true, builtinState);

  await sleep(500);
} catch (error) {
  check("Harness completed", false, error.stack);
} finally {
  const exitCode = reportResults("Chrome", results, "Console errors/warnings & exceptions", problems);
  chrome.kill();
  server.close();
  await sleep(1000);
  cleanupTempDirs();
  process.exit(exitCode);
}
