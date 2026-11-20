// Assets tab (File Hub) checks shared by chrome.mjs and firefox.mjs, against
// the mock hub in pages.mjs (the test copies point FILE_HUB_BASE_URL at it).
import { hubState, sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const ASSETS_STATE = `(() => {
  const root = ${ROOT};
  const view = root.querySelector("#lm-view-assets");
  const tabs = root.querySelector("#lm-main-tabs");
  const status = root.querySelector("#lm-assets-status");
  return {
    display: view.style.display,
    status: status.hidden ? "" : status.textContent,
    statusState: status.dataset.state || "",
    cards: [...root.querySelectorAll("#lm-assets-list .lazymod-asset-card")].map((card) => {
      const action = card.querySelector(".lazymod-asset-action");
      const result = card.querySelector(".lazymod-asset-result");
      return { id: card.dataset.packageId, status: card.dataset.status, action: action.textContent, disabled: action.disabled, result: result?.textContent || "", resultState: result?.dataset.state || "" };
    }),
    // The pack switcher list is rendered even while its panel is closed.
    packs: [...root.querySelectorAll("#lm-pack-list .lazymod-pack-item-name")].map((name) => name.textContent),
    activePack: root.querySelector("#lm-pack-current").textContent,
    chips: [...root.querySelectorAll("#lm-user-chips .lazymod-chip")].map((chip) => chip.dataset.tag || chip.textContent.trim()),
    tabOrder: [...tabs.querySelectorAll(".lazymod-tab")].map((tab) => tab.id),
    tabsOverflow: tabs.scrollWidth > tabs.clientWidth + 1,
    viewOverflow: view.scrollWidth > view.clientWidth + 1,
  };
})()`;

const OPEN_ASSETS = `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  root.querySelector("#lm-tab-btn-assets").click();
  return true;
})()`;
const clickAction = (id) => `(() => { ${ROOT}.querySelector('#lm-assets-list [data-package-id="${id}"] .lazymod-asset-action').click(); return true; })()`;
const setControl = (selector, value, type) =>
  `(() => { const control = ${ROOT}.querySelector(${JSON.stringify(selector)}); control.value = ${JSON.stringify(value)}; control.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true })); return true; })()`;
const CLICK_REFRESH = `(() => { ${ROOT}.querySelector("#lm-assets-refresh").click(); return true; })()`;

const ids = (state) => state.cards.map((card) => card.id);
const card = (state, id) => state.cards.find((item) => item.id === id) || {};

async function install(evaluate, page, id) {
  await evaluate(page, clickAction(id));
  return waitFor(evaluate, page, ASSETS_STATE, (state) => Boolean(card(state, id).result) && !/Installing/.test(card(state, id).action), 15000);
}

export async function runAssetsChecks({ open, evaluate, check, origin }) {
  const page = await open(`${origin}/plain`);
  await waitFor(evaluate, page, READY, Boolean, 10000);
  await sleep(300);
  const requestsBeforeOpen = hubState.catalogueRequests;

  await evaluate(page, OPEN_ASSETS);
  const listed = await waitFor(evaluate, page, ASSETS_STATE, (state) => state.cards.length > 0, 10000);
  check(
    "Assets: tab sits right after Settings; nothing is requested from File Hub until it is opened",
    requestsBeforeOpen === 0 && hubState.catalogueRequests === 1 && listed.display === "block" && listed.tabOrder.indexOf("lm-tab-btn-assets") === listed.tabOrder.indexOf("lm-tab-btn-sites") + 1 && !listed.tabsOverflow,
    { requestsBeforeOpen, requests: hubState.catalogueRequests, tabOrder: listed.tabOrder, tabsOverflow: listed.tabsOverflow },
  );
  check(
    "Assets: catalogue lists QuickTag packages only (other apps and invalid ids dropped), newest update first",
    // "good" was updated last; the rest share a date and fall back to name order.
    ids(listed).join(" ") === "good fallback toobig proto tampered zipped" && !listed.viewOverflow,
    { ids: ids(listed), viewOverflow: listed.viewOverflow },
  );
  check("Assets: ZIP packages are shown as not supported", card(listed, "zipped").action === "Not supported" && card(listed, "zipped").disabled, card(listed, "zipped"));

  // Search (name, author, description), category, sort.
  await evaluate(page, setControl("#lm-assets-search", "alice", "input"));
  const byAuthor = ids(await evaluate(page, ASSETS_STATE));
  await evaluate(page, setControl("#lm-assets-search", "endpoint fails", "input"));
  const byDescription = ids(await evaluate(page, ASSETS_STATE));
  await evaluate(page, setControl("#lm-assets-search", "tampered", "input"));
  const byName = ids(await evaluate(page, ASSETS_STATE));
  await evaluate(page, setControl("#lm-assets-search", "no-such-package", "input"));
  const none = await evaluate(page, ASSETS_STATE);
  await evaluate(page, setControl("#lm-assets-search", "", "input"));
  check(
    "Assets: search filters by author, description, and name, with an empty-results message",
    byAuthor.join() === "good" && byDescription.join() === "fallback" && byName.join() === "tampered" && none.cards.length === 0 && /No packages match/.test(none.status),
    { byAuthor, byDescription, byName, none: none.status },
  );
  await evaluate(page, setControl("#lm-assets-category", "themes", "change"));
  const themes = ids(await evaluate(page, ASSETS_STATE));
  await evaluate(page, setControl("#lm-assets-category", "", "change"));
  await evaluate(page, setControl("#lm-assets-sort", "downloads", "change"));
  const byDownloads = ids(await evaluate(page, ASSETS_STATE));
  await evaluate(page, setControl("#lm-assets-sort", "name", "change"));
  const byNameSort = ids(await evaluate(page, ASSETS_STATE));
  await evaluate(page, setControl("#lm-assets-sort", "updated", "change"));
  check(
    "Assets: category filter and sorting (most downloaded, name)",
    themes.join() === "zipped" && byDownloads[0] === "fallback" && byDownloads[1] === "good" && byNameSort.join(" ") === "fallback toobig good proto tampered zipped",
    { themes, byDownloads, byNameSort },
  );

  // Installs.
  const good = await install(evaluate, page, "good");
  check(
    "Assets: Install downloads through the hub endpoint, verifies SHA-256, adds and selects the pack",
    card(good, "good").status === "installed" &&
      card(good, "good").disabled &&
      /SHA-256 checksum verified/.test(card(good, "good").result) &&
      good.activePack === "Mock Hub Pack" &&
      good.chips.includes("hub_tag_one"),
    { card: card(good, "good"), activePack: good.activePack, chips: good.chips },
  );
  const fallback = await install(evaluate, page, "fallback");
  check("Assets: falls back to downloadUrl when the hub download endpoint fails", card(fallback, "fallback").status === "installed" && fallback.packs.includes("Fallback Pack"), card(fallback, "fallback"));

  const tampered = await install(evaluate, page, "tampered");
  const proto = await install(evaluate, page, "proto");
  const huge = await install(evaluate, page, "toobig");
  check(
    "Assets: rejects a checksum mismatch, unsafe keys (__proto__), and files over the size limit",
    /SHA-256/.test(card(tampered, "tampered").result) &&
      /unsafe keys/.test(card(proto, "proto").result) &&
      /limit/.test(card(huge, "toobig").result) &&
      [card(tampered, "tampered"), card(proto, "proto"), card(huge, "toobig")].every((item) => item.resultState === "error" && item.status === "available") &&
      !huge.packs.some((name) => /Tampered|Proto|Huge/.test(name)),
    { tampered: card(tampered, "tampered").result, proto: card(proto, "proto").result, huge: card(huge, "toobig").result, packs: huge.packs },
  );

  // Update to a newer version (two-step confirm, replaces the pack).
  hubState.goodVersion = "1.1.0";
  await evaluate(page, CLICK_REFRESH);
  const updatable = await waitFor(evaluate, page, ASSETS_STATE, (state) => card(state, "good").status === "update", 10000);
  await evaluate(page, clickAction("good"));
  const confirming = await evaluate(page, ASSETS_STATE);
  const updated = await install(evaluate, page, "good");
  check(
    "Assets: a newer version shows Update, asks once more, then replaces the installed pack",
    card(updatable, "good").action === "Update to 1.1.0" &&
      card(confirming, "good").action === "Confirm update" &&
      card(updated, "good").status === "installed" &&
      updated.chips.includes("hub_tag_three") &&
      updated.packs.filter((name) => name === "Mock Hub Pack").length === 1,
    { before: card(updatable, "good").action, confirming: card(confirming, "good").action, after: card(updated, "good"), packs: updated.packs },
  );

  // Errors keep the list; install states persist across pages.
  hubState.failCatalogue = true;
  await evaluate(page, CLICK_REFRESH);
  const failed = await waitFor(evaluate, page, ASSETS_STATE, (state) => state.statusState === "error", 10000);
  hubState.failCatalogue = false;
  check("Assets: an API error shows a clear message and keeps the last list", /HTTP error 503/.test(failed.status) && failed.cards.length === 6, { status: failed.status, cards: failed.cards.length });

  const csp = await open(`${origin}/csp`);
  await waitFor(evaluate, csp, READY, Boolean, 10000);
  await evaluate(csp, OPEN_ASSETS);
  const cspState = await waitFor(evaluate, csp, ASSETS_STATE, (state) => state.cards.length > 0, 10000);
  check(
    "Assets on a strict-CSP page: catalogue loads through the background, installed states persist",
    card(cspState, "good").status === "installed" && card(cspState, "fallback").status === "installed" && card(cspState, "tampered").status === "available",
    cspState.cards.map((item) => `${item.id}:${item.status}`),
  );
}
