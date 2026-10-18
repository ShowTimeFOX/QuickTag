"use strict";

const params = new URLSearchParams(window.location.search);
const packId = params.get("packId");
const editorMode = params.get("mode") || "palette";
const textarea = document.querySelector("#palette-json");
const lineNumbers = document.querySelector("#line-numbers");
const activeLine = document.querySelector("#active-line");
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
const codeEditor = document.querySelector(".code-editor");

const defaultAiBlacklist = [
  "uncensored",
  "censored",
  "furry_with_furry",
  "explicit",
  "yaoi",
  "bara",
  "questionable",
  "hetero",
  "realistic",
  "sensitive",
  "two-tone_fur",
  "watermark",
  "artist_name",
  "pubic_hair",
  "loli",
  "interspecies",
  "furry_with_non-furry",
  "english_text",
];

let paletteData;
let currentPack;
let currentSiteConfigs;
let currentAiBlacklist;
let dirty = false;
let easyJsonMode = false;
let draftPaletteName = "";
let editorLineHeights = [];

function measureWrappedLineHeights(lines) {
  if (!codeEditor.classList.contains("word-wrap")) {
    return lines.map(() => 24);
  }

  const computedStyle = getComputedStyle(textarea);
  const horizontalPadding =
    parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
  const contentWidth = Math.max(1, textarea.clientWidth - horizontalPadding);
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "fixed",
    top: "0",
    left: "-100000px",
    width: `${contentWidth}px`,
    padding: "0",
    border: "0",
    visibility: "hidden",
    fontFamily: computedStyle.fontFamily,
    fontSize: computedStyle.fontSize,
    fontWeight: computedStyle.fontWeight,
    fontStyle: computedStyle.fontStyle,
    letterSpacing: computedStyle.letterSpacing,
    lineHeight: computedStyle.lineHeight,
    tabSize: computedStyle.tabSize,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "normal",
  });

  const lineElements = lines.map((line) => {
    const element = document.createElement("div");
    element.textContent = line || "\u200b";
    Object.assign(element.style, {
      minHeight: "24px",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "normal",
    });
    mirror.appendChild(element);
    return element;
  });
  document.body.appendChild(mirror);
  const lineHeights = lineElements.map((element) =>
    Math.max(24, Math.ceil(element.getBoundingClientRect().height / 24) * 24),
  );
  mirror.remove();
  return lineHeights;
}

function updateLineNumbers() {
  const lines = textarea.value.split("\n");
  editorLineHeights = measureWrappedLineHeights(lines);
  lineNumbers.replaceChildren(
    ...lines.map((_, index) => {
      const lineNumber = document.createElement("span");
      lineNumber.textContent = String(index + 1);
      lineNumber.style.height = `${editorLineHeights[index]}px`;
      return lineNumber;
    }),
  );
  updateActiveLine();
}

function updateActiveLine() {
  const lineIndex = textarea.value.slice(0, textarea.selectionStart).split("\n").length - 1;
  const lineOffset = editorLineHeights
    .slice(0, lineIndex)
    .reduce((total, height) => total + height, 0);
  activeLine.style.height = `${editorLineHeights[lineIndex] || 24}px`;
  activeLine.style.transform = `translateY(${lineOffset - textarea.scrollTop}px)`;
  lineNumbers.style.transform = `translateY(${-textarea.scrollTop}px)`;
}

