// Settings checks shared by chrome.mjs and firefox.mjs: site profile saving
// (element picker, per-site profile that stays active), tag separator,
// Reduce visual effects, and the File Hub permission page.
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const SHOW_SETTINGS = `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  root.querySelector("#lm-tab-btn-sites").click();
  return true;
})()`;
const SHOW_TAGGING = `(() => { ${ROOT}.querySelector("#lm-tab-btn-main").click(); return true; })()`;
const PROFILE = `(() => {
  const root = ${ROOT};
  return {
    badge: root.querySelector("#lm-active-badge").textContent,
    profile: root.querySelector("#lm-settings-profile").textContent,
    pattern: root.querySelector("#lm-settings-pattern").textContent,
    tagSelector: root.querySelector("#lm-settings-tag-selector").textContent,
    imgSelector: root.querySelector("#lm-settings-img-selector").textContent,
    separator: root.querySelector("#lm-tag-separator").value,
    addLabel: root.querySelector("#lm-add-current-site").textContent.trim(),
    field: document.getElementById("tags").value,
    counter: root.querySelector("#lm-tag-count-badge").textContent,
  };
})()`;
const setSeparator = (value) =>
  `(() => { const input = ${ROOT}.querySelector("#lm-tag-separator"); input.focus(); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event("change", { bubbles: true })); input.blur(); return true; })()`;
const EFFECTS = `(() => {
  const host = document.getElementById("quicktag-extension-root");
  const root = host.shadowRoot;
  const button = root.querySelector("#lm-view-main .lazymod-btn");
  const focus = root.querySelector("#lm-focus-root");
  return {
    hostClass: host.classList.contains("lm-reduced-effects"),
    checked: root.querySelector("#lm-reduce-effects").checked,
    buttonTransition: getComputedStyle(button).transitionDuration,
    windowBlur: getComputedStyle(root.querySelector("#lazymod-window")).backdropFilter || "none",
    focusBlur: focus && !focus.hidden ? getComputedStyle(focus).backdropFilter || "none" : null,
  };
})()`;
const CLICK_REDUCE = `(() => { ${ROOT}.querySelector("#lm-reduce-effects").click(); return true; })()`;
const ALT_A = `(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", altKey: true, bubbles: true, cancelable: true, composed: true })); return true; })()`;
const ESC_FOCUS = `(() => { ${ROOT}.querySelector("#lm-focus-root").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true })); return true; })()`;

