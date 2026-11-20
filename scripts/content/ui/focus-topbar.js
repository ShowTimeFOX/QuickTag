// Focus Mode top bar: page info, layout preset, tag counts, live sync, exit.
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { applyToPage, getCounts, hasPageField, isDirty, isLiveSync, loadFromPage, setLiveSync } from "../focus-tags.js";
import { el, button, icon, ICONS } from "./dom.js";

const LIVE_SYNC_TITLE = "Write every change to the page's tag field and follow edits made on the page";

export function createFocusTopbar(api) {
  const host = el("strong", { className: "lm-focus-host" });
  const profile = el("code", { className: "lm-focus-profile" });
  const presetSelect = el("select", { className: "lazymod-input lm-focus-preset", attrs: { "aria-label": "Layout preset" } });
  const counts = el("span", { className: "lazymod-badge lm-focus-count", attrs: { "aria-live": "polite" } });
  const liveSyncInput = el("input", { attrs: { type: "checkbox" } });
  const liveSyncLabel = el("label", { className: "lazymod-checkbox-option lm-focus-live-sync", title: LIVE_SYNC_TITLE }, [
    liveSyncInput,
    el("span", { text: "Live sync" }),
  ]);
  const dirtyNote = el("span", { className: "lm-focus-dirty", text: "Unapplied changes", hidden: true });
  const applyButton = button("Apply to page", { iconPath: ICONS.upload, className: "lazymod-btn lazymod-btn-accent", title: "Write the Focus Mode tags to the page's tag field" });
  const reloadButton = button("Reload from page", { iconPath: ICONS.sync, title: "Replace the Focus Mode list with the page's current tags" });
  const layoutButton = button("Layout", { iconPath: ICONS.layout, title: "View, edit, import, or export the layout JSON" });
  const exitButton = button("Exit", { iconPath: ICONS.close, className: "lazymod-btn lm-focus-exit", title: "Exit Focus Mode" });
  const status = el("div", { className: "lm-focus-status", attrs: { role: "status", "aria-live": "polite" }, hidden: true });

  const element = el("header", { className: "lm-focus-panel lm-focus-topbar" }, [
    el("div", { className: "lm-focus-topbar-group lm-focus-site" }, [icon(ICONS.focus, "lazymod-action-icon lm-focus-brand"), host, profile]),
    el("label", { className: "lm-focus-topbar-group" }, [el("span", { className: "lm-focus-label", text: "Layout" }), presetSelect]),
    el("div", { className: "lm-focus-topbar-group" }, [counts, liveSyncLabel, dirtyNote, applyButton, reloadButton]),
    el("div", { className: "lm-focus-topbar-group lm-focus-topbar-end" }, [layoutButton, exitButton]),
    status,
  ]);

  function refresh() {
    host.textContent = window.location.hostname || window.location.origin;
    host.title = window.location.href;
    profile.textContent = state.activeSiteKey;
    profile.title = `Active site profile: ${state.activeSiteKey}`;
    const { active, muted } = getCounts();
    counts.textContent = muted ? `${active} active · ${muted} muted` : `${active} active`;
    const live = isLiveSync();
    const hasField = hasPageField();
    liveSyncInput.checked = live;
    liveSyncInput.disabled = !hasField;
    liveSyncLabel.title = hasField ? LIVE_SYNC_TITLE : "No tag field was found on this page";
    applyButton.hidden = live || !hasField;
    reloadButton.hidden = live || !hasField;
    applyButton.disabled = !isDirty();
    dirtyNote.hidden = live || !isDirty();
  }

  liveSyncInput.addEventListener("change", () => {
    setLiveSync(liveSyncInput.checked);
    api.setPref("liveSync", liveSyncInput.checked);
    api.setStatus(liveSyncInput.checked ? "Live sync on: the page's tag field follows Focus Mode." : "Live sync off: use Apply to page to write changes.");
  });
  applyButton.addEventListener("click", () => {
    applyToPage();
    api.setStatus("Tags written to the page.", "success");
  });
  reloadButton.addEventListener("click", () => {
    loadFromPage();
    api.setStatus("Reloaded tags from the page.");
  });
  presetSelect.addEventListener("change", () => api.setActivePreset(presetSelect.value));
  layoutButton.addEventListener("click", api.openLayoutDialog);
  exitButton.addEventListener("click", api.close);

  on(EVENTS.focusTagsChanged, refresh);
  on(EVENTS.siteProfilesChanged, refresh);
  on(EVENTS.focusModeChanged, ({ active }) => active && refresh());

  return {
    element,
    setLayout(layout) {
      presetSelect.replaceChildren(
        ...Object.entries(layout.presets).map(([presetId, preset]) => el("option", { text: preset.name, attrs: { value: presetId, selected: presetId === layout.activePreset } })),
      );
      presetSelect.value = layout.activePreset;
    },
    setStatus(message, statusState) {
      status.textContent = message;
      status.dataset.state = statusState;
      status.hidden = !message;
    },
  };
}
