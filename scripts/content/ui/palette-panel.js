// Palette view: pack selector, group/category tabs, tag chips, fuzzy search,
// and type-to-search when focus is outside an editable field.
import { LOG_PREFIX, STORAGE_KEYS, MESSAGE_ACTIONS } from "../../shared/constants.js";
import { onLocalStorageChange } from "../../shared/storage.js";
import { state } from "../state.js";
import { on, EVENTS } from "../events.js";
import { addTagToMain, getMainTags, isEditableTarget, setMainTags } from "../page.js";
import { requestExtensionPage } from "../messaging.js";
import {
  deleteActivePack,
  exportActivePack,
  getActivePack,
  getVisiblePaletteTags,
  importPackFile,
  searchActivePack,
  selectCategory,
  selectGroup,
  selectPack,
} from "../palettes.js";
import { $, $$, shell, setIconPath, ICON_PATHS } from "./shell.js";
import { createEmptyMessage, createTagChip, syncChipStates } from "./chips.js";
import { isMainTabActive, showMainTab } from "./tabs.js";
import { setTaggerCollapsed } from "./window-controls.js";
import { attachScrollArrows } from "./scroll-arrows.js";

const TYPE_TO_SEARCH_RESET_MS = 1000;
const NO_PACKS_MESSAGE = "No tag packs. Import a JSON pack to get started.";

const view = {
  flatView: false,
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

// --- Rendering ---

function updatePaletteToggleButton() {
  const button = $("#lm-add-all-palette");
  if (!button) return;
  if (view.searchQuery) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  const visibleTags = getVisiblePaletteTags(view.flatView);
  const mainTags = getMainTags();
  const allSelected = visibleTags.length > 0 && visibleTags.every((tag) => mainTags.includes(tag));

  button.querySelector("span").textContent = allSelected ? "Remove tags" : "Add tags";
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
  const tags = searchResults ? searchResults.map((result) => result.tag) : getVisiblePaletteTags(view.flatView);
  const hasPack = Boolean(getActivePack());

  if (searchResults && searchResults.length === 0) {
    container.appendChild(createEmptyMessage(hasPack ? "No matching tags found." : NO_PACKS_MESSAGE));
  } else if (!hasPack) {
    container.appendChild(createEmptyMessage(NO_PACKS_MESSAGE));
  }

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

/** Re-renders the whole palette view from `state.paletteData`. */
export function renderPalettePanel() {
  const paletteData = state.paletteData;
  paletteData.packs = paletteData.packs || {};
  const packSelect = $("#lm-pack-select");
  packSelect.replaceChildren();
  Object.entries(paletteData.packs).forEach(([packId, pack]) => {
    const option = document.createElement("option");
    option.value = packId;
    option.textContent = pack.name;
    option.selected = packId === paletteData.activePackId;
    packSelect.appendChild(option);
  });

  const activePack = getActivePack();
  const deletePackButton = $("#lm-delete-pack");
  deletePackButton.disabled = !activePack;
  deletePackButton.title = activePack ? `Delete ${activePack.name}` : "No tag pack to delete";
  $("#lm-edit-pack").disabled = !activePack;
  $("#lm-export-pack").disabled = !activePack;

  const groupTabs = $("#lm-palette-tabs");
  groupTabs.replaceChildren();
  if (!activePack) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No tag packs";
    option.selected = true;
    packSelect.appendChild(option);
    renderCategoriesUI();
    return;
  }

  const groupNames = Object.keys(activePack.groups);
  if (!groupNames.includes(paletteData.activeGroup)) {
    paletteData.activeGroup = groupNames[0];
  }
  groupNames.forEach((groupName) => {
    groupTabs.appendChild(
      createTabButton("lazymod-tab", groupName, groupName === paletteData.activeGroup, () => {
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
    state.recordingGhostShortcut
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

async function handleDeletePack() {
  const pack = getActivePack();
  if (!pack) {
    alert("Could not delete palette: the active palette does not exist.");
    return;
  }
  if (!confirm(`Delete the palette "${pack.name}"? This action cannot be undone.`)) return;
  try {
    await deleteActivePack();
    renderPalettePanel();
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not delete palette:`, error);
    alert(`Could not delete palette: ${error.message}`);
  }
}

async function handleImportPack(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await importPackFile(file);
    renderPalettePanel();
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not import palette JSON:`, error);
    alert(`Could not import palette JSON: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function handleToggleVisibleTags() {
  const visibleTags = getVisiblePaletteTags(view.flatView);
  if (visibleTags.length === 0) return;
  const current = getMainTags();
  const allSelected = visibleTags.every((tag) => current.includes(tag));
  setMainTags(allSelected ? current.filter((tag) => !visibleTags.includes(tag)) : [...new Set([...current, ...visibleTags])]);
}

/** Horizontal tab strips scroll with the vertical mouse wheel. */
function enableWheelScrolling(scroller) {
  scroller.addEventListener(
    "wheel",
    (event) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      event.preventDefault();
      scroller.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    },
    { passive: false },
  );
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

  $("#lm-pack-select").onchange = (event) => {
    if (selectPack(event.target.value)) renderPalettePanel();
  };
  $("#lm-delete-pack").onclick = handleDeletePack;
  $("#lm-import-pack").onclick = () => $("#lm-pack-file").click();
  $("#lm-pack-file").onchange = handleImportPack;
  $("#lm-export-pack").onclick = exportActivePack;
  $("#lm-add-all-palette").onclick = handleToggleVisibleTags;

  on(EVENTS.tagsChanged, () => {
    syncChipStates($("#lm-user-chips"), getMainTags());
    updatePaletteToggleButton();
  });

  // Palette edits from the editor page or other tabs.
  onLocalStorageChange((changes) => {
    const updated = changes[STORAGE_KEYS.palettes]?.newValue;
    if (!updated || !updated.packs) return;
    state.paletteData = updated;
    renderPalettePanel();
  });
}
