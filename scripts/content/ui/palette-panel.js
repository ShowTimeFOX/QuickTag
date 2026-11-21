// Palette view: group/category tabs (or Flat view with category labels), tag
// chips, fuzzy search, type-to-search when focus is outside an editable field,
// and the AI group: the AI button analyzes the page image, and its suggested
// tags appear as an extra group at the start of the group tabs (never saved
// into the pack). The analysis lives in ../ai-analysis.js.
import { LOG_PREFIX, STORAGE_KEYS, MESSAGE_ACTIONS } from "../../shared/constants.js";
import { formatTag } from "../../shared/tags.js";
import { onLocalStorageChange } from "../../shared/storage.js";
import { decodePaletteData } from "../../shared/palette.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { addTagToMain, getMainTags, isEditableTarget, setMainTags } from "../page.js";
import { getAnalysisPhase, getAnalysisStatus, getSuggestedEntries, getSuggestedTags, startAnalysis } from "../ai-analysis.js";
import { requestExtensionPage } from "../messaging.js";
import {
  exportActivePack,
  getActivePack,
  getVisiblePaletteTags,
  importPackFile,
  searchActivePack,
  selectCategory,
  selectGroup,
} from "../palettes.js";
import { $, $$, shell, setIconPath, ICON_PATHS } from "./shell.js";
import { createEmptyMessage, createTagChip, syncChipStates } from "./chips.js";
import { el } from "./dom.js";
import { isMainTabActive, showMainTab } from "./tabs.js";
import { setTaggerCollapsed } from "./window-controls.js";
import { attachScrollArrows, enableWheelScrolling } from "./scroll-arrows.js";

const TYPE_TO_SEARCH_RESET_MS = 1000;
const NO_PACKS_MESSAGE = "No tag packs. Import a JSON pack to get started.";

export const AI_GROUP_LABEL = "AI";
const AI_CATEGORY_LABEL = "Suggestions";

const view = {
  flatView: false,
  /** The AI group is shown (view state only; selecting a pack group clears it). */
  aiActive: false,
  searchQuery: "",
  highlightedResult: 0,
  typeBuffer: "",
  typeResetTimer: null,
};

function createTabButton(className, label, isActive, onClick) {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = className;
  tab.classList.toggle("active", isActive);
  tab.textContent = label;
  tab.onclick = onClick;
  return tab;
}

// --- AI group ---

function hasAiGroup() {
  return getAnalysisPhase() !== "idle";
}

/** The AI button shows the analysis state (spinner and "AI…" while running). */
function renderAiButton() {
  const button = $("#lm-fetch-ai");
  const busy = getAnalysisPhase() === "busy";
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  if (busy) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
  button.querySelector("span").textContent = busy ? "AI…" : "AI";
  button.title = busy ? "Analyzing the page image…" : "AI suggestions: analyze the page image with ComfyUI (WD14)";
}

/** Chips (or a loading / empty / error message) for the AI group. */
function appendAiContent(container, mainTags) {
  const phase = getAnalysisPhase();
  const { message } = getAnalysisStatus();
  if (phase === "busy") {
    container.appendChild(el("div", { className: "lazymod-empty lazymod-ai-message", dataset: { state: "busy" }, text: message || "Analyzing the page image…" }));
    return;
  }
  if (phase === "error") {
    container.appendChild(el("div", { className: "lazymod-empty lazymod-ai-message", dataset: { state: "error" }, text: message }));
    return;
  }
  const entries = getSuggestedEntries();
  if (!entries.length) {
    container.appendChild(el("div", { className: "lazymod-empty lazymod-ai-message", dataset: { state: "empty" }, text: "No suggested tags above the threshold." }));
    return;
  }
  entries.forEach(([tag, score]) => container.appendChild(createTagChip(tag, { isActive: mainTags.includes(tag), score, title: "AI suggestion" })));
}

// --- Rendering ---