function setEditorValue(value) {
  textarea.value = value;
  textarea.scrollTop = 0;
  textarea.scrollLeft = 0;
  updateLineNumbers();
}

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function normalizePalettePack(rawData, fallbackName) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new Error("Palette JSON must contain an object.");
  }

  const sourceGroups =
    rawData.groups ||
    rawData.folders ||
    Object.fromEntries(
      Object.entries(rawData).filter(
        ([key]) => !["name", "activeFolder", "activeGroup", "activeCategory"].includes(key),
      ),
    );
  if (!sourceGroups || typeof sourceGroups !== "object" || Array.isArray(sourceGroups)) {
    throw new Error("No folder groups were found in the palette.");
  }

  const groups = {};
  Object.entries(sourceGroups).forEach(([groupName, rawCategories]) => {
    if (Array.isArray(rawCategories)) {
      groups[groupName] = {
        General: rawCategories.filter((tag) => typeof tag === "string"),
      };
      return;
    }
    if (!rawCategories || typeof rawCategories !== "object" || Array.isArray(rawCategories)) {
      return;
    }

    const categories = {};
    Object.entries(rawCategories).forEach(([categoryName, rawTags]) => {
      if (Array.isArray(rawTags)) {
        categories[categoryName] = rawTags.filter((tag) => typeof tag === "string");
      }
    });
    if (Object.keys(categories).length > 0) groups[groupName] = categories;
  });

  if (Object.keys(groups).length === 0) {
    throw new Error("The palette does not contain any groups or tags.");
  }

  return {
    name:
      typeof rawData.name === "string" && rawData.name.trim()
        ? rawData.name.trim()
        : fallbackName,
    groups,
  };
}

function serializePaletteEasy(pack) {
  return Object.entries(pack.groups)
    .map(([groupName, categories]) => {
      const categoryLines = Object.entries(categories).map(
        ([categoryName, tags]) => `  ${categoryName}: ${tags.join(", ")}`,
      );
      return [`${groupName}:`, ...categoryLines].join("\n");
    })
    .join("\n\n");
}

function parsePaletteEasy(text, fallbackName) {
  const groups = {};
  let currentGroup = null;

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;

    const groupMatch = line.match(/^([^:\s][^:\n]*):\s*$/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      if (!currentGroup) throw new Error(`Line ${index + 1}: group name cannot be empty.`);
      groups[currentGroup] ||= {};
      return;
    }

    const categoryMatch = line.match(/^ {2}([^:\n]+):(?:[ \t]*(.*))?$/);
    if (!categoryMatch) {
      throw new Error(
        `Line ${index + 1}: use "Group:" followed by indented "  Category: tag, tag" lines.`,
      );
    }
    if (!currentGroup) {
      throw new Error(`Line ${index + 1}: add a group heading before this category.`);
    }

    const categoryName = categoryMatch[1].trim();
    if (!categoryName) {
      throw new Error(`Line ${index + 1}: category name cannot be empty.`);
    }
    const tags = (categoryMatch[2] || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    groups[currentGroup][categoryName] = tags;
  });

  if (Object.keys(groups).length === 0) {
    throw new Error("Add at least one group and category.");
  }
  if (Object.values(groups).some((categories) => Object.keys(categories).length === 0)) {
    throw new Error("Every group needs at least one indented category line.");
  }

  return normalizePalettePack({ name: fallbackName, groups }, fallbackName);
}

function setPaletteEditorContent(pack = currentPack) {
  setEditorValue(
    easyJsonMode
      ? serializePaletteEasy(pack)
      : JSON.stringify({ name: pack.name, groups: pack.groups }, null, 2),
  );
  editorFormatLabel.textContent = easyJsonMode ? "EASYJSON" : "JSON";
  formatLabel.textContent = easyJsonMode ? "Format easyJson" : "Format JSON";
}

function markDirty() {
  dirty = true;
  setStatus("Unsaved changes", "dirty");
}

