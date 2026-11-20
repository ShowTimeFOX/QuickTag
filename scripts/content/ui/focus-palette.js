// Focus Mode palette: full-height pack/group browser showing every category of
// the active group, with chips that reflect the Focus Mode tag states.
// Click: not in list → add, active → mute, muted → switch on.
import { formatTag } from "../../shared/tags.js";
import { state } from "../state.js";
import { emit, on, EVENTS } from "../events.js";
import { getActivePack, searchActivePack, selectGroup, selectPack } from "../palettes.js";
import { getTagState, togglePaletteTag } from "../focus-tags.js";
import { el } from "./dom.js";
import { createEmptyMessage, createTagChip } from "./chips.js";
import { attachScrollArrows, enableWheelScrolling } from "./scroll-arrows.js";

const STATE_ICONS = { active: "−", muted: "○", none: "+" };
const STATE_TITLES = { active: "Active: click to mute", muted: "Muted: click to switch on", none: "Click to add" };

function applyChipState(chip) {
  const tagState = getTagState(chip.dataset.tag);
  chip.classList.toggle("active", tagState === "active");
  chip.classList.toggle("muted", tagState === "muted");
  chip.title = `${chip.dataset.location ? `${chip.dataset.location} · ` : ""}${STATE_TITLES[tagState]}`;
  const icon = chip.querySelector(".icon");
  if (icon) icon.textContent = STATE_ICONS[tagState];
}

function chip(tag, location) {
  const element = createTagChip(tag, { onClick: togglePaletteTag });
  if (location) element.dataset.location = location;
  applyChipState(element);
  return element;
}

export function createFocusPalettePanel() {
  const packSelect = el("select", { className: "lazymod-input lm-focus-pack", attrs: { "aria-label": "Tag pack" } });
  const groupTabs = el("div", { className: "lazymod-tabs lazymod-palette-scroller lm-focus-groups", attrs: { role: "tablist", "aria-label": "Folder groups" } });
  const filterInput = el("input", {
    className: "lazymod-input lm-focus-filter",
    attrs: { type: "search", placeholder: "Search this pack…", "aria-label": "Search tags in this pack", autocomplete: "off" },
  });
  const body = el("div", { className: "lm-focus-palette-body" });

  const element = el("section", { className: "lm-focus-panel lm-focus-palette-panel", attrs: { "aria-label": "Palette" } }, [
    el("div", { className: "lm-focus-panel-header" }, [el("h2", { className: "lazymod-title", text: "Palette" }), packSelect]),
    groupTabs,
    filterInput,
    body,
  ]);
  enableWheelScrolling(groupTabs);
  // The strip must be in the DOM before its arrows wrap it.
  attachScrollArrows(groupTabs);

  function renderPacks() {
    const { packs, activePackId } = state.paletteData;
    const entries = Object.entries(packs || {});
    packSelect.replaceChildren(...entries.map(([packId, pack]) => el("option", { text: pack.name, attrs: { value: packId, selected: packId === activePackId } })));
    if (!entries.length) packSelect.appendChild(el("option", { text: "No tag packs", attrs: { value: "", selected: true } }));
    packSelect.disabled = !entries.length;
  }

  function renderGroups(pack) {
    groupTabs.replaceChildren(
      ...Object.keys(pack?.groups || {}).map((groupName) => {
        const isActive = groupName === state.paletteData.activeGroup;
        return el("button", {
          className: `lazymod-tab${isActive ? " active" : ""}`,
          text: groupName,
          attrs: { type: "button", role: "tab", "aria-selected": String(isActive) },
          on: {
            click: () => {
              selectGroup(groupName);
              emit(EVENTS.paletteChanged, { source: "focus" });
              render();
            },
          },
        });
      }),
    );
  }

  function renderBody(pack) {
    body.replaceChildren();
    if (!pack) {
      body.appendChild(createEmptyMessage("No tag packs. Import a JSON pack in the tagger to get started."));
      return;
    }
    const query = filterInput.value.trim();
    if (query) {
      const results = searchActivePack(query);
      const chips = el("div", { className: "lazymod-chips lm-focus-chips" }, results.map((result) => chip(result.tag, `${result.groupName} / ${result.categoryName}`)));
      if (!results.length) chips.appendChild(createEmptyMessage("No matching tags found."));
      body.appendChild(chips);
      return;
    }
    const categories = pack.groups[state.paletteData.activeGroup] || {};
    Object.entries(categories).forEach(([categoryName, tags]) => {
      const cleanTags = [...new Set(tags.map(formatTag).filter(Boolean))];
      body.appendChild(
        el("div", { className: "lm-focus-category" }, [
          el("h3", { className: "lm-focus-category-title", text: categoryName }, [el("span", { className: "lm-focus-meta", text: ` ${cleanTags.length}` })]),
          el("div", { className: "lazymod-chips lm-focus-chips" }, cleanTags.map((tag) => chip(tag, categoryName))),
        ]),
      );
    });
  }

  function render() {
    if (!state.paletteData) return;
    const pack = getActivePack();
    if (pack && !pack.groups[state.paletteData.activeGroup]) {
      state.paletteData.activeGroup = Object.keys(pack.groups)[0];
    }
    renderPacks();
    renderGroups(pack);
    renderBody(pack);
  }

  packSelect.addEventListener("change", () => {
    if (!selectPack(packSelect.value)) return;
    emit(EVENTS.paletteChanged, { source: "focus" });
    render();
  });
  filterInput.addEventListener("input", () => renderBody(getActivePack()));

  on(EVENTS.focusTagsChanged, () => body.querySelectorAll(".lazymod-chip").forEach(applyChipState));
  on(EVENTS.paletteChanged, ({ source }) => {
    if (source !== "focus" && state.focusModeActive) render();
  });

  return { element, render };
}