/** Tags "+ All" acts on: the AI suggestions, or the visible palette tags. */
function getVisibleTags() {
  if (view.aiActive) return getAnalysisPhase() === "done" ? getSuggestedTags() : [];
  return getVisiblePaletteTags(view.flatView);
}

function updatePaletteToggleButton() {
  const button = $("#lm-add-all-palette");
  if (!button) return;
  if (view.searchQuery) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  const visibleTags = getVisibleTags();
  const mainTags = getMainTags();
  const allSelected = visibleTags.length > 0 && visibleTags.every((tag) => mainTags.includes(tag));

  button.disabled = visibleTags.length === 0;
  button.title = allSelected ? "Remove all visible tags" : "Add all visible tags";
  button.setAttribute("aria-pressed", String(allSelected));
  setIconPath(button, allSelected ? ICON_PATHS.minus : ICON_PATHS.plus);
  button.classList.toggle("lazymod-btn-danger", allSelected);
  button.classList.toggle("lazymod-btn-accent", !allSelected);
}

function renderUserChips() {
  const container = $("#lm-user-chips");
  if (!container) return;
  container.replaceChildren();
  const mainTags = getMainTags();
  const searchResults = view.searchQuery ? searchActivePack(view.searchQuery) : null;
  const activePack = getActivePack();

  if (!searchResults && view.aiActive) {
    if (view.flatView) container.appendChild(el("div", { className: "lazymod-chip-group-label", text: AI_CATEGORY_LABEL }));
    appendAiContent(container, mainTags);
    updatePaletteToggleButton();
    return;
  }

  if (searchResults && searchResults.length === 0) {
    container.appendChild(createEmptyMessage(activePack ? "No matching tags found." : NO_PACKS_MESSAGE));
  } else if (!activePack) {
    container.appendChild(createEmptyMessage(NO_PACKS_MESSAGE));
  }

  if (!searchResults && activePack && view.flatView) {
    // Flat view: every category of the group, each under its label.
    Object.entries(activePack.groups[state.paletteData.activeGroup] || {}).forEach(([categoryName, tags]) => {
      const cleanTags = [...new Set(tags.map(formatTag).filter(Boolean))];
      container.appendChild(el("div", { className: "lazymod-chip-group-label", text: categoryName }));
      cleanTags.forEach((tag) => container.appendChild(createTagChip(tag, { isActive: mainTags.includes(tag), title: categoryName })));
    });
    updatePaletteToggleButton();
    return;
  }

  const tags = searchResults ? searchResults.map((result) => result.tag) : getVisiblePaletteTags(false);
  tags.forEach((tag, index) => {
    const result = searchResults?.[index];
    container.appendChild(
      createTagChip(tag, {
        isActive: mainTags.includes(tag),
        isHighlighted: Boolean(searchResults) && index === view.highlightedResult,
        title: result ? `${result.groupName} / ${result.categoryName}` : "",
      }),
    );
  });
  updatePaletteToggleButton();
}

function renderCategoriesUI() {
  const activePack = getActivePack();
  const tabsContainer = $("#lm-category-tabs");
  tabsContainer.hidden = view.flatView;
  tabsContainer.replaceChildren();
  if (view.aiActive) {
    if (!view.flatView) tabsContainer.appendChild(createTabButton("lazymod-subtab", AI_CATEGORY_LABEL, true, () => {}));
    renderUserChips();
    return;
  }
  if (!activePack) {
    renderUserChips();
    return;
  }

  const paletteData = state.paletteData;
  const categoryNames = Object.keys(activePack.groups[paletteData.activeGroup]);
  if (!categoryNames.includes(paletteData.activeCategory)) {
    paletteData.activeCategory = categoryNames[0];
  }
  if (!view.flatView) {
    categoryNames.forEach((categoryName) => {
      tabsContainer.appendChild(
        createTabButton("lazymod-subtab", categoryName, categoryName === paletteData.activeCategory, () => {
          selectCategory(categoryName);
          renderCategoriesUI();
        }),
      );
    });
  }
  renderUserChips();
}