async function loadPack() {
  if (!packId) throw new Error("Missing palette ID in the editor URL.");

  const stored = await chrome.storage.local.get([
    "lazymod_global_palettes",
    "lazymod_builtin_palette_override",
  ]);
  paletteData = stored.lazymod_global_palettes;

  if (!paletteData || !paletteData.packs) {
    paletteData = {
      ...(paletteData || {}),
      packs: {},
      activePackId: packId,
    };
  } else {
    paletteData = {
      ...paletteData,
      packs: { ...paletteData.packs },
    };
  }

  let sourcePack = paletteData.packs[packId];
  if (packId === "builtin-import" && stored.lazymod_builtin_palette_override) {
    sourcePack = stored.lazymod_builtin_palette_override;
  }
  if (!sourcePack && packId === "legacy-saved" && paletteData.folders) {
    sourcePack = {
      name: "My palettes",
      groups: paletteData.folders,
    };
  }
  if (!sourcePack && packId === "builtin-import") {
    const response = await fetch(chrome.runtime.getURL("data/import.json"));
    if (!response.ok) throw new Error(`Could not load the starter palette (HTTP ${response.status}).`);
    sourcePack = await response.json();
  }
  if (!sourcePack) throw new Error("The selected palette could not be found.");

  currentPack = normalizePalettePack(sourcePack, "Untitled palette");
  draftPaletteName = currentPack.name;
  paletteData.packs[packId] = currentPack;
  paletteData.activePackId = packId;
  paletteName.textContent = currentPack.name;
  setPaletteEditorContent();
  textarea.disabled = false;
  saveButton.disabled = false;
  formatButton.disabled = false;
  easyJsonToggle.hidden = false;
  textarea.focus();
  setStatus("Ready");
}

function normalizeSiteConfigs(rawConfigs) {
  if (!rawConfigs || typeof rawConfigs !== "object" || Array.isArray(rawConfigs)) {
    throw new Error("URL profiles must be a JSON object.");
  }

  const entries = Object.entries(rawConfigs);
  if (entries.length === 0) throw new Error("At least one URL profile is required.");
  if (!Object.prototype.hasOwnProperty.call(rawConfigs, ".*")) {
    throw new Error('Keep the ".*" fallback profile so the tagger always has a default configuration.');
  }

  const normalized = {};
  entries.forEach(([profileKey, config]) => {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`Profile "${profileKey}" must be an object.`);
    }
    if (config.urlPattern !== undefined && typeof config.urlPattern !== "string") {
      throw new Error(`Profile "${profileKey}" URL pattern must be a string.`);
    }
    const urlPattern =
      typeof config.urlPattern === "string" && config.urlPattern.trim()
        ? config.urlPattern.trim()
        : profileKey;
    try {
      new RegExp(urlPattern, "i");
    } catch (error) {
      throw new Error(`Profile "${profileKey}" has an invalid URL pattern: ${error.message}`);
    }

    for (const selectorKey of ["tagInputSelector", "imgSelector", "linkSelector"]) {
      if (
        config[selectorKey] !== undefined &&
        typeof config[selectorKey] !== "string"
      ) {
        throw new Error(`Profile "${profileKey}" field "${selectorKey}" must be a string.`);
      }
    }
    if (config.isXPath !== undefined && typeof config.isXPath !== "boolean") {
      throw new Error(`Profile "${profileKey}" isXPath must be true or false.`);
    }

    normalized[profileKey] = {
      ...config,
      urlPattern,
      tagInputSelector: config.tagInputSelector || "",
      imgSelector: config.imgSelector || "",
      linkSelector: config.linkSelector || "",
      isXPath: Boolean(config.isXPath),
    };
  });
  return normalized;
}

async function loadSiteConfigs() {
  const stored = await chrome.storage.local.get("lazymod_global_site_configs");
  const configs = stored.lazymod_global_site_configs || {
    ".*": {
      urlPattern: ".*",
      tagInputSelector:
        "#tags, #post_tag_string, textarea[name='tags'], input[name='tags']",
      imgSelector: "#image, .main-image, img:not([src^='data:image/svg'])",
      linkSelector: "a.image-link, input[name='source'], input[name='file_url']",
      isXPath: false,
    },
  };

  currentSiteConfigs = normalizeSiteConfigs(configs);
  document.title = "QuickTag Settings Editor";
  editorTitle.textContent = "Settings editor";
  paletteName.textContent = "URL patterns and page selectors";
  editorFooterNote.textContent =
    "Save to apply these URL profiles and selectors to the tagger.";
  setEditorValue(JSON.stringify(currentSiteConfigs, null, 2));
  textarea.disabled = false;
  saveButton.disabled = false;
  formatButton.disabled = false;
  textarea.focus();
  setStatus("Ready");
}

