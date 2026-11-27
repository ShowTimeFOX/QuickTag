// Focus Mode palette, laid out like the tagger palette: AI button and pack in
// the header; group tabs (with the AI group first while it has results or is
// running); category sub-tabs, or Flat view with category labels; "+ All";
// search; chips that reflect the Focus Mode tag states. The pack <select>
// also gets the wheel ghost scroll reel (pack-ghost-scroll.js), drawn inside
// the overlay and closed first by Escape (api.pushDismissable).
// Click: active → remove, absent or muted → add (muting is on the badges).
import { formatTag } from "../../shared/tags.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { getActivePack, searchActivePack, selectCategory, selectGroup, selectPack } from "../palettes.js";
import { getTagState, toggleAllTags, togglePaletteTag } from "../focus-tags.js";
import { getAnalysisPhase, getAnalysisStatus, getSuggestedEntries, getSuggestedTags, startAnalysis } from "../ai-analysis.js";
import { el, button } from "./dom.js";
import { createEmptyMessage, createTagChip } from "./chips.js";
import { attachScrollArrows, enableWheelScrolling } from "./scroll-arrows.js";
import { attachGhostScroll } from "./pack-ghost-scroll.js";

const STATE_ICONS = { active: "−", muted: "+", none: "+" };
const STATE_TITLES = { active: "Active: click to remove", muted: "Muted in the tag list: click to switch on", none: "Click to add" };
const AI_ICON = "M7 2.5 8.2 5.8 11.5 7 8.2 8.2 7 11.5 5.8 8.2 2.5 7l3.3-1.2zM12 10l.6 1.4 1.4.6-1.4.6L12 14l-.6-1.4-1.4-.6 1.4-.6z";
const AI_CATEGORY_LABEL = "Suggestions";

function applyChipState(chip) {
  const tagState = getTagState(chip.dataset.tag);
  chip.classList.toggle("active", tagState === "active");
  chip.classList.toggle("muted", tagState === "muted");
  chip.title = `${chip.dataset.location ? `${chip.dataset.location} · ` : ""}${STATE_TITLES[tagState]}`;
  const icon = chip.querySelector(".icon");
  if (icon) icon.textContent = STATE_ICONS[tagState];
}

function chip(tag, location, score = null) {
  const element = createTagChip(tag, { onClick: togglePaletteTag, score });
  if (location) element.dataset.location = location;
  applyChipState(element);
  return element;
}

const cleanTags = (tags) => [...new Set(tags.map(formatTag).filter(Boolean))];

