// Editor page entry. Modes (URL query):
//   ?packId=<id>         tag pack (JSON or easyJson)
//   ?mode=site-configs   site profiles JSON
//   ?mode=ai-blacklist   AI blacklist JSON
import { LOG_PREFIX, STORAGE_KEYS, DEFAULT_AI_BLACKLIST, createDefaultSiteConfigs } from "./shared/constants.js";
import { normalizePalettePack, serializePalettePack } from "./shared/palette.js";
import { normalizeSiteConfigs } from "./shared/site-configs.js";
import { normalizeTagList } from "./shared/tags.js";
import { parsePaletteEasy, serializePaletteEasy } from "./editor/easy-json.js";
import { createCodeEditor } from "./editor/code-editor.js";

const params = new URLSearchParams(window.location.search);
const packId = params.get("packId");
const editorMode = params.get("mode") || "palette";

const textarea = document.querySelector("#palette-json");
const paletteName = document.querySelector("#palette-name");
const status = document.querySelector("#editor-status");
const saveButton = document.querySelector("#save-button");
const formatButton = document.querySelector("#format-button");
const formatLabel = document.querySelector("#format-label");
const wordWrapToggle = document.querySelector("#word-wrap-toggle");
const easyJsonToggle = document.querySelector("#easy-json-toggle");
const editorTitle = document.querySelector("#editor-title");
const editorFooterNote = document.querySelector("#editor-footer-note");
const editorFormatLabel = document.querySelector(".editor-meta > span");

const editor = createCodeEditor({
  container: document.querySelector(".code-editor"),
  textarea,
  lineNumbers: document.querySelector("#line-numbers"),
  activeLine: document.querySelector("#active-line"),
});

let paletteData;
let currentPack;
let dirty = false;
let easyJsonMode = false;
let draftPaletteName = "";

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function markDirty() {
  dirty = true;
  setStatus("Unsaved changes", "dirty");
}

function enableEditing() {
  textarea.disabled = false;
  saveButton.disabled = false;
  formatButton.disabled = false;
  textarea.focus();
  setStatus("Ready");
}