function normalizeAiBlacklist(rawBlacklist) {
  if (!Array.isArray(rawBlacklist)) {
    throw new Error("The AI blacklist must be a JSON array of tag strings.");
  }
  if (rawBlacklist.some((tag) => typeof tag !== "string")) {
    throw new Error("Every AI blacklist entry must be a string.");
  }
  return [
    ...new Set(
      rawBlacklist
        .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(Boolean),
    ),
  ];
}

async function loadAiBlacklist() {
  const stored = await chrome.storage.local.get("lazymod_global_ai_blacklist");
  currentAiBlacklist = normalizeAiBlacklist(
    stored.lazymod_global_ai_blacklist ?? defaultAiBlacklist,
  );
  document.title = "QuickTag — edytor czarnej listy AI";
  editorTitle.textContent = "AI blacklist editor";
  paletteName.textContent = `${currentAiBlacklist.length} excluded tags`;
  editorFooterNote.textContent =
    "Tags in this list are always hidden from AI suggestions. Save to update the tagger.";
  setEditorValue(JSON.stringify(currentAiBlacklist, null, 2));
  textarea.disabled = false;
  saveButton.disabled = false;
  formatButton.disabled = false;
  textarea.focus();
  setStatus("Ready");
}

function formatJson() {
  if (editorMode === "palette" && easyJsonMode) {
    try {
      const formattedPack = parsePaletteEasy(textarea.value, draftPaletteName);
      setEditorValue(serializePaletteEasy(formattedPack));
      markDirty();
      setStatus("easyJson formatted · unsaved changes", "dirty");
      textarea.focus();
    } catch (error) {
      setStatus(`Invalid easyJson: ${error.message}`, "error");
    }
    return;
  }

  try {
    setEditorValue(JSON.stringify(JSON.parse(textarea.value), null, 2));
    markDirty();
    setStatus("JSON formatted · unsaved changes", "dirty");
    textarea.focus();
  } catch (error) {
    setStatus(`Invalid JSON: ${error.message}`, "error");
  }
}