export function createFocusPalettePanel(api) {
  const view = { aiActive: false };

  const packSelect = el("select", { className: "lazymod-input lm-focus-pack", attrs: { "aria-label": "Tag pack" } });
  const aiButton = button("AI", { iconPath: AI_ICON, className: "lazymod-btn lm-focus-ai-button", title: "AI suggestions: analyze the page image with ComfyUI (WD14)" });
  const groupTabs = el("div", { className: "lazymod-tabs lazymod-palette-scroller lm-focus-groups", attrs: { role: "tablist", "aria-label": "Folder groups" } });
  const categoryTabs = el("div", { className: "lazymod-subtabs lm-focus-categories", attrs: { role: "tablist", "aria-label": "Categories" } });
  const flatInput = el("input", { attrs: { type: "checkbox" } });
  const flatLabel = el("label", { className: "lazymod-checkbox-option lm-focus-flat", title: "Show every category of the group, each under its label" }, [flatInput, el("span", { text: "Flat view" })]);
  const allToggle = el("button", { className: "lazymod-btn lm-focus-all-toggle lm-focus-group-all", text: "+ All", attrs: { type: "button", "aria-pressed": "false" } });
  const filterInput = el("input", {
    className: "lazymod-input lm-focus-filter",
    attrs: { type: "search", placeholder: "Search this pack…", "aria-label": "Search tags in this pack", autocomplete: "off" },
  });
  const body = el("div", { className: "lm-focus-palette-body" });

  const element = el("section", { className: "lm-focus-panel lm-focus-palette-panel", attrs: { "aria-label": "Palette" } }, [
    el("div", { className: "lm-focus-panel-header" }, [el("h2", { className: "lazymod-title", text: "Palette" }), packSelect, aiButton]),
    el("div", { className: "lm-focus-group-row" }, [groupTabs, flatLabel, allToggle]),
    categoryTabs,
    filterInput,
    body,
  ]);
  enableWheelScrolling(groupTabs);
  // The strip must be in the DOM before its arrows wrap it.
  attachScrollArrows(groupTabs);

  const isFlat = () => api.getPrefs().paletteFlat === true;
  const hasAiGroup = () => getAnalysisPhase() !== "idle";

  /** Tags "+ All" acts on: AI suggestions, the active category, or the whole group (flat). */
  function visibleTags(pack) {
    if (view.aiActive) return getAnalysisPhase() === "done" ? getSuggestedTags() : [];
    const categories = pack?.groups[state.paletteData.activeGroup] || {};
    return cleanTags(isFlat() ? Object.values(categories).flat() : categories[state.paletteData.activeCategory] || []);
  }

  function renderAllToggle(pack) {
    const tags = visibleTags(pack);
    const allActive = tags.length > 0 && tags.every((tag) => getTagState(tag) === "active");
    allToggle.disabled = tags.length === 0 || Boolean(filterInput.value.trim());
    allToggle.textContent = allActive ? "− All" : "+ All";
    allToggle.title = allActive ? "Remove all visible tags" : "Add all visible tags";
    allToggle.setAttribute("aria-pressed", String(allActive));
  }

  function renderAiButton() {
    const busy = getAnalysisPhase() === "busy";
    aiButton.disabled = busy;
    aiButton.classList.toggle("is-busy", busy);
    if (busy) aiButton.setAttribute("aria-busy", "true");
    else aiButton.removeAttribute("aria-busy");
    aiButton.lastElementChild.textContent = busy ? "AI…" : "AI";
  }

  function renderPacks() {
    const { packs, activePackId } = state.paletteData;
    const entries = Object.entries(packs || {});
    packSelect.replaceChildren(...entries.map(([packId, pack]) => el("option", { text: pack.name, attrs: { value: packId, selected: packId === activePackId } })));
    if (!entries.length) packSelect.appendChild(el("option", { text: "No tag packs", attrs: { value: "", selected: true } }));
    packSelect.disabled = !entries.length;
  }

  function tab(className, label, active, onClick, attrs = {}) {
    return el("button", {
      className: `${className}${active ? " active" : ""}`,
      text: label,
      attrs: { type: "button", role: "tab", "aria-selected": String(active), ...attrs },
      on: { click: onClick },
    });
  }

  function renderGroups(pack) {
    if (!hasAiGroup()) view.aiActive = false;
    const tabs = [];
    if (hasAiGroup()) {
      const aiTab = tab("lazymod-tab lazymod-ai-tab", "AI", view.aiActive, () => {
        view.aiActive = true;
        render();
      });
      aiTab.dataset.state = getAnalysisPhase();
      tabs.push(aiTab);
    }
    Object.keys(pack?.groups || {}).forEach((groupName) => {
      tabs.push(
        tab("lazymod-tab", groupName, !view.aiActive && groupName === state.paletteData.activeGroup, () => {
          view.aiActive = false;
          selectGroup(groupName);
          emit(EVENTS.paletteChanged, { source: "focus" });
          render();
        }),
      );
    });
    groupTabs.replaceChildren(...tabs);
  }

  function renderCategories(pack) {
    categoryTabs.hidden = isFlat() || Boolean(filterInput.value.trim());
    if (view.aiActive) {
      categoryTabs.replaceChildren(tab("lazymod-subtab", AI_CATEGORY_LABEL, true, () => {}));
      return;
    }
    const categories = pack?.groups[state.paletteData.activeGroup] || {};
    const names = Object.keys(categories);
    if (names.length && !names.includes(state.paletteData.activeCategory)) state.paletteData.activeCategory = names[0];
    categoryTabs.replaceChildren(
      ...names.map((categoryName) =>
        tab("lazymod-subtab", categoryName, categoryName === state.paletteData.activeCategory, () => {
          selectCategory(categoryName);
          emit(EVENTS.paletteChanged, { source: "focus" });
          render();
        }),
      ),
    );
  }

  function aiContent() {
    const phase = getAnalysisPhase();
    const { message } = getAnalysisStatus();
    if (phase === "busy") return [el("p", { className: "lm-focus-ai-message", dataset: { state: "busy" }, text: message || "Analyzing the page image…" })];
    if (phase === "error") return [el("p", { className: "lm-focus-ai-message", dataset: { state: "error" }, text: message })];
    const entries = getSuggestedEntries();
    if (!entries.length) return [el("p", { className: "lm-focus-ai-message", dataset: { state: "empty" }, text: "No suggested tags above the threshold." })];
    return [el("div", { className: "lazymod-chips lm-focus-chips" }, entries.map(([tag, score]) => chip(tag, "AI suggestion", score)))];
  }

  function category(name, tags) {
    const unique = cleanTags(tags);
    return el("div", { className: "lm-focus-category" }, [
      el("h3", { className: "lm-focus-category-title", text: name }, [el("span", { className: "lm-focus-meta", text: ` ${unique.length}` })]),
      el("div", { className: "lazymod-chips lm-focus-chips" }, unique.map((tag) => chip(tag, name))),
    ]);
  }

  function renderBody(pack) {
    body.replaceChildren();
    const query = filterInput.value.trim();
    if (query && pack) {
      const results = searchActivePack(query);
      const chips = el("div", { className: "lazymod-chips lm-focus-chips" }, results.map((result) => chip(result.tag, `${result.groupName} / ${result.categoryName}`)));
      if (!results.length) chips.appendChild(createEmptyMessage("No matching tags found."));
      body.appendChild(chips);
      return;
    }
    if (view.aiActive) {
      body.append(...(isFlat() ? [el("div", { className: "lm-focus-category" }, [el("h3", { className: "lm-focus-category-title", text: AI_CATEGORY_LABEL }), ...aiContent()])] : aiContent()));
      return;
    }
    if (!pack) {
      body.appendChild(createEmptyMessage("No tag packs. Import a JSON pack in the tagger to get started."));
      return;
    }
    const categories = pack.groups[state.paletteData.activeGroup] || {};
    if (isFlat()) {
      Object.entries(categories).forEach(([name, tags]) => body.appendChild(category(name, tags)));
      return;
    }
    const tags = categories[state.paletteData.activeCategory] || [];
    body.appendChild(el("div", { className: "lazymod-chips lm-focus-chips" }, cleanTags(tags).map((tag) => chip(tag, state.paletteData.activeCategory))));
  }

  function render() {
    if (!state.paletteData) return;
    const pack = getActivePack();
    if (pack && !pack.groups[state.paletteData.activeGroup]) {
      state.paletteData.activeGroup = Object.keys(pack.groups)[0];
    }
    flatInput.checked = isFlat();
    renderPacks();
    renderAiButton();
    renderGroups(pack);
    renderCategories(pack);
    renderBody(pack);
    renderAllToggle(pack);
  }

  // Ghost scroll on the pack <select>; its native list stays untouched.
  const ghostReel = el("div", { className: "lazymod-ghost-list lm-focus-ghost-list", id: "lm-focus-ghost-list", hidden: true, attrs: { role: "listbox", "aria-label": "Tag packs" } });
  api.root.appendChild(ghostReel);
  let releaseEscape = null;
  const reel = attachGhostScroll({
    trigger: packSelect,
    list: ghostReel,
    isBlocked: () => packSelect.disabled,
    onOpen: () => {
      releaseEscape ??= api.pushDismissable(() => reel.close());
    },
    onClose: () => {
      releaseEscape?.();
      releaseEscape = null;
    },
  });

  packSelect.addEventListener("change", () => {
    if (!selectPack(packSelect.value)) return;
    view.aiActive = false;
    emit(EVENTS.paletteChanged, { source: "focus" });
    render();
  });
  aiButton.addEventListener("click", () => {
    view.aiActive = true;
    startAnalysis();
    render();
  });
  flatInput.addEventListener("change", () => {
    api.setPref("paletteFlat", flatInput.checked);
    render();
  });
  allToggle.addEventListener("click", () => toggleAllTags(visibleTags(getActivePack())));
  filterInput.addEventListener("input", () => {
    const pack = getActivePack();
    renderCategories(pack);
    renderBody(pack);
    renderAllToggle(pack);
  });

  on(EVENTS.focusTagsChanged, () => {
    element.querySelectorAll(".lazymod-chip").forEach(applyChipState);
    renderAllToggle(getActivePack());
  });
  on(EVENTS.aiSuggestionsChanged, () => {
    if (state.focusModeActive) render();
  });
  on(EVENTS.blacklistChanged, () => {
    if (state.focusModeActive && view.aiActive) render();
  });
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== "focus" && state.focusModeActive) render();
  });

  return { element, render };
}
