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
const CLICK_PREVIEW = (id) => `(() => { ${ROOT}.querySelector('#lm-assets-list [data-package-id="${id}"] .lazymod-asset-preview').click(); return true; })()`;
const PREVIEW_STATE = (id) => `(() => {
  const card = ${ROOT}.querySelector('#lm-assets-list [data-package-id="${id}"]');
  const block = card?.querySelector(".lazymod-asset-preview-block");
  return block ? { state: block.dataset.state, text: block.textContent, button: card.querySelector(".lazymod-asset-preview").getAttribute("aria-label") } : { state: "none", button: card?.querySelector(".lazymod-asset-preview")?.getAttribute("aria-label") };
})()`;
const POLISH_STATE = `(() => {
  const root = ${ROOT};
  // Label centering: the text box center vs. the button center.
  const site = root.querySelector("#lm-assets-site");
  const range = document.createRange();
  range.selectNodeContents(site);
  const text = range.getBoundingClientRect();
  const box = site.getBoundingClientRect();
  const hub = root.querySelector('#lm-assets-list [data-package-id="good"] .lazymod-asset-hub');
  const profiles = root.querySelector("#lm-edit-site-configs");
  const lineHeight = parseFloat(getComputedStyle(profiles).lineHeight) || 16;
  const rectOf = (element) => element.getBoundingClientRect();
  const center = (rect) => rect.top + rect.height / 2;
  // An icon-only control: an icon, no visible text, and a name for tooltips and screen readers.
  const iconOnly = (element) => ({
    icon: Boolean(element?.querySelector("svg")),
    text: element?.textContent.trim() || "",
    label: element?.getAttribute("aria-label") || "",
    title: element?.getAttribute("title") || "",
    width: Math.round(element ? rectOf(element).width : 0),
  });
  const profilesIcon = profiles.querySelector("svg");
  const profilesLabel = profiles.querySelector("span");
  const siteIcon = site.querySelector("svg");
  const siteText = site.querySelector("span");
  const preview = root.querySelector('#lm-assets-list [data-package-id="good"] .lazymod-asset-preview');
  const install = root.querySelector('#lm-assets-list [data-package-id="good"] .lazymod-asset-action');
  return {
    profilesIconLeft: Boolean(profilesIcon) && rectOf(profilesIcon).right <= rectOf(profilesLabel).left && Math.abs(center(rectOf(profilesIcon)) - center(rectOf(profilesLabel))) <= 2,
    profilesHeight: Math.round(rectOf(profiles).height),
    siteIconRight: Boolean(siteIcon) && rectOf(siteIcon).left >= rectOf(siteText).right && Math.abs(center(rectOf(siteIcon)) - center(rectOf(siteText))) <= 2,
    refresh: iconOnly(root.querySelector("#lm-assets-refresh")),
    headerHeights: [site, root.querySelector("#lm-assets-refresh")].map((element) => Math.round(rectOf(element).height)),
    hub: iconOnly(hub),
    preview: iconOnly(preview),
    installText: install?.textContent.trim(),
    siteLabel: site.textContent.trim(),
    dx: Math.abs(text.left + text.width / 2 - (box.left + box.width / 2)),
    dy: Math.abs(text.top + text.height / 2 - (box.top + box.height / 2)),
    hubHref: hub?.getAttribute("href"),
    hubTarget: hub?.getAttribute("target"),
    hubRel: hub?.getAttribute("rel"),
    profilesLabel: profiles.textContent.trim(),
    profilesLines: Math.round(profiles.querySelector("span").getBoundingClientRect().height / lineHeight),
  };
})()`;
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
    requestsBeforeOpen === 0 && hubState.catalogueRequests === 1 && listed.display !== "none" && listed.tabOrder.indexOf("lm-tab-btn-assets") === listed.tabOrder.indexOf("lm-tab-btn-sites") + 1 && !listed.tabsOverflow,
    { requestsBeforeOpen, requests: hubState.catalogueRequests, tabOrder: listed.tabOrder, tabsOverflow: listed.tabsOverflow },
  );
  check(
    "Assets: catalogue lists QuickTag packages only (other apps and invalid ids dropped), newest update first",
    // "good" was updated last; the rest share a date and fall back to name order.
    ids(listed).join(" ") === "good fallback toobig proto tampered zipped" && !listed.viewOverflow,
    { ids: ids(listed), viewOverflow: listed.viewOverflow },
  );
  check("Assets: ZIP packages are shown as not supported", card(listed, "zipped").action === "Not supported" && card(listed, "zipped").disabled, card(listed, "zipped"));

  // Polish: centered Website label, Show in Hub link, short profile button label.
  const polish = await evaluate(page, POLISH_STATE);
  check(
    "Assets: Website label is centered; Show in Hub opens File Hub filtered to QuickTag and the category in a new tab",
    polish.siteLabel === "Website" &&
      polish.siteIconRight &&
      polish.dx <= 1.5 &&
      polish.dy <= 1.5 &&
      polish.hubHref === `${origin}/hub/index.html?app=quicktag&category=tags` &&
      polish.hubTarget === "_blank" &&
      /noopener/.test(polish.hubRel),
    polish,
  );
  const compact = (control) => control.icon && !control.text && Boolean(control.label) && Boolean(control.title) && control.width <= 32;
  check(
    "Assets: Refresh, Show in Hub, and Preview are compact icon buttons with tooltips and labels; Install keeps its text",
    compact(polish.refresh) && compact(polish.hub) && compact(polish.preview) && polish.installText === "Install" && polish.headerHeights[0] === polish.headerHeights[1],
    { headerHeights: polish.headerHeights, refresh: polish.refresh, hub: polish.hub, preview: polish.preview, install: polish.installText },
  );
  await evaluate(page, `(() => { ${ROOT}.querySelector("#lm-tab-btn-sites").click(); return true; })()`);
  const profiles = await evaluate(page, POLISH_STATE);
  await evaluate(page, OPEN_ASSETS);
  check(
    'Settings: "Edit profiles" has its icon on the left, on one line',
    profiles.profilesLabel === "Edit profiles" && profiles.profilesLines === 1 && profiles.profilesIconLeft && profiles.profilesHeight <= 34,
    { label: profiles.profilesLabel, lines: profiles.profilesLines, iconLeft: profiles.profilesIconLeft, height: profiles.profilesHeight },
  );

  // Contents preview: validated like an install, but nothing is saved.
  await evaluate(page, CLICK_PREVIEW("good"));
  const preview = await waitFor(evaluate, page, PREVIEW_STATE("good"), (state) => state.state === "ready" || state.state === "error", 10000);
  const afterPreview = await evaluate(page, ASSETS_STATE);
  await evaluate(page, CLICK_PREVIEW("good"));
  const hidden = await evaluate(page, PREVIEW_STATE("good"));
  await evaluate(page, CLICK_PREVIEW("tampered"));
  const tamperedPreview = await waitFor(evaluate, page, PREVIEW_STATE("tampered"), (state) => state.state === "ready" || state.state === "error", 10000);
  await evaluate(page, CLICK_PREVIEW("tampered"));
  check(
    "Assets: Preview shows groups, categories, and tags (verified) without installing; bad files show the error",
    preview.state === "ready" &&
      /1 group · 1 category · 2 tags · SHA-256 verified/.test(preview.text) &&
      /Hub Group › Hub Category \(2\)/.test(preview.text) &&
      /hub_tag_one, hub_tag_two/.test(preview.text) &&
      preview.button === "Hide contents" &&
      card(afterPreview, "good").status === "available" &&
      !afterPreview.packs.includes("Mock Hub Pack") &&
      hidden.state === "none" &&
      hidden.button === "Preview contents" &&
      tamperedPreview.state === "error" &&
      /SHA-256/.test(tamperedPreview.text),
    { preview, status: card(afterPreview, "good").status, hidden, tamperedPreview },
  );

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
