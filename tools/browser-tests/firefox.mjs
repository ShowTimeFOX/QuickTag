// Installs a temporary copy of the extension as a temporary add-on in
// installed Firefox via WebDriver BiDi (webExtension.install) and runs the
// same functional checks. See README.md in this folder.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { startServer, PROBES, sleep } from "./pages.mjs";
import { browserPath, makeTempDir, cleanupTempDirs, createTestCopy, reportResults } from "./config.mjs";
import { runLayoutFixChecks } from "./checks.mjs";
import { runFocusModeChecks } from "./focus-checks.mjs";
import { runAssetsChecks } from "./assets-checks.mjs";
import { runPackBrowserChecks } from "./pack-checks.mjs";
import { runAboutChecks } from "./about-checks.mjs";
import { runSettingsChecks, runPermissionPageChecks } from "./settings-checks.mjs";
import { runPaletteChecks } from "./palette-checks.mjs";
import { runTitleBarChecks } from "./titlebar-checks.mjs";

const firefoxExe = browserPath("firefox");
const profileDir = makeTempDir("firefox-profile");
const GECKO_ID = "quicktag@lazymod.app";
const UUID = "0b8a2c4e-1111-4a5b-9c3d-123456789abc";
const PORT = 9333;

fs.writeFileSync(
  path.join(profileDir, "user.js"),
  [
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [GECKO_ID]: UUID }))});`,
    `user_pref("devtools.console.stdout.content", true);`,
    `user_pref("devtools.console.stdout.chrome", true);`,
    `user_pref("browser.shell.checkDefaultBrowser", false);`,
    `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
    `user_pref("browser.aboutwelcome.enabled", false);`,
    `user_pref("app.update.disabledForTesting", true);`,
  ].join("\n"),
);

const firefox = spawn(firefoxExe, ["-headless", "-no-remote", "-profile", profileDir, "--remote-debugging-port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" } });
const firefoxOutput = [];
const collect = (chunk) => firefoxOutput.push(...chunk.toString().split(/\r?\n/));
firefox.stdout.on("data", collect);
firefox.stderr.on("data", collect);

let socket;
for (let attempt = 0; attempt < 60 && !socket; attempt += 1) {
  await sleep(500);
  try {
    socket = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
      ws.onopen = () => resolve(ws);
      ws.onerror = reject;
    });
  } catch {}
}
if (!socket) throw new Error("Could not connect to Firefox BiDi");

let nextId = 1;
const pending = new Map();
const logEntries = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.type === "error" ? reject(new Error(`${message.error}: ${message.message}`)) : resolve(message.result);
  } else if (message.method === "log.entryAdded") {
    const entry = message.params;
    if (["error", "warn"].includes(entry.level)) logEntries.push(`[${entry.source?.context?.slice(0, 6) || "?"}] ${entry.level}: ${entry.text}`);
  }
};
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => pending.has(id) && reject(new Error(`timeout ${method}`)), 30000);
  });
}

async function evaluate(context, expression) {
  const result = await send("script.evaluate", {
    expression: `(async () => JSON.stringify(await (${expression})))()`,
    target: { context },
    awaitPromise: true,
  });
  if (result.type === "exception") throw new Error(result.exceptionDetails.text);
  return result.result.value === undefined ? undefined : JSON.parse(result.result.value);
}
async function openTab(url) {
  const { context } = await send("browsingContext.create", { type: "tab" });
  await send("browsingContext.navigate", { context, url, wait: "complete" });
  return context;
}
async function waitFor(context, expression, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    try {
      value = await evaluate(context, expression);
      if (predicate(value)) return value;
    } catch (error) {
      value = `error: ${error.message}`;
    }
    await sleep(150);
  }
  return value;
}

const results = [];
const check = (name, ok, details) => results.push({ name, ok: Boolean(ok), details });
const { server, origin } = await startServer();
// An explicit directory argument is loaded as is (its File Hub is not mocked).
const extensionDir = process.argv[2] || createTestCopy({ label: "firefox", hubBaseUrl: `${origin}/hub/`, exposePages: true });

