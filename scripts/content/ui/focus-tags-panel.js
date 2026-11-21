// Focus Mode tag management: toggle badges (active ⇄ muted), remove (x),
// inline add, Badges / Raw text views, and the sort/dedupe/copy/clear toolbar.
import { LOG_PREFIX } from "../../shared/constants.js";
import { on, EVENTS } from "../events.js";
import {
  SORT_MODES,
  addTags,
  clearTags,
  deduplicate,
  getEntries,
  getTagString,
  hasPageField,
  parseTagInput,
  removeTag,
  setActiveFromText,
  sortTags,
  toggleMuted,
} from "../focus-tags.js";
import { el, button, ICONS } from "./dom.js";

const RAW_INPUT_DELAY_MS = 350;

export function createFocusTagsPanel(api) {
  const badgesViewButton = el("button", { className: "lm-focus-segment", text: "Badges", attrs: { type: "button" } });
  const rawViewButton = el("button", { className: "lm-focus-segment", text: "Raw text", attrs: { type: "button" } });
  // Compact icon buttons so the controls fit beside the "Tags" heading.
  const iconButton = (label, iconPath, title, className = "lazymod-btn lm-focus-icon-btn", attrs = {}) => button("", { iconPath, className, title, attrs: { "aria-label": label, ...attrs } });
  const sortButton = iconButton("Sort", ICONS.sort, "Sort tags", undefined, { "aria-haspopup": "menu", "aria-expanded": "false" });
  const sortMenu = el(
    "div",
    { className: "lm-focus-menu", hidden: true, attrs: { role: "menu", "aria-label": "Sort tags" } },
    Object.entries(SORT_MODES).map(([mode, label]) => el("button", { className: "lm-focus-menu-item", text: label, dataset: { sort: mode }, attrs: { type: "button", role: "menuitem" } })),
  );
  const dedupeButton = iconButton("Deduplicate", ICONS.dedupe, "Deduplicate: remove duplicate tags from the page's tag field");
  const copyButton = iconButton("Copy", ICONS.copy, "Copy the active tags as one string (joined with this site's tag separator)");
  const clearButton = iconButton("Clear", ICONS.trash, "Clear: remove all tags", "lazymod-btn lazymod-btn-danger lm-focus-icon-btn");
  const warning = el("p", {
    className: "lm-focus-warning",
    hidden: true,
    text: "No tag field was found on this page, so changes stay in Focus Mode. Use Copy, or set the tag input selector in Settings.",
  });
  const badges = el("div", { className: "lm-focus-badges", attrs: { role: "list", "aria-label": "Tags" } });
  const addInput = el("input", {
    className: "lazymod-input lm-focus-add-input",
    attrs: { type: "text", placeholder: "Add tags…", "aria-label": "Add tags (Enter, space, or comma separated)", autocomplete: "off", spellcheck: "false" },
  });
  const badgesView = el("div", { className: "lm-focus-badges-view" }, [badges, addInput]);
  const rawText = el("textarea", {
    className: "lazymod-input lm-focus-raw",
    hidden: true,
    attrs: { "aria-label": "Active tags as text", spellcheck: "false", placeholder: "tag_one tag_two tag_three" },
  });

  const element = el("section", { className: "lm-focus-panel lm-focus-tags-panel", attrs: { "aria-label": "Tags" } }, [
    // Controls share the heading row, leaving the panel's height to the tags.
    el("div", { className: "lm-focus-panel-header lm-focus-tags-header" }, [
      el("h2", { className: "lazymod-title", text: "Tags" }),
      el("div", { className: "lm-focus-segmented", attrs: { role: "group", "aria-label": "Tag view" } }, [badgesViewButton, rawViewButton]),
      el("div", { className: "lm-focus-toolbar lm-focus-tags-toolbar" }, [el("div", { className: "lm-focus-menu-anchor" }, [sortButton, sortMenu]), dedupeButton, copyButton, clearButton]),
    ]),
    warning,
    el("div", { className: "lm-focus-tags-body" }, [badgesView, rawText]),
  ]);

  // --- Badges ---

  function renderBadges() {
    const entries = getEntries();
    badges.replaceChildren(
      ...entries.map(({ tag, muted }) =>
        el("span", { className: `lm-focus-badge${muted ? " muted" : ""}`, dataset: { tag }, attrs: { role: "listitem" } }, [
          el("button", {
            className: "lm-focus-badge-toggle",
            text: tag,
            title: muted ? "Muted: click to switch on" : "Active: click to mute (keeps the tag)",
            attrs: { type: "button", "aria-pressed": String(!muted) },
            on: { click: () => toggleMuted(tag) },
          }),
          el("button", {
            className: "lm-focus-badge-remove",
            text: "×",
            title: `Remove ${tag}`,
            attrs: { type: "button", "aria-label": `Remove ${tag}` },
            on: { click: () => removeTag(tag) },
          }),
        ]),
      ),
    );
    if (entries.length === 0) badges.appendChild(el("span", { className: "lm-focus-empty", text: "No tags yet. Type below or click tags in the palette." }));
  }

  function addFromInput() {
    const tags = parseTagInput(addInput.value);
    addInput.value = "";
    if (tags.length) addTags(tags);
  }

  addInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addFromInput();
    } else if (event.key === "Backspace" && !addInput.value) {
      // Backspace in the empty input focuses the last badge's remove button.
      badges.querySelector(".lm-focus-badge:last-of-type .lm-focus-badge-remove")?.focus();
    }
  });
  addInput.addEventListener("input", () => {
    // Pasted or typed separators add the completed tags.
    if (/[\s,]/.test(addInput.value)) {
      const parts = addInput.value.split(/[\s,]+/);
      const rest = parts.pop();
      const tags = parseTagInput(parts.join(" "));
      addInput.value = rest;
      if (tags.length) addTags(tags);
    }
  });
  // No add-on-blur: re-rendering the badges mid-click would swallow a badge
  // click. Unfinished text stays in the input.

  // --- Raw text ---

  let rawTimer = null;
  function flushRaw() {
    clearTimeout(rawTimer);
    rawTimer = null;
    setActiveFromText(rawText.value);
  }
  rawText.addEventListener("input", () => {
    clearTimeout(rawTimer);
    rawTimer = setTimeout(flushRaw, RAW_INPUT_DELAY_MS);
  });
  rawText.addEventListener("blur", () => rawTimer && flushRaw());

  function renderRaw(source) {
    // Don't overwrite text the user is typing (an edit is still pending).
    if (source === "raw" || rawTimer) return;
    rawText.value = getTagString();
  }

  function applyView() {
    const view = api.getPrefs().tagView;
    badgesView.hidden = view !== "badges";
    rawText.hidden = view !== "raw";
    badgesViewButton.setAttribute("aria-pressed", String(view === "badges"));
    rawViewButton.setAttribute("aria-pressed", String(view === "raw"));
  }
  function setView(view) {
    if (rawTimer) flushRaw();
    api.setPref("tagView", view);
    applyView();
    renderRaw("view");
    (view === "raw" ? rawText : addInput).focus();
  }
  badgesViewButton.addEventListener("click", () => setView("badges"));
  rawViewButton.addEventListener("click", () => setView("raw"));

  // --- Toolbar ---

  let releaseMenu = null;
  function closeSortMenu() {
    sortMenu.hidden = true;
    sortButton.setAttribute("aria-expanded", "false");
    api.root.removeEventListener("pointerdown", handleOutsidePointer, true);
    releaseMenu?.();
    releaseMenu = null;
  }
  function handleOutsidePointer(event) {
    if (!event.composedPath().some((node) => node === sortMenu || node === sortButton)) closeSortMenu();
  }
  sortButton.addEventListener("click", () => {
    if (!sortMenu.hidden) {
      closeSortMenu();
      return;
    }
    sortMenu.hidden = false;
    sortButton.setAttribute("aria-expanded", "true");
    releaseMenu = api.pushDismissable(closeSortMenu);
    api.root.addEventListener("pointerdown", handleOutsidePointer, true);
    sortMenu.querySelector("button")?.focus();
  });
  sortMenu.addEventListener("click", (event) => {
    const mode = event.target.closest?.("[data-sort]")?.dataset.sort;
    if (!mode) return;
    closeSortMenu();
    sortTags(mode);
    api.setStatus(`Sorted: ${SORT_MODES[mode]}.`);
  });

  dedupeButton.addEventListener("click", () => {
    const removed = deduplicate();
    api.setStatus(removed ? `Removed ${removed} duplicate ${removed === 1 ? "tag" : "tags"}.` : "No duplicate tags found.");
  });
  copyButton.addEventListener("click", async () => {
    const text = getTagString();
    try {
      await navigator.clipboard.writeText(text);
      api.setStatus(text ? "Tags copied to the clipboard." : "No active tags to copy.", "success");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not copy tags.`, error);
      api.setStatus(`Could not copy tags: ${error.message}`, "error");
    }
  });
  clearButton.addEventListener("click", () => {
    if (!getEntries().length || !confirm("Clear all tags, including muted ones?")) return;
    clearTags();
  });

  on(EVENTS.focusTagsChanged, ({ source } = {}) => {
    warning.hidden = hasPageField();
    renderBadges();
    renderRaw(source);
  });
  on(EVENTS.focusModeChanged, ({ active }) => {
    if (!active) {
      if (rawTimer) flushRaw();
      return;
    }
    applyView();
    renderRaw("open");
  });

  return { element };
}