/**
 * Re-renders the whole palette view from `state.paletteData` and announces
 * the change to other palette views (Focus Mode) unless `notify` is false.
 */
export function renderPalettePanel({ notify = true } = {}) {
  renderPaletteView();
  if (notify) emit(EVENTS.paletteChanged, { source: "tagger" });
}

function renderPaletteView() {
  const paletteData = state.paletteData;
  paletteData.packs = paletteData.packs || {};
  // The pack switcher (pack-browser.js) renders the pack list itself.

  // #lm-uninstall-pack belongs to the pack switcher (pack-browser.js).
  const activePack = getActivePack();
  $("#lm-edit-pack").disabled = !activePack;
  $("#lm-export-pack").disabled = !activePack;

  const groupTabs = $("#lm-palette-tabs");
  groupTabs.replaceChildren();
  renderAiButton();
  if (!hasAiGroup()) view.aiActive = false;
  if (hasAiGroup()) {
    const aiTab = createTabButton("lazymod-tab lazymod-ai-tab", AI_GROUP_LABEL, view.aiActive, () => {
      view.aiActive = true;
      renderPaletteView();
    });
    aiTab.dataset.state = getAnalysisPhase();
    aiTab.title = "AI suggestions for this page's image";
    groupTabs.appendChild(aiTab);
  }
  if (!activePack) {
    renderCategoriesUI();
    return;
  }

  const groupNames = Object.keys(activePack.groups);
  if (!groupNames.includes(paletteData.activeGroup)) {
    paletteData.activeGroup = groupNames[0];
  }
  groupNames.forEach((groupName) => {
    groupTabs.appendChild(
      createTabButton("lazymod-tab", groupName, !view.aiActive && groupName === paletteData.activeGroup, () => {
        view.aiActive = false;
        selectGroup(groupName);
        renderPalettePanel();
      }),
    );
  });
  renderCategoriesUI();
}

// --- Search ---

function setPaletteSearchQuery(query) {
  view.searchQuery = query;
  $("#lm-palette-search").value = query;
  view.highlightedResult = 0;
  renderUserChips();
}

function resetTypeBuffer() {
  view.typeBuffer = "";
  clearTimeout(view.typeResetTimer);
}

function addHighlightedResult() {
  const result = searchActivePack(view.searchQuery)[view.highlightedResult];
  if (result) addTagToMain(result.tag);
}

/** Moves the search highlight; returns false when there are no results. */
function moveHighlight(direction) {
  const results = searchActivePack(view.searchQuery);
  if (results.length === 0) return false;
  view.highlightedResult = (view.highlightedResult + direction + results.length) % results.length;
  renderUserChips();
  return true;
}

function handleSearchInputKeydown(event) {
  if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") setPaletteSearchQuery("");
  else if (event.key === "Enter") addHighlightedResult();
  else moveHighlight(event.key === "ArrowDown" ? 1 : -1);
}

function shouldIgnoreTypeToSearch(event) {
  return (
    event.isComposing ||
    !state.extensionEnabled ||
    shell.windowEl.hidden ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.composedPath().some(isEditableTarget) ||
    isEditableTarget(document.activeElement) ||
    isEditableTarget(shell.root.activeElement) ||
    state.elementPickerActive ||
    state.recordingShortcut ||
    state.focusModeActive
  );
}

