// Focus Mode "Customize": move panels (swap with the neighbor in a direction)
// and make them larger or smaller, directly on the grid, then optionally save
// the result as a new named layout. Edits are saved to the active preset in
// the layout JSON (`lazymod_focus_layout`); the pure transforms live in
// shared/focus-layout.js. Receives the controller's `api`.
import { FOCUS_PANELS, addPresetCopy, neighborPanel, resizePanel, swapPanels } from "../../shared/focus-layout.js";
import { el, button, ICONS } from "./dom.js";

const PANEL_LABELS = Object.freeze({ topbar: "Top bar", image: "Image", tags: "Tags", palette: "Palette" });
const MOVES = Object.freeze([
  ["left", "←", "Move left"],
  ["up", "↑", "Move up"],
  ["down", "↓", "Move down"],
  ["right", "→", "Move right"],
]);
const SIZES = Object.freeze([
  ["columns", -1, "Width −", "Narrower"],
  ["columns", 1, "Width +", "Wider"],
  ["rows", -1, "Height −", "Shorter"],
  ["rows", 1, "Height +", "Taller"],
]);

export function createLayoutEditor(api, panels) {
  let editing = false;
  let unregisterDismiss = null;

  const customizeButton = button("Customize", {
    iconPath: ICONS.layout,
    className: "lazymod-btn lm-focus-customize",
    title: "Move and resize panels, and save the arrangement as a layout",
    attrs: { "aria-pressed": "false" },
  });
  const nameInput = el("input", {
    className: "lazymod-input lm-focus-layout-name",
    attrs: { type: "text", maxlength: "60", placeholder: "Layout name", "aria-label": "Name for the new layout", spellcheck: "false" },
  });
  const saveButton = button("Save as new layout", { iconPath: ICONS.download, className: "lazymod-btn lazymod-btn-accent", title: "Add the current arrangement to the layout list" });
  const doneButton = button("Done", { className: "lazymod-btn", title: "Stop customizing (Esc)" });
  const hint = el("span", { className: "lm-focus-hint lm-focus-edit-hint" });
  const toolbar = el("div", { className: "lm-focus-edit-toolbar", hidden: true }, [hint, nameInput, saveButton, doneButton]);

  const strips = {};
  FOCUS_PANELS.forEach((panelId) => {
    const moveButtons = MOVES.map(([direction, arrow, label]) =>
      el("button", { className: "lazymod-btn lm-focus-edit-move", text: arrow, dataset: { direction }, attrs: { type: "button", "aria-label": label } }),
    );
    const sizeButtons = SIZES.map(([axis, step, text, label]) =>
      el("button", { className: "lazymod-btn lm-focus-edit-size", text, dataset: { axis, step: String(step) }, attrs: { type: "button", "aria-label": label } }),
    );
    const strip = el("div", { className: "lm-focus-edit-strip", hidden: true, dataset: { panel: panelId } }, [
      el("strong", { className: "lm-focus-edit-label", text: PANEL_LABELS[panelId] }),
      el("div", { className: "lm-focus-edit-group", attrs: { role: "group", "aria-label": `Move ${PANEL_LABELS[panelId]}` } }, moveButtons),
      el("div", { className: "lm-focus-edit-group", attrs: { role: "group", "aria-label": `Resize ${PANEL_LABELS[panelId]}` } }, sizeButtons),
    ]);
    moveButtons.forEach((moveButton) => moveButton.addEventListener("click", () => move(panelId, moveButton.dataset.direction)));
    sizeButtons.forEach((sizeButton) => sizeButton.addEventListener("click", () => resize(panelId, sizeButton.dataset.axis, Number(sizeButton.dataset.step))));
    strips[panelId] = { strip, moveButtons, sizeButtons };
    panels[panelId].element.prepend(strip);
  });

  function activePreset() {
    const layout = api.getLayout();
    return { layout, preset: layout.presets[layout.activePreset] };
  }

  async function commit(nextPreset, message) {
    const { layout } = activePreset();
    layout.presets[layout.activePreset] = nextPreset;
    try {
      await api.saveLayout(layout);
      api.setStatus(message);
    } catch (error) {
      api.setStatus(`Could not change the layout: ${error.message}`, "error");
    }
  }

  function move(panelId, direction) {
    const { preset } = activePreset();
    const other = neighborPanel(preset, panelId, direction);
    const next = other && swapPanels(preset, panelId, other);
    if (next) commit(next, `${PANEL_LABELS[panelId]} and ${PANEL_LABELS[other]} swapped places.`);
  }

  function resize(panelId, axis, step) {
    const next = resizePanel(activePreset().preset, panelId, axis, step);
    if (next) commit(next, `${PANEL_LABELS[panelId]} is ${axis === "columns" ? (step > 0 ? "wider" : "narrower") : step > 0 ? "taller" : "shorter"}.`);
  }

  async function saveAsNew() {
    const { layout, preset } = activePreset();
    try {
      const next = addPresetCopy(layout, preset, nameInput.value || `${preset.name} (custom)`);
      await api.saveLayout(next);
      nameInput.value = "";
      api.setStatus(`Saved layout "${next.presets[next.activePreset].name}". Select it from the Layout list any time.`, "success");
    } catch (error) {
      api.setStatus(`Could not save the layout: ${error.message}`, "error");
    }
  }

  /** Updates which moves and sizes are possible for the active preset. */
  function refresh() {
    if (!editing) return;
    const { preset } = activePreset();
    hint.textContent = `Changes are saved to "${preset.name}".`;
    FOCUS_PANELS.forEach((panelId) => {
      const { moveButtons, sizeButtons } = strips[panelId];
      moveButtons.forEach((moveButton) => {
        const other = neighborPanel(preset, panelId, moveButton.dataset.direction);
        moveButton.disabled = !other;
        moveButton.title = other ? `${moveButton.getAttribute("aria-label")}: swap with ${PANEL_LABELS[other]}` : `${moveButton.getAttribute("aria-label")}: no panel there`;
      });
      sizeButtons.forEach((sizeButton) => {
        const possible = Boolean(resizePanel(preset, panelId, sizeButton.dataset.axis, Number(sizeButton.dataset.step)));
        sizeButton.disabled = !possible;
        sizeButton.title = possible ? sizeButton.getAttribute("aria-label") : `${sizeButton.getAttribute("aria-label")}: not possible for this panel in this layout`;
      });
    });
  }

  function setEditing(next) {
    if (editing === next) return;
    editing = next;
    api.root.dataset.editing = String(editing);
    customizeButton.setAttribute("aria-pressed", String(editing));
    toolbar.hidden = !editing;
    FOCUS_PANELS.forEach((panelId) => {
      strips[panelId].strip.hidden = !editing;
    });
    if (editing) {
      // Esc leaves customizing before it exits Focus Mode.
      unregisterDismiss = api.pushDismissable(() => setEditing(false));
      refresh();
    } else {
      unregisterDismiss?.();
      unregisterDismiss = null;
    }
  }

  customizeButton.addEventListener("click", () => setEditing(!editing));
  doneButton.addEventListener("click", () => setEditing(false));
  saveButton.addEventListener("click", saveAsNew);
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveAsNew();
  });

  return { button: customizeButton, toolbar, refresh, setEditing };
}