try {
  const session = await send("session.new", { capabilities: {} });
  console.log("Browser:", session.capabilities.browserName, session.capabilities.browserVersion);
  await send("session.subscribe", { events: ["log.entryAdded"] });

  const installed = await send("webExtension.install", { extensionData: { type: "path", path: extensionDir } });
  check("Temporary add-on installs (manifest accepted)", installed.extension === GECKO_ID, installed);
  const base = `moz-extension://${UUID}`;
  await sleep(1500);

  const plain = await openTab(`${origin}/plain`);
  const plainState = await waitFor(plain, PROBES.hostState, (state) => state?.visibility === "visible" && state.chipCount > 0, 10000);
  check("Plain page: content.js imports modules and mounts tagger", plainState?.visibility === "visible" && plainState.window, plainState);
  check("Plain page: tagger.css + theme CSS injected in shadow root", plainState?.styleCount >= 2 && plainState.themeStyleBytes > 0 && plainState.windowPosition === "fixed", plainState);
  check("Plain page: default packs loaded and chips rendered", plainState?.packOptions?.length >= 2 && plainState.chipCount > 0, plainState?.packOptions);
  check("Plain page: first visit starts hidden with edge handle", plainState?.windowHidden === true && plainState.showButtonVisible === true, plainState);

  check("Initial view state (Settings hidden, AI button in the palette, no AI group before analysis, moved styles apply)", plainState?.sitesViewDisplay === "none" && plainState.mainViewDisplay === "flex" && plainState.aiButton === "AI" && plainState.noAiGroup && plainState.tabsMargin === "10px", plainState);
  if (plainState?.window) {
    await evaluate(plain, PROBES.showTagger);
    await sleep(300);
    const chip = await evaluate(plain, PROBES.clickFirstChip);
    check("Palette chip toggles tag into page field + counter", chip.field.includes(chip.tag) && chip.counter === "Tags: 1" && chip.chipActive, chip);
    await evaluate(plain, PROBES.typeIntoField);
    await sleep(200);
    const counter = await evaluate(plain, PROBES.counter);
    check("Tag counter follows direct edits of page field", counter === "Tags: 3", counter);
    const search = await evaluate(plain, PROBES.typeToSearch);
    check("Type-to-search outside inputs", search.query === "hair" && search.results > 0 && search.highlighted === 1, search);
    await evaluate(plain, PROBES.analyze);
    const aiStatus = await waitFor(plain, PROBES.aiStatus, (text) => /Analysis failed|Fetched/.test(text), 20000);
    check("AI analyze round-trips through background script (ComfyUI offline → clear error)", /Analysis failed: Could not connect to ComfyUI/.test(aiStatus), aiStatus);
    await evaluate(plain, PROBES.clickAbout);
    let aboutContext;
    for (let attempt = 0; attempt < 30 && !aboutContext; attempt += 1) {
      await sleep(200);
      aboutContext = (await send("browsingContext.getTree", {})).contexts.find((context) => context.url.endsWith("/pages/about.html"));
    }
    check("About button: background opens about.html tab", aboutContext, aboutContext?.url);
    const settings = await evaluate(plain, PROBES.settingsTab);
    check("Settings tab renders profile + blacklist", settings.profile === ".*" && /excluded/.test(settings.blacklist), settings);
    const dock = await evaluate(plain, PROBES.dock);
    await sleep(300);
    const dockMargin = await evaluate(plain, "document.body.style.marginRight");
    check("Dock: docks right and reserves body margin", dock.docked && dock.edgeClass === "docked-right" && parseInt(dockMargin) > 0, { ...dock, dockMargin });
    await sleep(500);
    await send("browsingContext.reload", { context: plain, wait: "complete" });
    const reloaded = await waitFor(plain, PROBES.layoutAfterReload, (state) => state && state.docked);
    check("Per-origin layout persists across reload (visible + docked)", reloaded?.hidden === false && reloaded.docked && parseInt(reloaded.bodyMarginRight) > 0, reloaded);
  }

  const csp = await openTab(`${origin}/csp`);
  const cspState = await waitFor(csp, PROBES.hostState, (state) => state?.visibility === "visible" && state.chipCount > 0, 10000);
  check("Strict CSP page: modules load and tagger mounts", cspState?.visibility === "visible" && cspState.window && cspState.chipCount > 0, cspState);
  check("Strict CSP page: shadow-root styles apply", cspState?.styleCount >= 2 && cspState.windowPosition === "fixed", cspState);
  check("Strict CSP page: theme CSS + template styles match plain page", cspState?.themeClass === plainState?.themeClass && cspState.windowBg === plainState.windowBg && cspState.sitesViewDisplay === "none" && cspState.mainViewDisplay === "flex" && cspState.aiButton === "AI", { csp: cspState, plain: { tabBg: plainState?.tabBg, windowBg: plainState?.windowBg } });

  // Shared checks (checks.mjs)
  // Real (trusted) input through WebDriver BiDi, viewport coordinates.
  const perform = async (context, actions) => {
    await send("browsingContext.activate", { context });
    await send("input.performActions", { context, actions });
  };
  const pointer = {
    click: (context, x, y) =>
      perform(context, [
        {
          type: "pointer",
          id: "mouse",
          parameters: { pointerType: "mouse" },
          actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 }, { type: "pointerUp", button: 0 }],
        },
      ]),
    drag: (context, x1, y1, x2, y2) =>
      perform(context, [
        {
          type: "pointer",
          id: "mouse",
          parameters: { pointerType: "mouse" },
          actions: [
            { type: "pointerMove", x: Math.round(x1), y: Math.round(y1) },
            { type: "pointerDown", button: 0 },
            { type: "pointerMove", x: Math.round(x2), y: Math.round(y2), duration: 120 },
            { type: "pointerUp", button: 0 },
          ],
        },
      ]),
    move: (context, x, y) =>
      perform(context, [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }] }]),
    wheel: (context, x, y, deltaY) =>
      perform(context, [
        { type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }] },
        { type: "wheel", id: "wheel", actions: [{ type: "scroll", x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY }] },
      ]),
  };
  const adapters = { open: (url) => openTab(url), evaluate, pointer, check, origin };
  await runLayoutFixChecks(adapters);
  await runFocusModeChecks(adapters);
  await runAssetsChecks(adapters);
  await runPackBrowserChecks(adapters);
  await runSettingsChecks(adapters);
  await runPaletteChecks(adapters);
  await runTitleBarChecks(adapters);

  // BiDi refuses direct navigation to moz-extension:// URLs, so a web page
  // navigates there itself (the test copy exposes these pages as WAR).
  async function openExtensionPage(pagePath) {
    const context = await openTab(`${origin}/plain`);
    await send("script.evaluate", { expression: `location.href = ${JSON.stringify(base + "/" + pagePath)}`, target: { context }, awaitPromise: false });
    await sleep(800);
    return context;
  }
  const popup = await openExtensionPage("pages/extension-popup.html");
  const popupState = await waitFor(popup, PROBES.popupState, (state) => state && state.updateStatus && !/Checking/.test(state.updateStatus), 15000);
  check("Popup module loads; background answers check_updates", popupState && popupState.updateStatus && !/Could not contact/.test(popupState.updateStatus), popupState);

  await evaluate(popup, PROBES.clickGlobalToggle);
  const hiddenDisplay = await waitFor(plain, PROBES.hostDisplay, (display) => display === "none");
  const marginWhileHidden = await evaluate(plain, "document.body.style.marginRight");
  check("Global toggle off hides tagger live in other tab + restores margin", hiddenDisplay === "none" && marginWhileHidden === "", { hiddenDisplay, marginWhileHidden });
  await evaluate(popup, PROBES.clickGlobalToggle);
  const shownDisplay = await waitFor(plain, PROBES.hostDisplay, (display) => display === "");
  check("Global toggle on shows tagger again", shownDisplay === "", shownDisplay);

  await runPermissionPageChecks({
    openPage: (query) => openExtensionPage(`pages/permissions.html?${query}`),
    evaluate,
    clickAsUser: (context, expression) => send("script.evaluate", { expression, target: { context }, awaitPromise: false, userActivation: true }),
    check,
    origin,
    realGesture: false,
  });
  await runAboutChecks({ openAbout: () => openExtensionPage("pages/about.html"), openDocs: (hash = "") => openExtensionPage(`pages/docs.html${hash}`), evaluate, check });

  const editorUrl = (query) => `${base}/pages/palette-editor.html?${query}`;
  const palette = await openExtensionPage(`pages/palette-editor.html?packId=default-character`);
  const paletteState = await waitFor(palette, PROBES.editorState, (state) => state?.status === "Ready");
  check("Editor: palette mode loads pack", paletteState?.status === "Ready" && paletteState.textLength > 100 && paletteState.lineNumbers > 5, paletteState);
  const easy = await evaluate(palette, PROBES.editorToggleEasyJson);
  check("Editor: easyJson toggle converts", easy.label === "EASYJSON" && !easy.start.startsWith("{"), easy);
  const sites = await openExtensionPage("pages/palette-editor.html?mode=site-configs");
  const sitesState = await waitFor(sites, PROBES.editorState, (state) => state?.status === "Ready");
  check("Editor: site-configs mode loads", sitesState?.status === "Ready", sitesState);
  const blacklist = await openExtensionPage("pages/palette-editor.html?mode=ai-blacklist");
  const blacklistState = await waitFor(blacklist, PROBES.editorState, (state) => state?.status === "Ready");
  check("Editor: ai-blacklist mode loads", blacklistState?.status === "Ready", blacklistState);
  const builtin = await openExtensionPage("pages/palette-editor.html?packId=builtin-import");
  const builtinState = await waitFor(builtin, PROBES.editorState, (state) => state?.statusState === "error" || state?.status === "Ready");
  check("Editor: missing data/import.json fails gracefully", builtinState?.statusState === "error" && /no longer bundled/.test(builtinState.status) && builtinState.disabled === true, builtinState);
  await sleep(500);
} catch (error) {
  check("Harness completed", false, error.stack);
} finally {
  // Firefox's own stdout also carries browser-internal noise; keep only lines
  // that can come from the extension or a CSP report.
  const extensionLines = firefoxOutput.filter((line) => /QuickTag|quicktag|moz-extension|Content-Security|CSP/.test(line));
  const exitCode = reportResults("Firefox", results, "Console errors/warnings (BiDi log + Firefox stdout)", [...logEntries, ...new Set(extensionLines)]);
  try {
    await send("session.end");
  } catch {}
  firefox.kill();
  server.close();
  await sleep(1500);
  cleanupTempDirs();
  process.exit(exitCode);
}
