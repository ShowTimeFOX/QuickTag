// About page checks (What's new section and its demos), shared by chrome.mjs
// and firefox.mjs. `openAbout()` opens pages/about.html and returns a handle.
import { sleep } from "./pages.mjs";
import { waitFor } from "./checks.mjs";

const ABOUT_STATE = `(() => {
  const nav = [...document.querySelectorAll(".page-nav a")].map((link) => link.getAttribute("href"));
  return {
    ready: Boolean(document.querySelector("#demo-pack-list .demo-pack")),
    nav,
    navTargetsExist: nav.every((href) => href.startsWith("#") && Boolean(document.getElementById(href.slice(1)))),
    whatsNewFirst: document.querySelector("main > section")?.id,
    showcases: [...document.querySelectorAll(".showcase h3")].map((heading) => heading.textContent),
    cards: [...document.querySelectorAll(".feature-grid .card h3")].map((heading) => heading.textContent),
    outdated: /starter palette is protected/.test(document.body.textContent),
  };
})()`;
const PACK_DEMO = `(() => {
  const list = document.getElementById("demo-pack-list");
  const ghost = document.getElementById("demo-pack-ghost");
  return {
    rows: [...list.querySelectorAll(".demo-pack")].map((row) => row.querySelector(".demo-pack-name").textContent + (row.querySelector(".demo-pack-match") ? " [" + row.querySelector(".demo-pack-match").textContent + "]" : "")),
    scrolling: list.classList.contains("is-ghost-scrolling"),
    ghostVisible: ghost.dataset.visible,
    ghostName: ghost.querySelector(".demo-ghost-name")?.textContent || "",
    centered: list.querySelector(".is-centered .demo-pack-name")?.textContent || "",
    status: document.getElementById("demo-pack-status").textContent,
  };
})()`;
const demoSearch = (value) =>
  `(() => { const input = document.getElementById("demo-pack-search"); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
const FOCUS_DEMO = `(() => {
  const grid = document.getElementById("demo-focus-grid");
  return { areas: grid.style.gridTemplateAreas, columns: grid.style.gridTemplateColumns, scale: grid.style.getPropertyValue("--demo-scale"), status: document.getElementById("demo-focus-status").textContent };
})()`;
const clickFocus = (action) => `(() => { document.querySelector('#showcase-focus [data-action="${action}"]').click(); return true; })()`;
const ASSET_DEMO = `(() => ({
  contentsHidden: document.getElementById("demo-asset-contents").hidden,
  contents: document.getElementById("demo-asset-contents").textContent,
  install: document.getElementById("demo-asset-install").textContent,
  installDisabled: document.getElementById("demo-asset-install").disabled,
  uninstallHidden: document.getElementById("demo-asset-uninstall").hidden,
  status: document.getElementById("demo-asset-status").textContent,
  hasUndo: Boolean(document.querySelector("#demo-asset-status button")),
}))()`;
const clickId = (id) => `(() => { document.getElementById(${JSON.stringify(id)}).click(); return true; })()`;

export async function runAboutChecks({ openAbout, evaluate, check }) {
  const page = await openAbout();
  const about = await waitFor(evaluate, page, ABOUT_STATE, (state) => state?.ready, 10000);
  check(
    "About: What's new comes first and lists the v1.2 features; navigation links resolve; feature cards updated",
    about.ready &&
      about.whatsNewFirst === "whats-new" &&
      about.nav[0] === "#whats-new" &&
      about.navTargetsExist &&
      about.showcases.length === 3 &&
      ["Pack switcher", "Assets · File Hub"].every((title) => about.cards.includes(title)) &&
      !about.outdated,
    about,
  );

  // Pack switcher demo: deep search and ghost scroll (shared/ghost-scroll.js).
  await evaluate(page, demoSearch("wolf"));
  const byTag = await evaluate(page, PACK_DEMO);
  await evaluate(page, demoSearch("lighting"));
  const byName = await evaluate(page, PACK_DEMO);
  await evaluate(page, demoSearch(""));
  await evaluate(page, `(() => { const list = document.getElementById("demo-pack-list"); list.scrollTop = (list.scrollHeight - list.clientHeight) / 2; return true; })()`);
  await sleep(200);
  const scrolling = await evaluate(page, PACK_DEMO);
  await sleep(900);
  const idle = await evaluate(page, PACK_DEMO);
  check(
    "About demo (pack switcher): searches tags and names; ghost scroll names the centered pack, then fades",
    byTag.rows.join() === "Anthro & Fursuit Pack [tag: wolf]" &&
      byName.rows[0] === "Lighting Essentials" &&
      scrolling.scrolling &&
      scrolling.ghostVisible === "true" &&
      Boolean(scrolling.ghostName) &&
      scrolling.ghostName === scrolling.centered &&
      !idle.scrolling &&
      idle.ghostVisible === "false",
    { byTag: byTag.rows, byName: byName.rows, scrolling, idle },
  );

  // Focus Mode demo: the real layout transforms and a scale preview.
  const initial = await evaluate(page, FOCUS_DEMO);
  await evaluate(page, clickFocus("swap"));
  const swapped = await evaluate(page, FOCUS_DEMO);
  await evaluate(page, clickFocus("wider"));
  const wider = await evaluate(page, FOCUS_DEMO);
  await evaluate(page, `(() => { const input = document.getElementById("demo-focus-scale"); input.value = "1.5"; input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const scaled = await evaluate(page, FOCUS_DEMO);
  await evaluate(page, clickFocus("reset"));
  const reset = await evaluate(page, FOCUS_DEMO);
  check(
    "About demo (Focus Mode): swap and resize use the layout transforms; scale preview; reset",
    /"image palette"/.test(initial.areas) &&
      /"palette image"/.test(swapped.areas) &&
      /3\.75fr/.test(wider.columns) &&
      /columns:/.test(wider.status) &&
      scaled.scale === "1.5" &&
      reset.areas === initial.areas &&
      reset.columns === initial.columns,
    { initial, swapped, wider, scaled: scaled.scale, reset },
  );

  // Assets demo: preview, install, uninstall with undo (no storage involved).
  await evaluate(page, clickId("demo-asset-preview"));
  const preview = await evaluate(page, ASSET_DEMO);
  await evaluate(page, clickId("demo-asset-install"));
  const installed = await evaluate(page, ASSET_DEMO);
  await evaluate(page, clickId("demo-asset-uninstall"));
  const uninstalled = await evaluate(page, ASSET_DEMO);
  await evaluate(page, `(() => { document.querySelector("#demo-asset-status button").click(); return true; })()`);
  const restored = await evaluate(page, ASSET_DEMO);
  check(
    "About demo (Assets): Preview lists the contents; Install, then Uninstall with Undo",
    !preview.contentsHidden &&
      /2 groups · 3 categories · 14 tags/.test(preview.contents) &&
      /Sky › Weather \(5\)/.test(preview.contents) &&
      installed.install === "Installed" &&
      installed.installDisabled &&
      !installed.uninstallHidden &&
      uninstalled.install === "Install" &&
      uninstalled.hasUndo &&
      restored.install === "Installed" &&
      /Restored/.test(restored.status),
    { preview: preview.contents.slice(0, 120), installed, uninstalled, restored },
  );
}