/** Typing anywhere on the page (outside inputs) starts a palette search. */
function handleTypeToSearch(event) {
  if (shouldIgnoreTypeToSearch(event)) return;

  const consume = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (event.key === "Escape" && view.searchQuery) {
    consume();
    resetTypeBuffer();
    setPaletteSearchQuery("");
    return;
  }
  if (event.key === "Backspace" && view.searchQuery) {
    consume();
    view.typeBuffer = view.typeBuffer.slice(0, -1);
    setPaletteSearchQuery(view.searchQuery.slice(0, -1));
    clearTimeout(view.typeResetTimer);
    return;
  }
  if (event.key === "Enter" && view.searchQuery) {
    consume();
    addHighlightedResult();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (searchActivePack(view.searchQuery).length === 0) return;
    consume();
    moveHighlight(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key.length !== 1) return;

  consume();
  if (!isMainTabActive()) showMainTab();
  setTaggerCollapsed(false);
  view.typeBuffer = `${view.typeBuffer}${event.key}`;
  setPaletteSearchQuery(view.typeBuffer);
  clearTimeout(view.typeResetTimer);
  view.typeResetTimer = setTimeout(() => {
    view.typeBuffer = "";
  }, TYPE_TO_SEARCH_RESET_MS);
}

// --- Pack controls ---

async function handleImportPack(event) {
  // The input is in the shadow root: browsers clear event.target after
  // dispatch, so keep a reference for the reset after the await.
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  try {
    await importPackFile(file);
    renderPalettePanel();
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not import palette JSON:`, error);
    alert(`Could not import palette JSON: ${error.message}`);
  } finally {
    input.value = "";
  }
}

function handleToggleVisibleTags() {
  const visibleTags = getVisibleTags();
  if (visibleTags.length === 0) return;
  const current = getMainTags();
  const allSelected = visibleTags.every((tag) => current.includes(tag));
  setMainTags(allSelected ? current.filter((tag) => !visibleTags.includes(tag)) : [...new Set([...current, ...visibleTags])]);
}

export function initPalettePanel() {
  const searchInput = $("#lm-palette-search");
  searchInput.addEventListener("input", () => {
    resetTypeBuffer();
    setPaletteSearchQuery(searchInput.value);
  });
  searchInput.addEventListener("keydown", handleSearchInputKeydown);
  document.addEventListener("keydown", handleTypeToSearch, true);

  $("#lm-flat-view").onchange = (event) => {
    view.flatView = event.target.checked;
    renderCategoriesUI();
  };

  $("#lm-edit-pack").onclick = () => {
    if (!getActivePack()) return;
    requestExtensionPage({ action: MESSAGE_ACTIONS.openPaletteEditor, packId: state.paletteData.activePackId }, "Could not open the editor");
  };

  $$(".lazymod-palette-scroller").forEach((scroller) => {
    enableWheelScrolling(scroller);
    attachScrollArrows(scroller);
  });

  $("#lm-import-pack").onclick = () => $("#lm-pack-file").click();
  $("#lm-pack-file").onchange = handleImportPack;
  $("#lm-export-pack").onclick = exportActivePack;
  $("#lm-add-all-palette").onclick = handleToggleVisibleTags;
  // AI: analyze the page image and show the AI group.
  $("#lm-fetch-ai").onclick = () => {
    view.aiActive = true;
    // Show the AI group, not search results.
    resetTypeBuffer();
    view.searchQuery = "";
    $("#lm-palette-search").value = "";
    startAnalysis();
    renderPaletteView();
  };
  on(EVENTS.aiSuggestionsChanged, () => renderPaletteView());
  on(EVENTS.blacklistChanged, () => {
    if (view.aiActive) renderUserChips();
  });

  on(EVENTS.tagsChanged, () => {
    syncChipStates($("#lm-user-chips"), getMainTags());
    updatePaletteToggleButton();
  });
  // Pack or group switched in another view (Focus Mode palette).
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== "tagger") renderPalettePanel({ notify: false });
  });

  // Palette edits from the editor page or other tabs.
  onLocalStorageChange((changes) => {
    const updated = decodePaletteData(changes[STORAGE_KEYS.palettes]?.newValue);
    if (!updated || !updated.packs) return;
    state.paletteData = updated;
    renderPalettePanel();
  });
}
