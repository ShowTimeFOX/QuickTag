// Top-level tagger tabs (Palette / Settings) and the About link.
import { MESSAGE_ACTIONS } from "../../shared/constants.js";
import { notifyTagsChanged } from "../page.js";
import { requestExtensionPage } from "../messaging.js";
import { $ } from "./shell.js";
import { renderSettingsUI } from "./settings-panel.js";

const TABS = {
  main: { button: "#lm-tab-btn-main", view: "#lm-view-main", onShow: notifyTagsChanged },
  sites: { button: "#lm-tab-btn-sites", view: "#lm-view-sites", onShow: renderSettingsUI },
};

function showTab(name) {
  Object.entries(TABS).forEach(([tabName, tab]) => {
    const isActive = tabName === name;
    $(tab.button).classList.toggle("active", isActive);
    $(tab.view).style.display = isActive ? "block" : "none";
  });
  TABS[name].onShow();
}

export function isMainTabActive() {
  return $(TABS.main.button).classList.contains("active");
}

export function showMainTab() {
  showTab("main");
}

export function initTabs() {
  // Initial state is set via CSSOM, not a template style attribute (blocked by
  // strict page CSPs in Firefox). The Palette tab is active in the template.
  $(TABS.sites.view).style.display = "none";
  Object.entries(TABS).forEach(([name, tab]) => {
    $(tab.button).onclick = () => showTab(name);
  });
  $("#lm-tab-btn-about").onclick = () => {
    requestExtensionPage({ action: MESSAGE_ACTIONS.openAboutPage }, "Could not open the About page");
  };
}