async function savePalette() {
  let updatedPack;
  try {
    updatedPack = easyJsonMode
      ? parsePaletteEasy(textarea.value, draftPaletteName)
      : normalizePalettePack(JSON.parse(textarea.value), currentPack.name);
  } catch (error) {
    setStatus(
      easyJsonMode
        ? `Invalid easyJson: ${error.message}`
        : `Invalid palette JSON: ${error.message}`,
      "error",
    );
    textarea.focus();
    return;
  }

  const nextData = {
    ...paletteData,
    packs: { ...paletteData.packs, [packId]: updatedPack },
    activePackId: paletteData.activePackId || packId,
  };
  if (nextData.activePackId === packId) {
    const groupNames = Object.keys(updatedPack.groups);
    const activeGroup = updatedPack.groups[nextData.activeGroup]
      ? nextData.activeGroup
      : groupNames[0];
    const categoryNames = Object.keys(updatedPack.groups[activeGroup]);
    const activeCategory = updatedPack.groups[activeGroup][nextData.activeCategory]
      ? nextData.activeCategory
      : categoryNames[0];
    nextData.activeGroup = activeGroup;
    nextData.activeCategory = activeCategory;
  }

  const values = { lazymod_global_palettes: nextData };
  if (packId === "builtin-import") {
    values.lazymod_builtin_palette_override = updatedPack;
  }

  saveButton.disabled = true;
  setStatus("Saving…");
  try {
    await chrome.storage.local.set(values);
    paletteData = nextData;
    currentPack = updatedPack;
    draftPaletteName = updatedPack.name;
    dirty = false;
    paletteName.textContent = updatedPack.name;
    setPaletteEditorContent(updatedPack);
    setStatus("Saved · tagger updated", "saved");
  } catch (error) {
    setStatus(`Could not save palette: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
  }
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

  saveButton.disabled = true;
  setStatus("Saving…");
  try {
    await chrome.storage.local.set({
      lazymod_global_site_configs: updatedConfigs,
    });
    currentSiteConfigs = updatedConfigs;
    setEditorValue(JSON.stringify(updatedConfigs, null, 2));
    dirty = false;
    setStatus("Saved · settings updated", "saved");
  } catch (error) {
    setStatus(`Could not save settings: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
  }
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

  saveButton.disabled = true;
  setStatus("Saving…");
  try {
    await chrome.storage.local.set({
      lazymod_global_ai_blacklist: updatedBlacklist,
    });
    currentAiBlacklist = updatedBlacklist;
    setEditorValue(JSON.stringify(updatedBlacklist, null, 2));
    paletteName.textContent = `${updatedBlacklist.length} excluded tags`;
    dirty = false;
    setStatus("Saved · AI blacklist updated", "saved");
  } catch (error) {
    setStatus(`Could not save AI blacklist: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
  }
}

function saveCurrentDocument() {
  if (editorMode === "site-configs") return saveSiteConfigs();
  if (editorMode === "ai-blacklist") return saveAiBlacklist();
  return savePalette();
}

easyJsonToggle.addEventListener("click", () => {
  try {
    if (easyJsonMode) {
      const updatedPack = parsePaletteEasy(textarea.value, draftPaletteName);
      draftPaletteName = updatedPack.name;
      easyJsonMode = false;
      setPaletteEditorContent(updatedPack);
    } else {
      const updatedPack = normalizePalettePack(
        JSON.parse(textarea.value),
        draftPaletteName || currentPack.name,
      );
      draftPaletteName = updatedPack.name;
      easyJsonMode = true;
      setPaletteEditorContent(updatedPack);
    }
    easyJsonToggle.setAttribute("aria-pressed", String(easyJsonMode));
    easyJsonToggle.textContent = `easyJson: ${easyJsonMode ? "On" : "Off"}`;
    setStatus(dirty ? "Unsaved changes" : "Ready", dirty ? "dirty" : "");
    textarea.focus();
  } catch (error) {
    setStatus(
      easyJsonMode
        ? `Invalid easyJson: ${error.message}`
        : `Invalid palette JSON: ${error.message}`,
      "error",
    );
    textarea.focus();
  }
});

wordWrapToggle.addEventListener("click", () => {
  const isWrapped = wordWrapToggle.getAttribute("aria-pressed") !== "true";
  wordWrapToggle.setAttribute("aria-pressed", String(isWrapped));
  wordWrapToggle.textContent = `Word wrap: ${isWrapped ? "On" : "Off"}`;
  codeEditor.classList.toggle("word-wrap", isWrapped);
  textarea.scrollTop = 0;
  textarea.scrollLeft = 0;
  updateLineNumbers();
});

textarea.addEventListener("input", () => {
  markDirty();
  updateLineNumbers();
});
textarea.addEventListener("click", updateActiveLine);
textarea.addEventListener("keyup", updateActiveLine);
textarea.addEventListener("scroll", updateActiveLine);
window.addEventListener("resize", updateLineNumbers);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === textarea) updateActiveLine();
});
saveButton.addEventListener("click", saveCurrentDocument);
formatButton.addEventListener("click", formatJson);

textarea.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText("  ", start, end, "end");
    markDirty();
    updateLineNumbers();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentDocument();
  } else if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === "f"
  ) {
    event.preventDefault();
    formatJson();
  } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    saveCurrentDocument();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

const loadEditor =
  editorMode === "site-configs"
    ? loadSiteConfigs
    : editorMode === "ai-blacklist"
      ? loadAiBlacklist
      : loadPack;
loadEditor().catch((error) => {
  console.error("[QuickTag] Could not load palette editor:", error);
  paletteName.textContent = "Editor unavailable";
  setStatus(error.message, "error");
});