/** Saves `values` to storage, disabling Save meanwhile and reporting the result. */
async function persist(values, { failureLabel, savedMessage, onSaved }) {
  saveButton.disabled = true;
  setStatus("Saving…");
  try {
    await chrome.storage.local.set(values);
    onSaved();
    dirty = false;
    setStatus(savedMessage, "saved");
  } catch (error) {
    setStatus(`${failureLabel}: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
  }
}

function invalidInputMessage(error) {
  return easyJsonMode ? `Invalid easyJson: ${error.message}` : `Invalid palette JSON: ${error.message}`;
}

// --- Palette mode ---

function setPaletteEditorContent(pack = currentPack) {
  editor.setValue(easyJsonMode ? serializePaletteEasy(pack) : serializePalettePack(pack));
  editorFormatLabel.textContent = easyJsonMode ? "EASYJSON" : "JSON";
  formatLabel.textContent = easyJsonMode ? "Format easyJson" : "Format JSON";
}

/**
 * Legacy fallback for the pre-1.1 "builtin-import" pack. `data/import.json` is
 * no longer bundled (current defaults are data/character.json and
 * data/anthro.json), so this normally ends in a clear, non-fatal error.
 */
async function loadLegacyStarterPalette() {
  const unavailable = "This legacy starter palette is no longer bundled. Import a JSON tag pack in the tagger instead.";
  // Chrome rejects fetch() for a missing packaged file; Firefox resolves it
  // and rejects while reading the body (AbortError). Handle both.
  try {
    const response = await fetch(chrome.runtime.getURL("data/import.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`${LOG_PREFIX} Legacy starter palette unavailable.`, error);
    throw new Error(unavailable);
  }
}

async function loadPack() {
  if (!packId) throw new Error("Missing palette ID in the editor URL.");

  const stored = await chrome.storage.local.get([STORAGE_KEYS.palettes, STORAGE_KEYS.builtinPaletteOverride]);
  const savedPalettes = stored[STORAGE_KEYS.palettes];
  paletteData =
    savedPalettes && savedPalettes.packs
      ? { ...savedPalettes, packs: { ...savedPalettes.packs } }
      : { ...(savedPalettes || {}), packs: {}, activePackId: packId };

  // Legacy sources: the pre-pack built-in palette override and `folders` data.
  let sourcePack = paletteData.packs[packId];
  if (packId === "builtin-import" && stored[STORAGE_KEYS.builtinPaletteOverride]) {
    sourcePack = stored[STORAGE_KEYS.builtinPaletteOverride];
  }
  if (!sourcePack && packId === "legacy-saved" && paletteData.folders) {
    sourcePack = { name: "My palettes", groups: paletteData.folders };
  }
  if (!sourcePack && packId === "builtin-import") {
    sourcePack = await loadLegacyStarterPalette();
  }
  if (!sourcePack) throw new Error("The selected palette could not be found.");

  currentPack = normalizePalettePack(sourcePack, "Untitled palette");
  draftPaletteName = currentPack.name;
  paletteData.packs[packId] = currentPack;
  paletteData.activePackId = packId;
  paletteName.textContent = currentPack.name;
  setPaletteEditorContent();
  easyJsonToggle.hidden = false;
  enableEditing();
}

function parseCurrentPack() {
  return easyJsonMode ? parsePaletteEasy(textarea.value, draftPaletteName) : normalizePalettePack(JSON.parse(textarea.value), currentPack.name);
}

/** Keeps the tagger's active group/category valid after the pack changed. */
function withValidActiveLocation(nextData, pack) {
  if (nextData.activePackId !== packId) return nextData;
  const activeGroup = pack.groups[nextData.activeGroup] ? nextData.activeGroup : Object.keys(pack.groups)[0];
  const activeCategory = pack.groups[activeGroup][nextData.activeCategory] ? nextData.activeCategory : Object.keys(pack.groups[activeGroup])[0];
  return { ...nextData, activeGroup, activeCategory };
}

async function savePalette() {
  let updatedPack;
  try {
    updatedPack = parseCurrentPack();
  } catch (error) {
    setStatus(invalidInputMessage(error), "error");
    textarea.focus();
    return;
  }

  const nextData = withValidActiveLocation(
    {
      ...paletteData,
      packs: { ...paletteData.packs, [packId]: updatedPack },
      activePackId: paletteData.activePackId || packId,
    },
    updatedPack,
  );
  const values = { [STORAGE_KEYS.palettes]: nextData };
  if (packId === "builtin-import") values[STORAGE_KEYS.builtinPaletteOverride] = updatedPack;

  await persist(values, {
    failureLabel: "Could not save palette",
    savedMessage: "Saved · tagger updated",
    onSaved: () => {
      paletteData = nextData;
      currentPack = updatedPack;
      draftPaletteName = updatedPack.name;
      paletteName.textContent = updatedPack.name;
      setPaletteEditorContent(updatedPack);
    },
  });
}

function toggleEasyJson() {
  try {
    const updatedPack = easyJsonMode
      ? parsePaletteEasy(textarea.value, draftPaletteName)
      : normalizePalettePack(JSON.parse(textarea.value), draftPaletteName || currentPack.name);
    draftPaletteName = updatedPack.name;
    easyJsonMode = !easyJsonMode;
    setPaletteEditorContent(updatedPack);
    easyJsonToggle.setAttribute("aria-pressed", String(easyJsonMode));
    easyJsonToggle.textContent = `easyJson: ${easyJsonMode ? "On" : "Off"}`;
    setStatus(dirty ? "Unsaved changes" : "Ready", dirty ? "dirty" : "");
  } catch (error) {
    setStatus(invalidInputMessage(error), "error");
  }
  textarea.focus();
}

// --- Site profiles mode ---

async function loadSiteConfigs() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.siteConfigs);
  const siteConfigs = normalizeSiteConfigs(stored[STORAGE_KEYS.siteConfigs] || createDefaultSiteConfigs());
  document.title = "QuickTag Settings Editor";
  editorTitle.textContent = "Settings editor";
  paletteName.textContent = "URL patterns and page selectors";
  editorFooterNote.textContent = "Save to apply these URL profiles and selectors to the tagger.";
  editor.setValue(JSON.stringify(siteConfigs, null, 2));
  enableEditing();
}

async function saveSiteConfigs() {
  let updatedConfigs;
  try {
    updatedConfigs = normalizeSiteConfigs(JSON.parse(textarea.value));
  } catch (error) {
    setStatus(`Invalid settings JSON: ${error.message}`, "error");
    textarea.focus();
    return;
  }
  await persist(
    { [STORAGE_KEYS.siteConfigs]: updatedConfigs },
    {
      failureLabel: "Could not save settings",
      savedMessage: "Saved · settings updated",
      onSaved: () => editor.setValue(JSON.stringify(updatedConfigs, null, 2)),
    },
  );
}

// --- AI blacklist mode ---

function normalizeAiBlacklist(rawBlacklist) {
  if (!Array.isArray(rawBlacklist)) {
    throw new Error("The AI blacklist must be a JSON array of tag strings.");
  }
  if (rawBlacklist.some((tag) => typeof tag !== "string")) {
    throw new Error("Every AI blacklist entry must be a string.");
  }
  return normalizeTagList(rawBlacklist);
}

async function loadAiBlacklist() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.aiBlacklist);
  const blacklist = normalizeAiBlacklist(stored[STORAGE_KEYS.aiBlacklist] ?? [...DEFAULT_AI_BLACKLIST]);
  document.title = "QuickTag AI Blacklist Editor";
  editorTitle.textContent = "AI blacklist editor";
  paletteName.textContent = `${blacklist.length} excluded tags`;
  editorFooterNote.textContent = "Tags in this list are always hidden from AI suggestions. Save to update the tagger.";
  editor.setValue(JSON.stringify(blacklist, null, 2));
  enableEditing();
}

async function saveAiBlacklist() {
  let updatedBlacklist;
  try {
    updatedBlacklist = normalizeAiBlacklist(JSON.parse(textarea.value));
  } catch (error) {
    setStatus(`Invalid AI blacklist JSON: ${error.message}`, "error");
    textarea.focus();
    return;
  }
  await persist(
    { [STORAGE_KEYS.aiBlacklist]: updatedBlacklist },
    {
      failureLabel: "Could not save AI blacklist",
      savedMessage: "Saved · AI blacklist updated",
      onSaved: () => {
        editor.setValue(JSON.stringify(updatedBlacklist, null, 2));
        paletteName.textContent = `${updatedBlacklist.length} excluded tags`;
      },
    },
  );
}

// --- Shared commands ---

const MODES = {
  palette: { load: loadPack, save: savePalette },
  "site-configs": { load: loadSiteConfigs, save: saveSiteConfigs },
  "ai-blacklist": { load: loadAiBlacklist, save: saveAiBlacklist },
};
const mode = MODES[editorMode] || MODES.palette;

function formatDocument() {
  const isEasyJson = editorMode === "palette" && easyJsonMode;
  try {
    editor.setValue(isEasyJson ? serializePaletteEasy(parsePaletteEasy(textarea.value, draftPaletteName)) : JSON.stringify(JSON.parse(textarea.value), null, 2));
    markDirty();
    setStatus(`${isEasyJson ? "easyJson" : "JSON"} formatted · unsaved changes`, "dirty");
    textarea.focus();
  } catch (error) {
    setStatus(`Invalid ${isEasyJson ? "easyJson" : "JSON"}: ${error.message}`, "error");
  }
}

easyJsonToggle.addEventListener("click", toggleEasyJson);

wordWrapToggle.addEventListener("click", () => {
  const isWrapped = wordWrapToggle.getAttribute("aria-pressed") !== "true";
  wordWrapToggle.setAttribute("aria-pressed", String(isWrapped));
  wordWrapToggle.textContent = `Word wrap: ${isWrapped ? "On" : "Off"}`;
  editor.setWordWrap(isWrapped);
});

textarea.addEventListener("input", markDirty);
textarea.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  editor.insertIndent();
  markDirty();
});
saveButton.addEventListener("click", mode.save);
formatButton.addEventListener("click", formatDocument);

document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;
  if (event.key.toLowerCase() === "s" || event.key === "Enter") {
    event.preventDefault();
    mode.save();
  } else if (event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    formatDocument();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

mode.load().catch((error) => {
  console.error(`${LOG_PREFIX} Could not load palette editor:`, error);
  paletteName.textContent = "Editor unavailable";
  setStatus(error.message, "error");
});
