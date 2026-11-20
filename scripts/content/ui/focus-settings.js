// Focus Mode section in the tagger's Settings view: open, shortcuts, strict
// capture, layout JSON. Receives its actions from focus-mode.js.
import { LOG_PREFIX, DEFAULT_FOCUS_SETTINGS } from "../../shared/constants.js";
import { formatShortcut } from "../../shared/shortcuts.js";
import { $ } from "./shell.js";
import { setConfigStatus } from "./status.js";
import { createShortcutRecorder } from "./shortcut-recorder.js";

export function initFocusSettings({ open, openLayoutDialog, getSettings, saveSettings, getScale, getWindowScale, setScale }) {
  const strictInput = $("#lm-focus-strict");
  const scaleFollow = $("#lm-focus-scale-window");
  const scaleSlider = $("#lm-focus-scale");
  const scaleValue = $("#lm-focus-scale-value");

  async function update(changes, successMessage) {
    const next = { ...getSettings(), ...changes };
    if (formatShortcut(next.toggleShortcut) === formatShortcut(next.closeShortcut)) {
      setConfigStatus("The toggle and close shortcuts must be different.", "error");
      render();
      return;
    }
    try {
      await saveSettings({ ...getSettings(), ...changes });
      setConfigStatus(successMessage, "success");
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not save Focus Mode settings.`, error);
      setConfigStatus(`Could not save Focus Mode settings: ${error.message}`, "error");
    }
    render();
  }

  const toggleRecorder = createShortcutRecorder($("#lm-focus-toggle-shortcut"), {
    getShortcut: () => getSettings().toggleShortcut,
    onRecorded: (toggleShortcut) => update({ toggleShortcut }, "Focus Mode toggle shortcut saved."),
  });
  // A bare key (such as the default Esc) is allowed for closing.
  const closeRecorder = createShortcutRecorder($("#lm-focus-close-shortcut"), {
    getShortcut: () => getSettings().closeShortcut,
    onRecorded: (closeShortcut) => update({ closeShortcut }, "Focus Mode close shortcut saved."),
    requireModifier: false,
  });

  function renderScale() {
    const follows = getScale() === "window";
    const scale = follows ? getWindowScale() : getScale();
    scaleFollow.checked = follows;
    scaleSlider.disabled = follows;
    scaleSlider.value = String(scale);
    scaleValue.textContent = `${Math.round(scale * 100)}%`;
  }

  function render() {
    renderScale();
    strictInput.checked = getSettings().strictCapture;
    toggleRecorder.render();
    closeRecorder.render();
  }

  scaleFollow.addEventListener("change", () => {
    setScale(scaleFollow.checked ? "window" : parseFloat(scaleSlider.value));
    renderScale();
  });
  scaleSlider.addEventListener("input", () => {
    scaleValue.textContent = `${Math.round(parseFloat(scaleSlider.value) * 100)}%`;
  });
  scaleSlider.addEventListener("change", () => setScale(parseFloat(scaleSlider.value)));

  $("#lm-focus-open").addEventListener("click", open);
  $("#lm-focus-edit-layout").addEventListener("click", openLayoutDialog);
  strictInput.addEventListener("change", () =>
    update({ strictCapture: strictInput.checked }, strictInput.checked ? "Strict shortcut capture on." : "Strict shortcut capture off."),
  );
  $("#lm-focus-reset-shortcuts").addEventListener("click", () =>
    update(
      { toggleShortcut: { ...DEFAULT_FOCUS_SETTINGS.toggleShortcut }, closeShortcut: { ...DEFAULT_FOCUS_SETTINGS.closeShortcut } },
      "Focus Mode shortcuts reset to Alt + A and Esc.",
    ),
  );

  render();
  return { render };
}
