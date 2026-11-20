// Focus Mode layout JSON dialog: view, edit, format, apply, import, export,
// and reset the layout configuration (see shared/focus-layout.js).
import { LOG_PREFIX } from "../../shared/constants.js";
import { createDefaultFocusLayout, normalizeFocusLayout } from "../../shared/focus-layout.js";
import { downloadJsonFile } from "../page.js";
import { el, button, ICONS } from "./dom.js";

export function createLayoutDialog(api) {
  const textarea = el("textarea", { className: "lazymod-input lm-focus-json", attrs: { spellcheck: "false", "aria-label": "Layout JSON" } });
  const status = el("p", { className: "lm-focus-status", attrs: { role: "status", "aria-live": "polite" }, hidden: true });
  const fileInput = el("input", { attrs: { type: "file", accept: ".json,application/json" }, hidden: true });
  const applyButton = button("Apply", { className: "lazymod-btn lazymod-btn-accent", title: "Validate and save this layout" });
  const formatButton = button("Format", { title: "Format the JSON" });
  const importButton = button("Import", { iconPath: ICONS.upload, title: "Load a layout JSON file" });
  const exportButton = button("Export", { iconPath: ICONS.download, title: "Download the saved layout as JSON" });
  const resetButton = button("Reset to defaults", { iconPath: ICONS.reset, className: "lazymod-btn lazymod-btn-danger", title: "Restore the built-in presets" });
  const closeButton = button("", { iconPath: ICONS.close, className: "lazymod-btn lm-focus-icon-btn", title: "Close", attrs: { "aria-label": "Close layout editor" } });

  const dialog = el("div", { className: "lm-focus-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "lm-focus-layout-title" } }, [
    el("div", { className: "lm-focus-panel-header" }, [el("h2", { className: "lazymod-title", id: "lm-focus-layout-title", text: "Layout JSON" }), closeButton]),
    el("p", {
      className: "lm-focus-hint",
      text: 'Presets place the panels "topbar", "image", "tags", and "palette" on a grid: "areas" lists the rows, "columns" and "rows" are CSS grid track sizes, and "panels" sets visibility. "activePreset" selects the preset shown.',
    }),
    textarea,
    status,
    el("div", { className: "lm-focus-toolbar lm-focus-dialog-actions" }, [applyButton, formatButton, importButton, exportButton, resetButton, fileInput]),
  ]);
  const element = el("div", { className: "lm-focus-backdrop", hidden: true }, [dialog]);

  let release = null;

  function setStatus(message, statusState = "info") {
    status.textContent = message;
    status.dataset.state = statusState;
    status.hidden = !message;
  }

  function showLayout(layout) {
    textarea.value = JSON.stringify(layout, null, 2);
  }

  function close() {
    element.hidden = true;
    release?.();
    release = null;
  }

  async function apply(rawText, successMessage) {
    try {
      const layout = await api.saveLayout(JSON.parse(rawText));
      showLayout(layout);
      setStatus(successMessage, "success");
    } catch (error) {
      setStatus(error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : error.message, "error");
    }
  }

  applyButton.addEventListener("click", () => apply(textarea.value, "Layout saved and applied."));
  formatButton.addEventListener("click", () => {
    try {
      showLayout(JSON.parse(textarea.value));
      setStatus("");
    } catch (error) {
      setStatus(`Invalid JSON: ${error.message}`, "error");
    }
  });
  exportButton.addEventListener("click", () => downloadJsonFile("quicktag-focus-layout.json", api.getLayout()));
  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      // Validate before replacing the editor content.
      normalizeFocusLayout(JSON.parse(text));
      textarea.value = text;
      await apply(text, `Imported ${file.name}.`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Could not import the Focus Mode layout.`, error);
      setStatus(`Could not import ${file.name}: ${error.message}`, "error");
    }
  });
  resetButton.addEventListener("click", () => {
    if (!confirm("Replace the Focus Mode layout with the built-in presets?")) return;
    apply(JSON.stringify(createDefaultFocusLayout()), "Default layout restored.");
  });
  closeButton.addEventListener("click", close);
  // Ctrl/Cmd+Enter applies; Tab inserts two spaces.
  textarea.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      applyButton.click();
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
    }
  });
  element.addEventListener("pointerdown", (event) => {
    if (event.target === element) close();
  });

  return {
    element,
    open() {
      showLayout(api.getLayout());
      setStatus("");
      element.hidden = false;
      if (!release) release = api.pushDismissable(close);
      textarea.focus();
    },
    close,
  };
}