export async function runSettingsChecks({ open, evaluate, check, origin }) {
  const host = new URL(origin).host;
  const page = await open(`${origin}/plain`);
  await waitFor(evaluate, page, READY, Boolean, 10000);
  await evaluate(page, SHOW_SETTINGS);
  const start = await evaluate(page, PROFILE);

  // Picking an element on the ".*" fallback saves it into a new profile for this site.
  await evaluate(page, `(() => { ${ROOT}.querySelector('[data-pick-type="tagInputSelector"]').click(); return true; })()`);
  await sleep(200);
  await evaluate(page, `(() => { document.getElementById("tags").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; })()`);
  const picked = await waitFor(evaluate, page, PROFILE, (state) => state.profile === host && state.tagSelector === "#tags");
  await sleep(2000); // storage echo and the 1.5 s page watcher must not switch profiles
  const later = await evaluate(page, PROFILE);
  check(
    "Profiles: a pick on the .* fallback saves into a new profile for this site (host with port), which stays active",
    start.profile === ".*" &&
      start.addLabel === "＋ Add profile for this site" &&
      picked.badge === host &&
      picked.tagSelector === "#tags" &&
      picked.imgSelector === start.imgSelector &&
      new RegExp(picked.pattern, "i").test(`${origin}/plain`) &&
      new RegExp(picked.pattern, "i").test(`${origin}/csp?x=1`) &&
      later.profile === host &&
      later.tagSelector === "#tags",
    { start: start.profile, picked, later: later.profile },
  );

  // Tag separator: saved in this site's profile, used to write and read the field.
  await evaluate(page, setSeparator(", "));
  await waitFor(evaluate, page, PROFILE, (state) => state.separator === ", ");
  await evaluate(page, SHOW_TAGGING);
  await evaluate(page, `(() => { const field = document.getElementById("tags"); field.value = ""; field.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const chips = await evaluate(page, `(() => { const chips = [...${ROOT}.querySelectorAll("#lm-user-chips .lazymod-chip")].slice(0, 2); chips.forEach((chip) => chip.click()); return chips.map((chip) => chip.dataset.tag); })()`);
  const joined = await evaluate(page, PROFILE);
  await evaluate(page, `(() => { const field = document.getElementById("tags"); field.value = "one_tag, two tag ,three"; field.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await sleep(200);
  const parsedCount = (await evaluate(page, PROFILE)).counter;

  // Saved: a new tab on another page of the same site uses the same profile.
  const other = await open(`${origin}/csp`);
  await waitFor(evaluate, other, READY, Boolean, 10000);
  await evaluate(other, SHOW_SETTINGS);
  const otherProfile = await waitFor(evaluate, other, PROFILE, (state) => state.profile === host);
  check(
    "Tag separator: saved per site profile, joins tags in the page field, and parses it; persists on other pages of the site",
    chips.length === 2 &&
      joined.field === `${chips[0]}, ${chips[1]}` &&
      parsedCount === "Tags: 3" &&
      otherProfile.profile === host &&
      otherProfile.separator === ", " &&
      otherProfile.tagSelector === "#tags",
    { chips, field: joined.field, parsedCount, other: otherProfile },
  );
  await evaluate(page, SHOW_SETTINGS);
  await evaluate(page, setSeparator(""));
  const reset = await waitFor(evaluate, page, PROFILE, (state) => state.separator === "");

  // Reduce visual effects: one switch for the tagger and Focus Mode, saved globally.
  const effectsBefore = await evaluate(page, EFFECTS);
  await evaluate(page, CLICK_REDUCE);
  const effectsOn = await evaluate(page, EFFECTS);
  await evaluate(page, ALT_A);
  const effectsFocus = await waitFor(evaluate, page, EFFECTS, (state) => state.focusBlur !== null);
  await evaluate(page, ESC_FOCUS);
  const synced = await waitFor(evaluate, other, EFFECTS, (state) => state.hostClass);
  await evaluate(page, CLICK_REDUCE);
  const effectsOff = await waitFor(evaluate, page, EFFECTS, (state) => !state.hostClass);
  check(
    "Reduce visual effects: turns off transitions and blur in the tagger and Focus Mode, syncs to other tabs, and turns back on",
    reset.separator === "" &&
      !effectsBefore.hostClass &&
      effectsBefore.buttonTransition !== "0s" &&
      effectsOn.hostClass &&
      effectsOn.checked &&
      effectsOn.buttonTransition === "0s" &&
      effectsOn.windowBlur === "none" &&
      effectsFocus.focusBlur === "none" &&
      synced.hostClass &&
      !effectsOff.hostClass &&
      effectsOff.buttonTransition !== "0s",
    { effectsBefore, effectsOn, effectsFocus, synced: synced.hostClass, effectsOff },
  );
}

const PERMISSION_STATE = `(() => ({
  origins: [...document.querySelectorAll("#permission-origins li")].map((item) => item.textContent),
  allowDisabled: document.getElementById("permission-allow").disabled,
  status: document.getElementById("permission-status").textContent,
  state: document.getElementById("permission-status").dataset.state || "",
}))()`;
/**
 * `openPage(query)` opens pages/permissions.html?query and returns a handle.
 * `clickAsUser(handle, expression)` runs `expression` with user activation.
 * permissions.request() needs a user gesture: Chrome accepts the DevTools
 * `userGesture` flag, but Firefox only accepts real input, which BiDi cannot
 * send to privileged moz-extension pages. There (`realGesture: false`) the
 * request is refused, which checks the explained manual fallback instead.
 */
export async function runPermissionPageChecks({ openPage, evaluate, clickAsUser, check, origin, realGesture = true }) {
  const allowed = `${new URL(origin).origin}/*`;
  const valid = await openPage(new URLSearchParams({ origins: JSON.stringify([allowed]), packageId: "good", purpose: "install" }).toString());
  const shown = await waitFor(evaluate, valid, PERMISSION_STATE, (state) => state.origins.length > 0, 8000);
  await clickAsUser(valid, `document.getElementById("permission-allow").click()`);
  // Access to the test server is already granted, so the browser answers without a prompt.
  const granted = await waitFor(evaluate, valid, PERMISSION_STATE, (state) => state.state === "success" || state.state === "error", 8000);
  const invalid = await openPage(new URLSearchParams({ origins: JSON.stringify(["http://evil.example/*", "<all_urls>"]), packageId: "x", purpose: "install" }).toString());
  const rejected = await waitFor(evaluate, invalid, PERMISSION_STATE, (state) => Boolean(state.status), 8000);
  check(
    realGesture
      ? "Permission page: lists the requested sites, asks the browser on a user click, and rejects invalid requests"
      : "Permission page: lists the requested sites, explains the manual fallback when the browser refuses, and rejects invalid requests",
    shown.origins.join() === new URL(origin).origin &&
      !shown.allowDisabled &&
      (realGesture
        ? granted.state === "success" && /Access granted/.test(granted.status)
        : granted.state === "error" && /about:addons › QuickTag LazyMod › Permissions/.test(granted.status) && !granted.allowDisabled) &&
      rejected.allowDisabled &&
      rejected.state === "error" &&
      rejected.origins.length === 0,
    { shown, granted, rejected },
  );
}
