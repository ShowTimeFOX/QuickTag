(async function () {
  "use strict";

  /* ==========================================================================
       1. STORAGE & HELPERS (Browser storage management)
       ========================================================================== */

  // --- HELPERY STORAGE ---
  async function loadData(key, fallback) {
    try {
      const result = await chrome.storage.local.get([key]);
      return result[key] !== undefined ? result[key] : fallback;
    } catch (e) {
      return fallback;
    }
  }

  async function saveData(key, val) {
    try {
      await chrome.storage.local.set({ [key]: val });
    } catch (e) {}
  }

  const accessSettingsKeys = [
    "lazymod_enabled",
    "lazymod_domain_mode",
    "lazymod_domains",
    "lazymod_site_blacklist",
  ];
  let originalBodyMargins = null;
  let extensionHost = null;
  let extensionReady = false;
  let siteAccessAllowed = true;

  function isPageAllowedBySettings(enabled, mode, domains, siteBlacklist = []) {
    if (!enabled) return false;
    const hostname = window.location.hostname.toLowerCase();
    const matchesDomain = (domain) => {
      const normalizedDomain = domain.toLowerCase();
      return hostname === normalizedDomain ||
        hostname.endsWith(`.${normalizedDomain}`);
    };
    const isBlockedBySiteOverride = siteBlacklist.some(matchesDomain);
    if (isBlockedBySiteOverride) return false;
    const matchesConfiguredDomain = domains.some(matchesDomain);
    return mode === "whitelist" ? matchesConfiguredDomain : !matchesConfiguredDomain;
  }

  function applySiteAccessSettings(settings) {
    const enabled = settings.lazymod_enabled !== false;
    const mode = settings.lazymod_domain_mode === "whitelist"
      ? "whitelist"
      : "blacklist";
    const domains = Array.isArray(settings.lazymod_domains)
      ? settings.lazymod_domains.filter((domain) => typeof domain === "string")
      : [];
    const siteBlacklist = Array.isArray(settings.lazymod_site_blacklist)
      ? settings.lazymod_site_blacklist.filter((domain) => typeof domain === "string")
      : [];
    siteAccessAllowed = isPageAllowedBySettings(enabled, mode, domains, siteBlacklist);
    if (!extensionHost) return;

    extensionHost.style.display = siteAccessAllowed ? "" : "none";
    if (!siteAccessAllowed && document.body && originalBodyMargins) {
      Object.assign(document.body.style, originalBodyMargins);
      if (extensionReady) {
        if (elementPickerType) stopElementPicker();
        releaseGhostMode();
        if (isRecordingGhostShortcut) {
          isRecordingGhostShortcut = false;
          ghostShortcutButton.textContent = formatGhostShortcut(ghostShortcut);
        }
      }
    } else if (siteAccessAllowed && extensionReady) {
      updateDockPageSpace();
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName !== "local" ||
      !accessSettingsKeys.some((key) => Object.hasOwn(changes, key))
    ) {
      return;
    }
    chrome.storage.local
      .get(accessSettingsKeys)
      .then((settings) => {
        applySiteAccessSettings(settings);
      })
      .catch((error) => {
        console.error("[QuickTag] Could not apply global access settings.", error);
      });
  });

  const accessSettings = await chrome.storage.local.get(accessSettingsKeys);
  applySiteAccessSettings(accessSettings);
  if (document.body) {
    originalBodyMargins = {
      marginLeft: document.body.style.marginLeft,
      marginRight: document.body.style.marginRight,
      marginTop: document.body.style.marginTop,
      marginBottom: document.body.style.marginBottom,
    };
  }

  /* ==========================================================================
       2. SITE CONFIGS & DOM TARGETING (Page and field detection)
       ========================================================================== */

  // --- DEFAULT CONFIGURATION ---
  const defaultSiteConfigs = {
    ".*": {
      urlPattern: ".*",
      tagInputSelector:
        "#tags, #post_tag_string, textarea[name='tags'], input[name='tags']",
      imgSelector: "#image, .main-image, img:not([src^='data:image/svg'])",
      linkSelector:
        "a.image-link, input[name='source'], input[name='file_url']",
      isXPath: false,
    },
  };

  const defaultPaletteData = {
    activePackId: "builtin-import",
    activeGroup: "Character",
    activeCategory: "Identity",
    packs: {
      "builtin-import": {
        name: "QuickTag starter pack",
        groups: {
          Character: {
            Identity: ["1girl", "solo"],
          },
        },
      },
    },
  };

  /* ==========================================================================
       3. TAG OPERATIONS (Page tag formatting and operations)
       ========================================================================== */

  const defaultTagBlacklist = [
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

  let tagBlacklist = await loadData(
    "lazymod_global_ai_blacklist",
    defaultTagBlacklist,
  );
  if (!Array.isArray(tagBlacklist)) {
    console.error("[QuickTag] Saved AI blacklist is not an array; using the built-in list.");
    tagBlacklist = defaultTagBlacklist;
  }
  tagBlacklist = [...new Set(tagBlacklist.filter((tag) => typeof tag === "string").map(formatTag))];

  let siteConfigs = await loadData(
    "lazymod_global_site_configs",
    defaultSiteConfigs,
  );
  const themeNames = [
    "dark",
    "light",
    "femboy",
    "halloween",
    "minimalistic",
    "cyberpunk",
    "custom",
  ];
  let savedTheme = await loadData("lazymod_theme", "dark");
  let savedCustomAccent = await loadData("lazymod_custom_accent", "#7cafff");
  if (!themeNames.includes(savedTheme)) {
    console.error("[QuickTag] Saved theme is invalid; using the default theme.");
    savedTheme = "dark";
  }
  if (typeof savedCustomAccent !== "string" || !/^#[0-9a-fA-F]{6}$/.test(savedCustomAccent)) {
    console.error("[QuickTag] Saved custom accent color is invalid; using the default color.");
    savedCustomAccent = "#7cafff";
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
      throw new Error("No folder groups were found in the palette JSON.");
    }

    const groups = {};
    Object.entries(sourceGroups).forEach(([groupName, rawCategories]) => {
      if (Array.isArray(rawCategories)) {
        groups[groupName] = { General: rawCategories.filter((tag) => typeof tag === "string") };
        return;
      }
      if (!rawCategories || typeof rawCategories !== "object") return;

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

  function firstPaletteLocation(pack) {
    const activeGroup = Object.keys(pack.groups)[0];
    return {
      activeGroup,
      activeCategory: Object.keys(pack.groups[activeGroup])[0],
    };
  }

  // --- Safely load the built-in and saved JSON palettes ---
  async function loadInitialPalettes() {
    let builtInPack = null;
    try {
      const jsonUrl = chrome.runtime.getURL("data/import.json");
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      builtInPack = normalizePalettePack(await res.json(), "data/import.json");
    } catch (e) {
      console.warn(
        "[QuickTag] Could not read import.json; using palettes saved in storage.",
        e,
      );
    }

    const builtInOverride = await loadData(
      "lazymod_builtin_palette_override",
      null,
    );
    if (builtInOverride) {
      try {
        builtInPack = normalizePalettePack(builtInOverride, "QuickTag starter pack");
      } catch (error) {
        console.warn(
          "[QuickTag] Could not load the edited built-in palette; using the default version.",
          error,
        );
      }
    }

    const savedPalettes = await loadData("lazymod_global_palettes", null);
    if (savedPalettes && savedPalettes.packs) {
      const packs = { ...savedPalettes.packs };
      if (builtInPack) packs["builtin-import"] = builtInPack;
      if (Object.keys(packs).length === 0) {
        packs["builtin-import"] = defaultPaletteData.packs["builtin-import"];
      }
      const activePackId = packs[savedPalettes.activePackId]
        ? savedPalettes.activePackId
        : Object.keys(packs)[0];
      const activePack = packs[activePackId];
      const initialLocation = firstPaletteLocation(activePack);
      return {
        packs,
        activePackId,
        activeGroup: activePack.groups[savedPalettes.activeGroup]
          ? savedPalettes.activeGroup
          : initialLocation.activeGroup,
        activeCategory:
          activePack.groups[savedPalettes.activeGroup]?.[savedPalettes.activeCategory]
            ? savedPalettes.activeCategory
            : initialLocation.activeCategory,
      };
    }

    const packs = {};
    if (builtInPack) packs["builtin-import"] = builtInPack;

    // Migrate palettes saved by earlier versions into a separate JSON-like pack.
    if (savedPalettes && savedPalettes.folders) {
      const legacyPack = normalizePalettePack(
        { name: "My palettes", groups: savedPalettes.folders },
        "My palettes",
      );
      packs["legacy-saved"] = legacyPack;
      const initialLocation = firstPaletteLocation(legacyPack);
      return {
        packs,
        activePackId: "legacy-saved",
        activeGroup: legacyPack.groups[savedPalettes.activeFolder]
          ? savedPalettes.activeFolder
          : initialLocation.activeGroup,
        activeCategory: initialLocation.activeCategory,
      };
    }

    if (Object.keys(packs).length === 0) {
      packs["builtin-import"] = defaultPaletteData.packs["builtin-import"];
    }
    const activePackId = Object.keys(packs)[0];
    const initialLocation = firstPaletteLocation(packs[activePackId]);
    return {
      packs,
      activePackId,
      ...initialLocation,
    };
  }

  let paletteData = await loadInitialPalettes();

  function detectActiveSiteKey() {
    const currentUrl = window.location.href;
    for (const [key, cfg] of Object.entries(siteConfigs)) {
      if (key === ".*") continue;
      const pattern = cfg.urlPattern || key;
      if (pattern && new RegExp(pattern, "i").test(currentUrl)) return key;
    }
    return ".*";
  }

  let activeSiteKey = detectActiveSiteKey();

  // --- DOM TARGETING ---
  function getElementBySelector(selectorStr, isXPath = false) {
    if (!selectorStr) return null;
    if (isXPath) {
      try {
        const result = document.evaluate(
          selectorStr,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        return result.singleNodeValue;
      } catch (e) {
        return null;
      }
    } else {
      const selectors = selectorStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }
  }

  function getMainInput() {
    const conf = siteConfigs[activeSiteKey] || siteConfigs[".*"];
    let el = getElementBySelector(conf.tagInputSelector, conf.isXPath);
    if (!el && activeSiteKey !== ".*")
      el = getElementBySelector(siteConfigs[".*"].tagInputSelector, false);
    return el;
  }

  function getSourceInput() {
    const conf = siteConfigs[activeSiteKey] || siteConfigs[".*"];
    let el = getElementBySelector(conf.linkSelector, conf.isXPath);
    if (!el && activeSiteKey !== ".*")
      el = getElementBySelector(siteConfigs[".*"].linkSelector, false);
    return el;
  }

  function getTargetImageURL() {
    const conf = siteConfigs[activeSiteKey] || siteConfigs[".*"];
    let el = getElementBySelector(conf.imgSelector, conf.isXPath);
    if (!el && activeSiteKey !== ".*")
      el = getElementBySelector(siteConfigs[".*"].imgSelector, false);
    if (el && el.src) return el.src;

    let linkEl = getSourceInput();
    if (linkEl) {
      if (linkEl.tagName === "A" && linkEl.href) return linkEl.href;
      if (linkEl.tagName === "INPUT" || linkEl.tagName === "TEXTAREA")
        return linkEl.value.trim();
      if (linkEl.src) return linkEl.src;
    }
    return null;
  }

  // --- FORMATOWANIE I TAGI ---
  function formatTag(tag) {
    return tag.trim().toLowerCase().replace(/\s+/g, "_");
  }

  function getMainTags() {
    const input = getMainInput();
    if (!input) return [];
    return input.value.split(/\s+/).map(formatTag).filter(Boolean);
  }

  function setMainTags(tagsArray) {
    const input = getMainInput();
    if (!input) return;
    input.value = tagsArray.join(" ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    updateAllChipStates();
    updateTagCounter();
  }

  function toggleTagInMain(tag) {
    const cleanTag = formatTag(tag);
    if (!cleanTag) return;
    let currentTags = getMainTags();
    const index = currentTags.indexOf(cleanTag);
    if (index > -1) currentTags.splice(index, 1);
    else currentTags.push(cleanTag);
    setMainTags(currentTags);
  }

  /* ==========================================================================
       4. SHADOW DOM & UI INITIALIZATION (Wtryskiwanie HTML i CSS)
       ========================================================================== */

  // --- TWORZENIE SHADOW DOM I WTRZYKIWANIE HTML/CSS ---
  const hostDiv = document.createElement("div");
  hostDiv.id = "quicktag-extension-root";
  hostDiv.style.visibility = "hidden";
  hostDiv.style.display = siteAccessAllowed ? "" : "none";
  extensionHost = hostDiv;
  document.documentElement.appendChild(hostDiv);
  const shadowRoot = hostDiv.attachShadow({ mode: "open" });
  let themeStyleElement;
  let themeStyleLoadId = 0;

  async function loadThemeStyles(theme) {
    if (!themeNames.includes(theme)) throw new Error(`Unsupported theme: ${theme}`);
    const loadId = ++themeStyleLoadId;
    try {
      const response = await fetch(chrome.runtime.getURL(`styles/theme-${theme}.css`));
      if (loadId !== themeStyleLoadId) return false;
      if (!response.ok) {
        throw new Error(`Could not load theme stylesheet (HTTP ${response.status}).`);
      }
      const themeCss = await response.text();
      if (loadId !== themeStyleLoadId) return false;
      if (!themeStyleElement) {
        themeStyleElement = document.createElement("style");
        themeStyleElement.id = "lazymod-theme-styles";
        shadowRoot.appendChild(themeStyleElement);
      }
      themeStyleElement.textContent = themeCss;
      return true;
    } catch (error) {
      if (loadId !== themeStyleLoadId) return false;
      throw error;
    }
  }

  try {
    const cssRes = await fetch(chrome.runtime.getURL("styles/tagger.css"));
    const styleEl = document.createElement("style");
    styleEl.textContent = await cssRes.text();
    shadowRoot.appendChild(styleEl);
    await loadThemeStyles(savedTheme);

    const htmlRes = await fetch(chrome.runtime.getURL("pages/popup.html"));
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = await htmlRes.text();
    shadowRoot.appendChild(tempDiv.firstElementChild);
  } catch (err) {
    console.error("[QuickTag] Could not load extension resources:", err);
    return;
  }

  const $ = (selector) => shadowRoot.querySelector(selector);
  const $$ = (selector) => shadowRoot.querySelectorAll(selector);
  const windowEl = $("#lazymod-window");
  const dockEdges = ["left", "right", "top", "bottom"];
  const pageLayoutId =
    window.location.origin === "null"
      ? window.location.hostname || "unknown"
      : window.location.origin;
  const pageLayoutStorageKey = `lazymod_site_layout_${encodeURIComponent(pageLayoutId)}`;
  let savedPageLayout = await loadData(pageLayoutStorageKey, null);
  if (
    savedPageLayout !== null &&
    (!savedPageLayout ||
      typeof savedPageLayout !== "object" ||
      Array.isArray(savedPageLayout) ||
      typeof savedPageLayout.docked !== "boolean" ||
      !dockEdges.includes(savedPageLayout.dockPosition) ||
      (savedPageLayout.visible !== undefined &&
        typeof savedPageLayout.visible !== "boolean") ||
      (savedPageLayout.position !== undefined &&
        (!savedPageLayout.position ||
          typeof savedPageLayout.position.top !== "string" ||
          typeof savedPageLayout.position.left !== "string")))
  ) {
    console.error("[QuickTag] Saved page layout is invalid; using defaults.");
    savedPageLayout = null;
  }
  let activeDockPosition = dockEdges.includes(savedPageLayout?.dockPosition)
    ? savedPageLayout.dockPosition
    : "right";
  let isDocked = Boolean(savedPageLayout?.docked);

  function persistPageLayout(changes) {
    const updatedLayout = { ...savedPageLayout, ...changes };
    return chrome.storage.local
      .set({ [pageLayoutStorageKey]: updatedLayout })
      .then(() => {
        savedPageLayout = updatedLayout;
      })
      .catch((error) => {
        console.error("[QuickTag] Could not save this page's window layout.", error);
        if (typeof setConfigStatus === "function") {
          setConfigStatus(`Could not save page layout: ${error.message}`, "error");
        }
      });
  }
  function applyDockPositionClass() {
    windowEl.classList.remove(...dockEdges.map((edge) => `docked-${edge}`));
    windowEl.classList.add(`docked-${activeDockPosition}`);
  }

  function updateDockPageSpace() {
    Object.assign(document.body.style, originalBodyMargins);
    if (!siteAccessAllowed || !windowEl.classList.contains("docked") || windowEl.hidden) return;

    const rect = windowEl.getBoundingClientRect();
    const margin = `${Math.ceil(
      activeDockPosition === "left" || activeDockPosition === "right"
        ? rect.width
        : rect.height,
    )}px`;
    const marginProperty = {
      left: "marginLeft",
      right: "marginRight",
      top: "marginTop",
      bottom: "marginBottom",
    }[activeDockPosition];
    document.body.style[marginProperty] = margin;
  }

  function applyWindowScale(requestedScale) {
    const slider = $("#lm-scale-slider");
    const minScale = parseFloat(slider.min);
    const maxScale = parseFloat(slider.max);
    const scale = Math.min(maxScale, Math.max(minScale, requestedScale));
    const margin = 12;

    slider.value = String(scale);
    $("#lm-scale-value").textContent = `${Math.round(scale * 100)}%`;
    windowEl.style.setProperty("--lm-window-scale", String(scale));
    windowEl.style.transform = `scale(${scale})`;
    windowEl.style.maxWidth = `${Math.max(1, window.innerWidth - margin * 2) / scale}px`;
    const isDockedNow = windowEl.classList.contains("docked");

    if (isDockedNow) {
      const sideDock = activeDockPosition === "left" || activeDockPosition === "right";
      const dockedWidth = sideDock ? 400 : window.innerWidth / scale;
      const dockedHeight = sideDock
        ? window.innerHeight / scale
        : (window.innerHeight * 0.42) / scale;
      windowEl.style.setProperty("--lm-docked-width", `${dockedWidth}px`);
      windowEl.style.setProperty("--lm-docked-height", `${dockedHeight}px`);
      windowEl.style.maxWidth = `${window.innerWidth / scale}px`;
      windowEl.style.maxHeight = `${window.innerHeight / scale}px`;
      windowEl.style.transformOrigin = {
        left: "left top",
        right: "right top",
        top: "left top",
        bottom: "left bottom",
      }[activeDockPosition];
      updateDockPageSpace();
    } else {
      windowEl.style.maxHeight = `${Math.max(1, window.innerHeight - margin * 2) / scale}px`;
      windowEl.style.transformOrigin = "top right";
      const rect = windowEl.getBoundingClientRect();
      let left = parseFloat(windowEl.style.left) || rect.left;
      let top = parseFloat(windowEl.style.top) || rect.top;
      if (rect.left < margin) left += (margin - rect.left) / scale;
      if (rect.right > window.innerWidth - margin) {
        left -= (rect.right - (window.innerWidth - margin)) / scale;
      }
      if (rect.top < margin) top += (margin - rect.top) / scale;
      if (rect.bottom > window.innerHeight - margin) {
        top -= (rect.bottom - (window.innerHeight - margin)) / scale;
      }
      windowEl.style.left = `${Math.max(margin / scale, left)}px`;
      windowEl.style.top = `${Math.max(margin / scale, top)}px`;
      windowEl.style.right = "auto";
    }

    return scale;
  }

  // Load the saved window state
  const savedScale = parseFloat(await loadData("lazymod_scale", 1));
  const savedGhostMode = await loadData("lazymod_ghost_mode", false);
  const savedGhostHoldMode = await loadData("lazymod_ghost_hold_mode", false);
  const savedGhostShortcut = await loadData("lazymod_ghost_shortcut", {
    ctrl: true,
    alt: false,
    shift: true,
    meta: false,
    key: "g",
  });
  const savedSize = await loadData("lazymod_win_size", null);
  const savedPos =
    savedPageLayout?.position ||
    (await loadData("lazymod_win_pos", {
      top: "100px",
      left: "100px",
    }));
  windowEl.hidden = savedPageLayout?.visible !== true;

  if (savedSize && Number.isFinite(savedSize.width) && savedSize.width > 0) {
    windowEl.style.width = `${savedSize.width}px`;
  }
  if (savedSize && Number.isFinite(savedSize.height) && savedSize.height > 0) {
    windowEl.style.height = `${savedSize.height}px`;
  }
  if (isDocked) {
    windowEl.classList.add("docked");
    applyDockPositionClass();
  } else {
    windowEl.style.top = savedPos.top;
    windowEl.style.left = savedPos.left;
  }
  applyWindowScale(Number.isFinite(savedScale) ? savedScale : 1);
  $("#lm-active-badge").textContent = activeSiteKey;

  // --- EVENT AND UI WIRING ---
  const tabMainBtn = $("#lm-tab-btn-main");
  const tabSitesBtn = $("#lm-tab-btn-sites");
  const viewMain = $("#lm-view-main");
  const viewSites = $("#lm-view-sites");

  function resetTabs() {
    tabMainBtn.classList.remove("active");
    tabSitesBtn.classList.remove("active");
    viewMain.style.display = "none";
    viewSites.style.display = "none";
  }

  tabMainBtn.onclick = () => {
    resetTabs();
    tabMainBtn.classList.add("active");
    viewMain.style.display = "block";
    updateAllChipStates();
  };
  tabSitesBtn.onclick = () => {
    resetTabs();
    tabSitesBtn.classList.add("active");
    viewSites.style.display = "block";
    renderSettingsUI();
  };
  $("#lm-tab-btn-about").onclick = () => {
    chrome.runtime.sendMessage({ action: "open_about_page" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[QuickTag] Could not open the About page.", chrome.runtime.lastError);
        alert(`Could not open the About page: ${chrome.runtime.lastError.message}`);
        return;
      }
      if (!response?.success) {
        console.error(
          "[QuickTag] Could not open the About page.",
          response?.error || "Unknown error",
        );
        alert(`Could not open the About page: ${response?.error || "Unknown error"}`);
      }
    });
  };

  // Palety
  function savePaletteData() {
    return saveData("lazymod_global_palettes", paletteData);
  }

  function getActivePack() {
    return paletteData.packs[paletteData.activePackId];
  }

  let flatView = false;
  const paletteSearchInput = $("#lm-palette-search");
  let paletteSearchQuery = "";
  let typeToTagBuffer = "";
  let typeToTagResetTimer = null;
  let highlightedSearchResult = 0;

  function getVisiblePaletteTags() {
    const categories = getActivePack().groups[paletteData.activeGroup];
    const tags = flatView
      ? Object.values(categories).flat()
      : categories[paletteData.activeCategory] || [];
    return [...new Set(tags.map(formatTag).filter(Boolean))];
  }

  function getFuzzyScore(query, candidate) {
    const candidateWords = candidate.split("_");
    let bestScore = Infinity;

    candidateWords.forEach((word) => {
      const position = word.indexOf(query);
      if (position >= 0) {
        bestScore = Math.min(bestScore, position * 0.08 + (word.length - query.length) * 0.002);
      }
      if (query.length < 3) return;

      const maxDistance = Math.max(1, Math.floor(query.length * 0.25));
      for (
        let length = Math.max(1, query.length - maxDistance);
        length <= query.length + maxDistance && length <= word.length;
        length += 1
      ) {
        for (let start = 0; start + length <= word.length; start += 1) {
          const fragment = word.slice(start, start + length);
          const previousRow = Array.from(
            { length: fragment.length + 1 },
            (_, index) => index,
          );
          let row = [];
          for (let queryIndex = 1; queryIndex <= query.length; queryIndex += 1) {
            row = [queryIndex];
            for (let fragmentIndex = 1; fragmentIndex <= fragment.length; fragmentIndex += 1) {
              row[fragmentIndex] = Math.min(
                row[fragmentIndex - 1] + 1,
                previousRow[fragmentIndex] + 1,
                previousRow[fragmentIndex - 1] +
                  (query[queryIndex - 1] === fragment[fragmentIndex - 1] ? 0 : 1),
              );
            }
            previousRow.splice(0, previousRow.length, ...row);
          }
          const distance = previousRow[fragment.length];
          if (distance <= maxDistance) {
            bestScore = Math.min(bestScore, 0.5 + distance + start * 0.01);
          }
        }
      }
    });

    if (bestScore < Infinity) return bestScore;
    let queryIndex = 0;
    let lastMatch = -1;
    let gaps = 0;
    for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
      if (candidate[index] === query[queryIndex]) {
        if (lastMatch >= 0) gaps += index - lastMatch - 1;
        lastMatch = index;
        queryIndex += 1;
      }
    }
    return queryIndex === query.length ? 2 + gaps * 0.1 : Infinity;
  }

  function getPaletteSearchResults() {
    const query = formatTag(paletteSearchQuery);
    if (!query) return [];

    const results = [];
    Object.entries(getActivePack().groups).forEach(([groupName, categories]) => {
      Object.entries(categories).forEach(([categoryName, tags]) => {
        tags.forEach((tag) => {
          const cleanTag = formatTag(tag);
          if (!cleanTag) return;
          const score = getFuzzyScore(query, cleanTag);
          if (score < Infinity) {
            results.push({ tag: cleanTag, groupName, categoryName, score });
          }
        });
      });
    });

    const uniqueResults = new Map();
    results.forEach((result) => {
      const existing = uniqueResults.get(result.tag);
      if (!existing || result.score < existing.score) {
        uniqueResults.set(result.tag, result);
      }
    });
    return [...uniqueResults.values()]
      .sort((first, second) => first.score - second.score || first.tag.localeCompare(second.tag))
      .slice(0, 60);
  }

  function setPaletteSearchQuery(query) {
    paletteSearchQuery = query;
    paletteSearchInput.value = query;
    highlightedSearchResult = 0;
    renderUserChips();
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return (
      target.isContentEditable ||
      target.matches("input, textarea, select")
    );
  }

  paletteSearchInput.addEventListener("input", () => {
    typeToTagBuffer = "";
    clearTimeout(typeToTagResetTimer);
    setPaletteSearchQuery(paletteSearchInput.value);
  });
  paletteSearchInput.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setPaletteSearchQuery("");
      return;
    }
    const results = getPaletteSearchResults();
    if (event.key === "Enter") {
      addSearchResult(results[highlightedSearchResult]);
      return;
    }
    if (results.length === 0) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    highlightedSearchResult =
      (highlightedSearchResult + direction + results.length) % results.length;
    renderUserChips();
  });

  document.addEventListener("keydown", (event) => {
    const eventPath = event.composedPath();
    if (
      event.isComposing ||
      !siteAccessAllowed ||
      windowEl.hidden ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      eventPath.some(isEditableTarget) ||
      isEditableTarget(document.activeElement) ||
      isEditableTarget(shadowRoot.activeElement) ||
      elementPickerType ||
      isRecordingGhostShortcut
    ) {
      return;
    }

    if (event.key === "Escape" && paletteSearchQuery) {
      event.preventDefault();
      event.stopPropagation();
      typeToTagBuffer = "";
      clearTimeout(typeToTagResetTimer);
      setPaletteSearchQuery("");
      return;
    }
    if (event.key === "Backspace" && paletteSearchQuery) {
      event.preventDefault();
      event.stopPropagation();
      typeToTagBuffer = typeToTagBuffer.slice(0, -1);
      setPaletteSearchQuery(paletteSearchQuery.slice(0, -1));
      clearTimeout(typeToTagResetTimer);
      return;
    }
    if (event.key === "Enter" && paletteSearchQuery) {
      event.preventDefault();
      event.stopPropagation();
      addSearchResult(getPaletteSearchResults()[highlightedSearchResult]);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const results = getPaletteSearchResults();
      if (results.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      highlightedSearchResult =
        (highlightedSearchResult + direction + results.length) % results.length;
      renderUserChips();
      return;
    }
    if (event.key.length !== 1) return;

    event.preventDefault();
    event.stopPropagation();
    if (!tabMainBtn.classList.contains("active")) tabMainBtn.click();
    setTaggerCollapsed(false);
    typeToTagBuffer = `${typeToTagBuffer}${event.key}`;
    setPaletteSearchQuery(typeToTagBuffer);
    clearTimeout(typeToTagResetTimer);
    typeToTagResetTimer = setTimeout(() => {
      typeToTagBuffer = "";
    }, 1000);
  }, true);

  function addSearchResult(result) {
    if (!result) return;
    const currentTags = getMainTags();
    if (!currentTags.includes(result.tag)) {
      currentTags.push(result.tag);
      setMainTags(currentTags);
    }
  }

  function updatePaletteToggleButton() {
    const button = $("#lm-add-all-palette");
    if (!button) return;
    if (paletteSearchQuery) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const visibleTags = getVisiblePaletteTags();
    const mainTags = getMainTags();
    const allSelected =
      visibleTags.length > 0 && visibleTags.every((tag) => mainTags.includes(tag));
    button.querySelector("span").textContent = allSelected ? "Remove tags" : "Add tags";
    button.querySelector("svg").innerHTML = allSelected
      ? '<path d="M2.5 8h11" />'
      : '<path d="M8 2.5v11M2.5 8h11" />';
    button.classList.toggle("lazymod-btn-danger", allSelected);
    button.classList.toggle("lazymod-btn-accent", !allSelected);
  }

  function renderFoldersUI() {
    if (!paletteData.packs || Object.keys(paletteData.packs).length === 0) {
      paletteData = defaultPaletteData;
    }
    const packSelect = $("#lm-pack-select");
    packSelect.innerHTML = "";
    Object.entries(paletteData.packs).forEach(([packId, pack]) => {
      const option = document.createElement("option");
      option.value = packId;
      option.textContent = pack.name;
      option.selected = packId === paletteData.activePackId;
      packSelect.appendChild(option);
    });
    const deletePackButton = $("#lm-delete-pack");
    const isBuiltInPack = paletteData.activePackId === "builtin-import";
    deletePackButton.disabled = isBuiltInPack;
    deletePackButton.title = isBuiltInPack
      ? "The built-in starter palette cannot be deleted"
      : `Delete ${getActivePack().name}`;
    const activePack = getActivePack();
    const groupNames = Object.keys(activePack.groups);
    if (!groupNames.includes(paletteData.activeGroup)) {
      paletteData.activeGroup = groupNames[0];
    }
    const tabsContainer = $("#lm-palette-tabs");
    tabsContainer.innerHTML = "";
    groupNames.forEach((groupName) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `lazymod-tab ${groupName === paletteData.activeGroup ? "active" : ""}`;
      tab.textContent = groupName;
      tab.onclick = () => {
        paletteData.activeGroup = groupName;
        paletteData.activeCategory = Object.keys(
          getActivePack().groups[groupName],
        )[0];
        savePaletteData();
        renderFoldersUI();
      };
      tabsContainer.appendChild(tab);
    });
    renderCategoriesUI();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    const updatedPalettes = changes.lazymod_global_palettes?.newValue;
    if (
      areaName !== "local" ||
      !updatedPalettes ||
      !updatedPalettes.packs ||
      !updatedPalettes.packs[updatedPalettes.activePackId]
    ) {
      return;
    }
    paletteData = updatedPalettes;
    renderFoldersUI();
  });

  function renderCategoriesUI() {
    const categories = getActivePack().groups[paletteData.activeGroup];
    const categoryNames = Object.keys(categories);
    if (!categoryNames.includes(paletteData.activeCategory)) {
      paletteData.activeCategory = categoryNames[0];
    }
    const tabsContainer = $("#lm-category-tabs");
    tabsContainer.hidden = flatView;
    tabsContainer.innerHTML = "";
    if (!flatView) {
      categoryNames.forEach((categoryName) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = `lazymod-subtab ${categoryName === paletteData.activeCategory ? "active" : ""}`;
        tab.textContent = categoryName;
        tab.onclick = () => {
          paletteData.activeCategory = categoryName;
          savePaletteData();
          renderCategoriesUI();
        };
        tabsContainer.appendChild(tab);
      });
    }
    renderUserChips();
  }

  function renderUserChips() {
    const chipsContainer = $("#lm-user-chips");
    if (!chipsContainer) return;
    chipsContainer.innerHTML = "";
    const mainTags = getMainTags();
    const searchResults = paletteSearchQuery ? getPaletteSearchResults() : null;
    const tags = searchResults
      ? searchResults.map((result) => result.tag)
      : getVisiblePaletteTags();

    if (searchResults && searchResults.length === 0) {
      const emptyMessage = document.createElement("span");
      emptyMessage.className = "lazymod-search-empty";
      emptyMessage.textContent = "No matching tags found.";
      chipsContainer.appendChild(emptyMessage);
    }

    tags.forEach((cleanTag, index) => {
      const isActive = mainTags.includes(cleanTag);
      const chip = document.createElement("div");
      const isHighlighted = searchResults && index === highlightedSearchResult;
      chip.className = `lazymod-chip ${isActive ? "active" : ""} ${
        isHighlighted ? "search-highlighted" : ""
      }`;
      chip.dataset.tag = cleanTag;
      chip.innerHTML = `<span class="icon">${isActive ? "−" : "+"}</span> ${cleanTag}`;
      if (searchResults) {
        const result = searchResults[index];
        chip.title = `${result.groupName} / ${result.categoryName}`;
      }
      chip.onclick = () => toggleTagInMain(cleanTag);
      chipsContainer.appendChild(chip);
    });
    updatePaletteToggleButton();
  }

  $("#lm-flat-view").onchange = (event) => {
    flatView = event.target.checked;
    renderCategoriesUI();
  };

  $("#lm-edit-pack").onclick = () => {
    chrome.runtime.sendMessage(
      { action: "open_palette_editor", packId: paletteData.activePackId },
      (response) => {
        if (chrome.runtime.lastError) {
          alert(`Could not open the editor: ${chrome.runtime.lastError.message}`);
        } else if (!response?.success) {
          alert(`Could not open the editor: ${response?.error || "Unknown error"}`);
        }
      },
    );
  };

  $$(".lazymod-palette-scroller").forEach((scroller) => {
    scroller.addEventListener(
      "wheel",
      (event) => {
        if (scroller.scrollWidth <= scroller.clientWidth) return;
        event.preventDefault();
        scroller.scrollLeft +=
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
      },
      { passive: false },
    );
  });

  $("#lm-pack-select").onchange = (e) => {
    paletteData.activePackId = e.target.value;
    const location = firstPaletteLocation(getActivePack());
    paletteData.activeGroup = location.activeGroup;
    paletteData.activeCategory = location.activeCategory;
    savePaletteData();
    renderFoldersUI();
  };

  $("#lm-delete-pack").onclick = async () => {
    const packId = paletteData.activePackId;
    if (packId === "builtin-import") return;

    const pack = paletteData.packs[packId];
    if (!pack) {
      alert("Could not delete palette: the active palette does not exist.");
      return;
    }
    if (!confirm(`Delete the palette "${pack.name}"? This action cannot be undone.`)) {
      return;
    }

    const packs = { ...paletteData.packs };
    delete packs[packId];
    if (Object.keys(packs).length === 0) {
      packs["builtin-import"] = defaultPaletteData.packs["builtin-import"];
    }
    const activePackId = Object.keys(packs)[0];
    const activePack = packs[activePackId];
    const location = firstPaletteLocation(activePack);
    const nextPaletteData = {
      ...paletteData,
      packs,
      activePackId,
      activeGroup: location.activeGroup,
      activeCategory: location.activeCategory,
    };

    try {
      await chrome.storage.local.set({
        lazymod_global_palettes: nextPaletteData,
      });
      paletteData = nextPaletteData;
      renderFoldersUI();
    } catch (error) {
      console.error("[QuickTag] Could not delete palette:", error);
      alert(`Could not delete palette: ${error.message}`);
    }
  };

  $("#lm-import-pack").onclick = () => $("#lm-pack-file").click();
  $("#lm-pack-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const pack = normalizePalettePack(parsed, file.name.replace(/\.json$/i, ""));
      const packId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const location = firstPaletteLocation(pack);
      const nextPaletteData = {
        ...paletteData,
        packs: { ...paletteData.packs, [packId]: pack },
        activePackId: packId,
        activeGroup: location.activeGroup,
        activeCategory: location.activeCategory,
      };
      await chrome.storage.local.set({
        lazymod_global_palettes: nextPaletteData,
      });
      paletteData = nextPaletteData;
      renderFoldersUI();
    } catch (error) {
      console.error("[QuickTag] Could not import palette JSON:", error);
      alert(`Could not import palette JSON: ${error.message}`);
    } finally {
      e.target.value = "";
    }
  };

  $("#lm-export-pack").onclick = () => {
    const pack = getActivePack();
    const json = JSON.stringify(
      { name: pack.name, groups: pack.groups },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const link = document.createElement("a");
    const safeFileName = pack.name
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_");
    link.href = url;
    link.download = `${safeFileName || "tag-pack"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  $("#lm-add-all-palette").onclick = () => {
    const visibleTags = getVisiblePaletteTags();
    if (visibleTags.length === 0) return;
    const current = getMainTags();
    const allSelected = visibleTags.every((tag) => current.includes(tag));
    const selectedTags = allSelected
      ? current.filter((tag) => !visibleTags.includes(tag))
      : [...new Set([...current, ...visibleTags])];
    setMainTags(selectedTags);
  };

  // AI Analyze
  let rawAiTagsObj = {};
  const thresholdInput = $("#lm-threshold");
  const aiStatus = $("#lm-ai-status");
  const analyzeImageButton = $("#lm-fetch-ai");
  let activeAnalysisId = null;
  let lastAnalysisThreshold = null;
  const savedAiThreshold = Number(
    await loadData("lazymod_ai_threshold", thresholdInput.value),
  );
  if (
    Number.isFinite(savedAiThreshold) &&
    savedAiThreshold >= Number(thresholdInput.min) &&
    savedAiThreshold <= Number(thresholdInput.max)
  ) {
    thresholdInput.value = String(savedAiThreshold);
  } else {
    console.warn("[QuickTag] Saved AI threshold is invalid; using the default value.");
  }
  let lastValidThreshold = thresholdInput.value;

  function setAiStatus(message, state = "info") {
    aiStatus.textContent = message;
    aiStatus.dataset.state = state;
    aiStatus.hidden = !message;
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (
      request.action === "analysis_progress" &&
      request.analysisId === activeAnalysisId
    ) {
      setAiStatus(request.message, "working");
    }
  });

  function updateThresholdStatus() {
    if (
      Array.isArray(rawAiTagsObj) &&
      rawAiTagsObj.length > 0 &&
      lastAnalysisThreshold !== null &&
      Number(thresholdInput.value) !== lastAnalysisThreshold
    ) {
      setAiStatus("Threshold changed. Analyze the image again to refresh tags.", "info");
    }
  }

  thresholdInput.oninput = () => {
    if (thresholdInput.value === "" || !thresholdInput.validity.valid) return;
    lastValidThreshold = thresholdInput.value;
    if (Array.isArray(rawAiTagsObj)) updateThresholdStatus();
    else if (Object.keys(rawAiTagsObj).length > 0) {
      renderAiChips();
    }
  };

  thresholdInput.onblur = () => {
    if (!thresholdInput.validity.valid) {
      thresholdInput.value = lastValidThreshold;
    }
    lastValidThreshold = thresholdInput.value;
    chrome.storage.local
      .set({ lazymod_ai_threshold: Number(lastValidThreshold) })
      .catch((error) => {
        console.error("[QuickTag] Could not save the AI threshold.", error);
        setAiStatus(`Could not save AI threshold: ${error.message}`, "error");
      });
    if (Array.isArray(rawAiTagsObj)) updateThresholdStatus();
    else if (Object.keys(rawAiTagsObj).length > 0) {
      renderAiChips();
    }
  };

  analyzeImageButton.onclick = () => {
    const aiContainer = $("#lm-ai-chips");
    const imgUrl = getTargetImageURL();
    if (!imgUrl) {
      setAiStatus("No image found on this page.", "error");
      return;
    }

    const analysisId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestedThreshold = Number(thresholdInput.value || lastValidThreshold);
    activeAnalysisId = analysisId;
    rawAiTagsObj = [];
    aiContainer.innerHTML = "";
    analyzeImageButton.disabled = true;
    analyzeImageButton.setAttribute("aria-busy", "true");
    analyzeImageButton.querySelector("span").textContent = "Analizowanie…";
    setAiStatus("Connecting to ComfyUI...", "working");

    chrome.runtime.sendMessage(
      {
        action: "analyze_image",
        analysisId,
        imgUrl,
        threshold: requestedThreshold,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        analyzeImageButton.disabled = false;
        analyzeImageButton.removeAttribute("aria-busy");
        analyzeImageButton.querySelector("span").textContent = "Analizuj obraz";
        if (analysisId !== activeAnalysisId) return;
        activeAnalysisId = null;
        if (runtimeError) {
          setAiStatus(`Could not start analysis: ${runtimeError.message}`, "error");
          return;
        }
        if (response?.success && Array.isArray(response.data)) {
          rawAiTagsObj = response.data;
          lastAnalysisThreshold = requestedThreshold;
          renderAiChips();
          setAiStatus(
            `Fetched ${response.data.length} tags using threshold ${requestedThreshold.toFixed(2)}.`,
            "success",
          );
          updateThresholdStatus();
        } else {
          aiContainer.innerHTML = "";
          setAiStatus(
            `Analysis failed: ${response?.error || "ComfyUI returned an invalid response."}`,
            "error",
          );
        }
      },
    );
  };

  function renderAiChips() {
    const container = $("#lm-ai-chips"),
      addAllBtn = $("#lm-add-all-ai");
    container.innerHTML = "";
    const currentThreshold = parseFloat(thresholdInput.value);
    const filteredEntries = Array.isArray(rawAiTagsObj)
      ? rawAiTagsObj
          .filter((tag) => !tagBlacklist.includes(formatTag(tag)))
          .map((tag) => [tag, null])
      : Object.entries(rawAiTagsObj).filter(([tag, score]) => {
        const clean = formatTag(tag);
        return score >= currentThreshold && !tagBlacklist.includes(clean);
      });

    if (filteredEntries.length === 0) {
      container.textContent = Array.isArray(rawAiTagsObj)
        ? "No tags returned above the WD14 threshold."
        : "No tags above threshold.";
      addAllBtn.style.display = "none";
      return;
    }

    const mainTags = getMainTags();
    filteredEntries.forEach(([tag, score]) => {
      const cleanTag = formatTag(tag),
        isActive = mainTags.includes(cleanTag);
      const chip = document.createElement("div");
      chip.className = `lazymod-chip ${isActive ? "active" : ""}`;
      chip.dataset.tag = cleanTag;
      chip.innerHTML = `<span class="icon">${isActive ? "−" : "+"}</span> ${cleanTag}${
        Number.isFinite(score)
          ? ` <span class="score">${Math.round(score * 100)}%</span>`
          : ""
      }`;
      chip.onclick = () => toggleTagInMain(cleanTag);
      container.appendChild(chip);
    });

    addAllBtn.style.display = "inline-flex";
    addAllBtn.onclick = () => {
      const current = getMainTags();
      const suggestedTags = [
        ...new Set(filteredEntries.map(([tag]) => formatTag(tag)).filter(Boolean)),
      ];
      const shouldRemove = suggestedTags.every((tag) => current.includes(tag));
      const suggestedSet = new Set(suggestedTags);
      const nextTags = shouldRemove
        ? current.filter((tag) => !suggestedSet.has(tag))
        : [...current, ...suggestedTags.filter((tag) => !current.includes(tag))];
      setMainTags(nextTags);
      updateAiToggleButton();
    };
    updateAiToggleButton();
  }

  function updateAiToggleButton() {
    const button = $("#lm-add-all-ai");
    const tags = [...$("#lm-ai-chips").querySelectorAll(".lazymod-chip")]
      .map((chip) => chip.dataset.tag)
      .filter(Boolean);
    if (tags.length === 0) return;
    const mainTags = new Set(getMainTags());
    const allActive = tags.every((tag) => mainTags.has(tag));
    const icon = button.querySelector(".lazymod-action-icon path");
    button.querySelector("span").textContent = allActive ? "Remove all" : "Add all";
    button.title = allActive ? "Remove all suggested tags" : "Add all suggested tags";
    button.setAttribute("aria-pressed", String(allActive));
    if (icon) icon.setAttribute("d", allActive ? "M2.5 8h11" : "M8 2.5v11M2.5 8h11");
  }

  // Quick Actions
  $("#lm-copy-tags").onclick = () => {
    const input = getMainInput();
    if (input) {
      navigator.clipboard.writeText(input.value);
      alert("Skopiowano tagi do schowka!");
    } else     alert("Target tag input field not found.");
  };

  $("#lm-clear-all").onclick = () => {
    if (confirm("Clear all tags?")) setMainTags([]);
  };
  function updateAllChipStates() {
    const mainTags = getMainTags();
    $$(".lazymod-chip").forEach((chip) => {
      const tag = chip.dataset.tag;
      if (!tag) return;
      const isActive = mainTags.includes(tag),
        iconEl = chip.querySelector(".icon");
      if (isActive) {
        chip.classList.add("active");
        if (iconEl) iconEl.textContent = "−";
      } else {
        chip.classList.remove("active");
        if (iconEl) iconEl.textContent = "+";
      }
    });
    updatePaletteToggleButton();
    updateAiToggleButton();
  }

  function renderSettingsUI() {
    const config = siteConfigs[activeSiteKey] || siteConfigs[".*"];
    $("#lm-settings-profile").textContent = activeSiteKey;
    $("#lm-settings-pattern").textContent = config.urlPattern || activeSiteKey;
    const selectorFields = [
      ["#lm-settings-tag-selector", config.tagInputSelector],
      ["#lm-settings-img-selector", config.imgSelector],
      ["#lm-settings-link-selector", config.linkSelector],
    ];
    selectorFields.forEach(([selector, value]) => {
      const field = $(selector);
      field.textContent = value || "Not configured";
      field.title = value || "Not configured";
    });
    $("#lm-blacklist-count").textContent =
      `${tagBlacklist.length} ${tagBlacklist.length === 1 ? "tag" : "tags"} excluded`;
    const preview = tagBlacklist.slice(0, 6).join(", ");
    const remainingCount = tagBlacklist.length - 6;
    $("#lm-blacklist-preview").textContent = preview
      ? `${preview}${remainingCount > 0 ? `, +${remainingCount} more` : ""}`
      : "No excluded tags";
    $("#lm-blacklist-preview").title = tagBlacklist.join(", ") || "No excluded tags";
  }

  function colorToRgba(hex, alpha) {
    const value = hex.slice(1);
    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function applyTheme(theme = savedTheme, accent = savedCustomAccent) {
    const themeClasses = themeNames.map((name) => `theme-${name}`);
    windowEl.classList.remove(...themeClasses);
    windowEl.classList.add(`theme-${theme}`);
    windowEl.style.removeProperty("--lm-custom-accent");
    windowEl.style.removeProperty("--lm-custom-accent-soft");
    if (theme === "custom") {
      windowEl.style.setProperty("--lm-custom-accent", accent);
      windowEl.style.setProperty("--lm-custom-accent-soft", colorToRgba(accent, 0.16));
    }
    $("#lm-theme-select").value = theme;
    $("#lm-theme-color").value = accent;
    $("#lm-custom-color-control").hidden = theme !== "custom";
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.lazymod_global_site_configs?.newValue) {
      siteConfigs = changes.lazymod_global_site_configs.newValue;
      activeSiteKey = detectActiveSiteKey();
      $("#lm-active-badge").textContent = activeSiteKey;
      renderSettingsUI();
    }
    if (changes.lazymod_global_ai_blacklist?.newValue) {
      const newBlacklist = changes.lazymod_global_ai_blacklist.newValue;
      if (Array.isArray(newBlacklist)) {
        tagBlacklist = [
          ...new Set(newBlacklist.filter((tag) => typeof tag === "string").map(formatTag)),
        ];
        renderSettingsUI();
        if (Object.keys(rawAiTagsObj).length > 0) renderAiChips();
      }
    }
    if (changes.lazymod_theme?.newValue && themeNames.includes(changes.lazymod_theme.newValue)) {
      loadThemeStyles(changes.lazymod_theme.newValue)
        .then((loaded) => {
          if (!loaded) return;
          savedTheme = changes.lazymod_theme.newValue;
          applyTheme();
        })
        .catch((error) => {
          console.error("[QuickTag] Could not load the selected theme.", error);
          setConfigStatus(`Could not load theme: ${error.message}`, "error");
        });
    }
    if (
      changes.lazymod_custom_accent?.newValue &&
      /^#[0-9a-fA-F]{6}$/.test(changes.lazymod_custom_accent.newValue)
    ) {
      savedCustomAccent = changes.lazymod_custom_accent.newValue;
      applyTheme();
    }
  });

  const configStatus = $("#lm-config-status");
  const configFileInput = $("#lm-config-file");

  function setConfigStatus(message, state = "info") {
    configStatus.textContent = message;
    configStatus.dataset.state = state;
    configStatus.hidden = !message;
  }

  $("#lm-theme-select").addEventListener("change", async (event) => {
    const theme = event.currentTarget.value;
    if (!themeNames.includes(theme)) {
      setConfigStatus("Select a supported theme.", "error");
      return;
    }
    try {
      if (!(await loadThemeStyles(theme))) return;
      await chrome.storage.local.set({ lazymod_theme: theme });
      savedTheme = theme;
      applyTheme();
      setConfigStatus("Theme saved.", "success");
    } catch (error) {
      console.error("[QuickTag] Could not save the selected theme.", error);
      setConfigStatus(`Could not save theme: ${error.message}`, "error");
      applyTheme();
    }
  });

  $("#lm-theme-color").addEventListener("input", (event) => {
    const accent = event.currentTarget.value;
    if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return;
    if (savedTheme === "custom") applyTheme("custom", accent);
  });

  $("#lm-theme-color").addEventListener("change", async (event) => {
    const accent = event.currentTarget.value;
    if (!/^#[0-9a-fA-F]{6}$/.test(accent)) {
      setConfigStatus("Choose a valid custom color.", "error");
      return;
    }
    try {
      await chrome.storage.local.set({
        lazymod_theme: "custom",
        lazymod_custom_accent: accent,
      });
      savedTheme = "custom";
      savedCustomAccent = accent;
      applyTheme();
      setConfigStatus("Custom theme saved.", "success");
    } catch (error) {
      console.error("[QuickTag] Could not save the custom theme.", error);
      setConfigStatus(`Could not save custom theme: ${error.message}`, "error");
      applyTheme();
    }
  });

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isValidPaletteGroups(groups) {
    if (!isRecord(groups) || Object.keys(groups).length === 0) return false;
    return Object.values(groups).every((categories) => {
      if (Array.isArray(categories)) {
        return categories.every((tag) => typeof tag === "string");
      }
      return (
        isRecord(categories) &&
        Object.keys(categories).length > 0 &&
        Object.values(categories).every(
          (tags) => Array.isArray(tags) && tags.every((tag) => typeof tag === "string"),
        )
      );
    });
  }

  function isValidPalettePack(pack) {
    const groups =
      pack?.groups ||
      pack?.folders ||
      (isRecord(pack)
        ? Object.fromEntries(
            Object.entries(pack).filter(
              ([key]) =>
                !["name", "activeFolder", "activeGroup", "activeCategory"].includes(key),
            ),
          )
        : null);
    return (
      isRecord(pack) &&
      (typeof pack.name === "undefined" || typeof pack.name === "string") &&
      isValidPaletteGroups(groups)
    );
  }

  function validateConfigData(data) {
    if (!isRecord(data)) throw new Error("The backup data must be a JSON object.");
    if (Object.keys(data).some((key) => !key.startsWith("lazymod_"))) {
      throw new Error("The backup contains unsupported storage keys.");
    }

    if (data.lazymod_global_ai_blacklist !== undefined) {
      if (
        !Array.isArray(data.lazymod_global_ai_blacklist) ||
        !data.lazymod_global_ai_blacklist.every((tag) => typeof tag === "string")
      ) {
        throw new Error("The AI blacklist in this backup is invalid.");
      }
    }

    if (data.lazymod_global_site_configs !== undefined) {
      const configs = data.lazymod_global_site_configs;
      if (
        !isRecord(configs) ||
        !Object.values(configs).every(
          (config) =>
            isRecord(config) &&
            ["urlPattern", "tagInputSelector", "imgSelector", "linkSelector"].every(
              (key) =>
                config[key] === undefined || typeof config[key] === "string",
            ) &&
            (config.isXPath === undefined || typeof config.isXPath === "boolean"),
        )
      ) {
        throw new Error("The site profiles in this backup are invalid.");
      }
    }

    if (data.lazymod_builtin_palette_override !== undefined) {
      if (!isValidPalettePack(data.lazymod_builtin_palette_override)) {
        throw new Error("The built-in palette in this backup is invalid.");
      }
    }

    if (data.lazymod_global_palettes !== undefined) {
      const palettes = data.lazymod_global_palettes;
      if (isRecord(palettes?.packs)) {
        if (
          typeof palettes.activePackId !== "string" ||
          !isRecord(palettes.packs[palettes.activePackId]) ||
          !Object.values(palettes.packs).every(isValidPalettePack)
        ) {
          throw new Error("The palettes in this backup are invalid.");
        }
      } else if (!isValidPaletteGroups(palettes?.folders)) {
        throw new Error("The palettes in this backup are invalid.");
      }
    }

    const booleanSettings = [
      "lazymod_enabled",
      "lazymod_docked",
      "lazymod_ghost_mode",
      "lazymod_ghost_hold_mode",
    ];
    booleanSettings.forEach((key) => {
      if (data[key] !== undefined && typeof data[key] !== "boolean") {
        throw new Error(`The ${key} setting in this backup is invalid.`);
      }
    });

    if (
      data.lazymod_domain_mode !== undefined &&
      !["blacklist", "whitelist"].includes(data.lazymod_domain_mode)
    ) {
      throw new Error("The domain access mode in this backup is invalid.");
    }
    if (
      data.lazymod_domains !== undefined &&
      (!Array.isArray(data.lazymod_domains) ||
        !data.lazymod_domains.every((domain) => typeof domain === "string"))
    ) {
      throw new Error("The domain list in this backup is invalid.");
    }
    if (
      data.lazymod_site_blacklist !== undefined &&
      (!Array.isArray(data.lazymod_site_blacklist) ||
        !data.lazymod_site_blacklist.every((domain) => typeof domain === "string"))
    ) {
      throw new Error("The per-site blacklist in this backup is invalid.");
    }

    if (
      data.lazymod_theme !== undefined &&
      (typeof data.lazymod_theme !== "string" || !themeNames.includes(data.lazymod_theme))
    ) {
      throw new Error("The selected theme in this backup is invalid.");
    }

    if (
      data.lazymod_custom_accent !== undefined &&
      (typeof data.lazymod_custom_accent !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(data.lazymod_custom_accent))
    ) {
      throw new Error("The custom accent color in this backup is invalid.");
    }

    if (
      data.lazymod_dock_position !== undefined &&
      !["left", "right", "top", "bottom"].includes(data.lazymod_dock_position)
    ) {
      throw new Error("The docking position in this backup is invalid.");
    }

    const layoutKeys = Object.keys(data).filter((key) =>
      key.startsWith("lazymod_site_layout_"),
    );
    if (
      !layoutKeys.every((key) => {
        const layout = data[key];
        return (
          isRecord(layout) &&
          typeof layout.docked === "boolean" &&
          ["left", "right", "top", "bottom"].includes(layout.dockPosition) &&
          (layout.visible === undefined || typeof layout.visible === "boolean") &&
          (layout.position === undefined ||
            (isRecord(layout.position) &&
              typeof layout.position.top === "string" &&
              typeof layout.position.left === "string"))
        );
      })
    ) {
      throw new Error("The per-site window layouts in this backup are invalid.");
    }

    if (data.lazymod_scale !== undefined) {
      const scale = Number(data.lazymod_scale);
      if (!Number.isFinite(scale) || scale < 0.75 || scale > 1.3) {
        throw new Error("The window scale in this backup is invalid.");
      }
    }

    if (data.lazymod_ai_threshold !== undefined) {
      const threshold = Number(data.lazymod_ai_threshold);
      if (!Number.isFinite(threshold) || threshold < 0.1 || threshold > 0.8) {
        throw new Error("The AI threshold in this backup is invalid.");
      }
    }

    if (data.lazymod_ghost_shortcut !== undefined) {
      const shortcut = data.lazymod_ghost_shortcut;
      if (
        !isRecord(shortcut) ||
        !["ctrl", "alt", "shift", "meta"].every(
          (key) => typeof shortcut[key] === "boolean",
        ) ||
        typeof shortcut.key !== "string" ||
        !shortcut.key
      ) {
        throw new Error("The ghost mode shortcut in this backup is invalid.");
      }
    }

    if (data.lazymod_win_pos !== undefined) {
      const position = data.lazymod_win_pos;
      if (
        !isRecord(position) ||
        typeof position.top !== "string" ||
        typeof position.left !== "string"
      ) {
        throw new Error("The window position in this backup is invalid.");
      }
    }

    if (data.lazymod_win_size !== undefined) {
      const size = data.lazymod_win_size;
      if (
        !isRecord(size) ||
        !Number.isFinite(size.width) ||
        size.width <= 0 ||
        !Number.isFinite(size.height) ||
        size.height <= 0
      ) {
        throw new Error("The window size in this backup is invalid.");
      }
    }
  }

  $("#lm-export-config").onclick = async () => {
    try {
      const data = await chrome.storage.local.get(null);
      const backup = {
        format: "quicktag-lazymod-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        data,
      };
      const blobUrl = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `quicktag-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setConfigStatus("Configuration exported successfully.", "success");
    } catch (error) {
      console.error("[QuickTag] Could not export the configuration.", error);
      setConfigStatus(`Could not export configuration: ${error.message}`, "error");
    }
  };

  $("#lm-import-config").onclick = () => configFileInput.click();
  configFileInput.onchange = async () => {
    const file = configFileInput.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (
        !isRecord(backup) ||
        backup.format !== "quicktag-lazymod-backup" ||
        backup.version !== 1
      ) {
        throw new Error("This is not a supported QuickTag configuration backup.");
      }
      validateConfigData(backup.data);
      if (
        !confirm(
          "Import this configuration? It will replace all current QuickTag settings, palettes, and profiles. The current page will reload.",
        )
      ) {
        return;
      }

      const previousData = await chrome.storage.local.get(null);
      try {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(backup.data);
      } catch (error) {
        try {
          await chrome.storage.local.clear();
          await chrome.storage.local.set(previousData);
        } catch (restoreError) {
          throw new Error(
            `Import failed (${error.message}), and restoring the previous configuration also failed (${restoreError.message}).`,
          );
        }
        throw error;
      }

      setConfigStatus("Configuration imported. Reloading this page…", "success");
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      console.error("[QuickTag] Could not import the configuration.", error);
      setConfigStatus(`Could not import configuration: ${error.message}`, "error");
    } finally {
      configFileInput.value = "";
    }
  };

  $("#lm-reset-config").onclick = async () => {
    if (
      !confirm(
        "Restore QuickTag to its original state? This will permanently delete all saved QuickTag palettes, profiles, and settings. The current page will reload.",
      )
    ) {
      return;
    }
    try {
      await chrome.storage.local.clear();
      setConfigStatus("QuickTag defaults restored. Reloading this page…", "success");
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      console.error("[QuickTag] Could not restore the default configuration.", error);
      setConfigStatus(`Could not restore defaults: ${error.message}`, "error");
    }
  };

  function escapeCssIdentifier(value) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function getUniqueElementSelector(element) {
    if (element.id) {
      const idSelector = `#${escapeCssIdentifier(element.id)}`;
      if (document.querySelectorAll(idSelector).length === 1) return idSelector;
    }

    const candidates = [];
    if (element.getAttribute("name")) {
      candidates.push(
        `${element.tagName.toLowerCase()}[name="${element.getAttribute("name").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
      );
    }
    if (element.classList.length) {
      candidates.push(
        `${element.tagName.toLowerCase()}${[...element.classList].map((className) => `.${escapeCssIdentifier(className)}`).join("")}`,
      );
    }
    for (const selector of candidates) {
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch (error) {
        console.warn("[QuickTag] Could not validate a generated CSS selector.", error);
      }
    }

    const parts = [];
    let current = element;
    while (current && current !== document.documentElement) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part = `#${escapeCssIdentifier(current.id)}`;
        parts.unshift(part);
        const selector = parts.join(" > ");
        try {
          if (document.querySelectorAll(selector).length === 1) return selector;
        } catch (error) {
          console.warn("[QuickTag] Could not validate a generated CSS selector.", error);
        }
        break;
      }

      const siblings = current.parentElement
        ? [...current.parentElement.children].filter(
            (sibling) => sibling.tagName === current.tagName,
          )
        : [];
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      const selector = parts.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch (error) {
        console.warn("[QuickTag] Could not validate a generated CSS selector.", error);
      }
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  $("#lm-add-current-site").onclick = () => {
    const host = window.location.hostname;
    const safePath = window.location.pathname.replace(
      /[-[\]{}()*+?.,\\^$|#\s]/g,
      "\\$&",
    );
    const patternKey = `${host}${safePath}`;

    if (!siteConfigs[patternKey]) {
      siteConfigs[patternKey] = {
        urlPattern: patternKey,
        tagInputSelector: "#tags, textarea[name='tags']",
        imgSelector: "#image, img",
        linkSelector: "a.image-link, input[name='source']",
        isXPath: false,
      };
    }
    activeSiteKey = patternKey;
    $("#lm-active-badge").textContent = activeSiteKey;
    chrome.storage.local.set({ lazymod_global_site_configs: siteConfigs })
      .then(renderSettingsUI)
      .catch((error) => {
        console.error("[QuickTag] Could not save the current page profile.", error);
        alert(`Could not save the current page profile: ${error.message}`);
      });
  };

  $("#lm-edit-site-configs").onclick = () => {
    chrome.runtime.sendMessage(
      { action: "open_site_config_editor" },
      (response) => {
        if (chrome.runtime.lastError) {
          alert(`Could not open settings editor: ${chrome.runtime.lastError.message}`);
        } else if (!response?.success) {
          alert(`Could not open settings editor: ${response?.error || "Unknown error"}`);
        }
      },
    );
  };

  $("#lm-edit-blacklist").onclick = () => {
    chrome.runtime.sendMessage(
      { action: "open_ai_blacklist_editor" },
      (response) => {
        if (chrome.runtime.lastError) {
          alert(`Could not open AI blacklist editor: ${chrome.runtime.lastError.message}`);
        } else if (!response?.success) {
          alert(`Could not open AI blacklist editor: ${response?.error || "Unknown error"}`);
        }
      },
    );
  };

  let elementPickerType = null;
  let pickerMarker = null;
  let pickerLabel = null;
  let pickerBanner = null;
  let pickerOriginalCursor = null;
  let pickerProfileKey = null;
  let pickerTarget = null;

  function stopElementPicker() {
    if (!elementPickerType) return;
    document.removeEventListener("pointermove", updatePickerMarker, true);
    document.removeEventListener("scroll", updatePickerMarkerPosition, true);
    document.removeEventListener("click", handlePickerClick, true);
    document.removeEventListener("keydown", handlePickerKeydown, true);
    if (pickerMarker) pickerMarker.remove();
    if (pickerLabel) pickerLabel.remove();
    if (pickerBanner) pickerBanner.remove();
    pickerMarker = null;
    pickerLabel = null;
    pickerBanner = null;
    pickerTarget = null;
    elementPickerType = null;
    pickerProfileKey = null;
    if (pickerOriginalCursor) {
      if (pickerOriginalCursor.value) {
        document.documentElement.style.setProperty(
          "cursor",
          pickerOriginalCursor.value,
          pickerOriginalCursor.priority,
        );
      } else {
        document.documentElement.style.removeProperty("cursor");
      }
      pickerOriginalCursor = null;
    }
  }

  function updatePickerMarker(event) {
    if (hostDiv.contains(event.target)) {
      pickerMarker.style.display = "none";
      pickerLabel.style.display = "none";
      pickerTarget = null;
      return;
    }
    if (!(event.target instanceof Element)) return;
    pickerTarget = event.target;
    updatePickerMarkerPosition();
  }

  function updatePickerMarkerPosition() {
    if (!pickerTarget?.isConnected) {
      pickerMarker.style.display = "none";
      pickerLabel.style.display = "none";
      return;
    }
    const rect = pickerTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      pickerMarker.style.display = "none";
      pickerLabel.style.display = "none";
      return;
    }
    Object.assign(pickerMarker.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const identifier = pickerTarget.id ? `#${pickerTarget.id}` : "";
    const classes = [...pickerTarget.classList]
      .slice(0, 2)
      .map((className) => `.${className}`)
      .join("");
    pickerLabel.textContent = `${pickerTarget.tagName.toLowerCase()}${identifier}${classes}`;
    pickerLabel.style.display = "block";
    const labelWidth = pickerLabel.getBoundingClientRect().width;
    pickerLabel.style.left = `${Math.max(
      8,
      Math.min(rect.left, window.innerWidth - labelWidth - 8),
    )}px`;
    pickerLabel.style.top = `${Math.max(8, rect.top - 30)}px`;
  }

  function handlePickerKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopElementPicker();
    }
  }

  function handlePickerClick(event) {
    if (hostDiv.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = event.target;
    if (
      elementPickerType === "tagInputSelector" &&
      !(
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          ["text", "search"].includes(target.type))
      )
    ) {
      alert("Pick a text or textarea input for the tag field.");
      stopElementPicker();
      return;
    }
    if (elementPickerType === "imgSelector" && !(target instanceof HTMLImageElement)) {
      alert("Pick an image element.");
      stopElementPicker();
      return;
    }
    if (
      elementPickerType === "linkSelector" &&
      !(
        target instanceof HTMLAnchorElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      )
    ) {
      alert("Pick a link or a source input field.");
      stopElementPicker();
      return;
    }

    const selector = getUniqueElementSelector(target);
    const config = siteConfigs[pickerProfileKey] || siteConfigs[".*"];
    siteConfigs = {
      ...siteConfigs,
      [pickerProfileKey]: {
        ...config,
        [elementPickerType]: selector,
        isXPath: false,
      },
    };
    chrome.storage.local.set({ lazymod_global_site_configs: siteConfigs })
      .then(renderSettingsUI)
      .catch((error) => {
        console.error("[QuickTag] Could not save the picked selector.", error);
        alert(`Could not save selector: ${error.message}`);
      });
    stopElementPicker();
  }

  function startElementPicker(selectorType) {
    stopElementPicker();
    const config = siteConfigs[activeSiteKey] || siteConfigs[".*"];
    if (config.isXPath) {
      alert(
        "This profile uses XPath selectors. Change isXPath to false in the profiles JSON editor before using the CSS picker.",
      );
      return;
    }
    elementPickerType = selectorType;
    pickerProfileKey = activeSiteKey;
    pickerMarker = document.createElement("div");
    pickerMarker.className = "lazymod-picker-highlight";
    shadowRoot.appendChild(pickerMarker);
    pickerLabel = document.createElement("div");
    pickerLabel.className = "lazymod-picker-label";
    shadowRoot.appendChild(pickerLabel);
    pickerBanner = document.createElement("div");
    pickerBanner.className = "lazymod-picker-banner";
    const fieldName = {
      tagInputSelector: "the tag input",
      imgSelector: "the image",
      linkSelector: "the source link or field",
    }[selectorType];
    pickerBanner.textContent = `Click ${fieldName} on the page. Press Esc to cancel.`;
    shadowRoot.appendChild(pickerBanner);
    pickerOriginalCursor = {
      value: document.documentElement.style.getPropertyValue("cursor"),
      priority: document.documentElement.style.getPropertyPriority("cursor"),
    };
    document.documentElement.style.setProperty("cursor", "crosshair", "important");
    document.addEventListener("pointermove", updatePickerMarker, true);
    document.addEventListener("scroll", updatePickerMarkerPosition, true);
    document.addEventListener("click", handlePickerClick, true);
    document.addEventListener("keydown", handlePickerKeydown, true);
  }

  $$("[data-pick-type]").forEach((button) => {
    button.onclick = () => startElementPicker(button.dataset.pickType);
  });

  // Dock & Scale
  const dockBtn = $("#lm-dock-btn");
  const scaleSlider = $("#lm-scale-slider");
  const resizeHandle = $("#lm-resize-handle");
  const dockPositionSelect = $("#lm-dock-position");
  const collapseButton = $("#lm-toggle-body");
  const hideTaggerButton = $("#lm-hide-tagger");
  const showTaggerButton = document.createElement("button");
  showTaggerButton.type = "button";
  showTaggerButton.id = "lm-show-tagger";
  showTaggerButton.className = "lazymod-edge-tab";
  showTaggerButton.setAttribute("aria-label", "Show QuickTag");
  showTaggerButton.title = "Show QuickTag";
  showTaggerButton.hidden = !windowEl.hidden;
  const showTaggerIcon = document.createElement("span");
  showTaggerIcon.setAttribute("aria-hidden", "true");
  showTaggerButton.appendChild(showTaggerIcon);
  shadowRoot.appendChild(showTaggerButton);
  const ghostToggle = $("#lm-ghost-toggle");
  const ghostHoldCheckbox = $("#lm-ghost-hold");
  const ghostShortcutButton = $("#lm-ghost-shortcut");
  let ghostHoldMode = Boolean(savedGhostHoldMode);
  let ghostMode = Boolean(savedGhostMode) && !ghostHoldMode;
  let transientGhostActive = false;
  let ghostShortcutHeld = false;
  let ghostButtonPointerId = null;
  let isRecordingGhostShortcut = false;
  let ghostShortcut = {
    ctrl: Boolean(savedGhostShortcut?.ctrl),
    alt: Boolean(savedGhostShortcut?.alt),
    shift: Boolean(savedGhostShortcut?.shift),
    meta: Boolean(savedGhostShortcut?.meta),
    key: typeof savedGhostShortcut?.key === "string"
      ? savedGhostShortcut.key.toLowerCase()
      : "g",
  };

  function updateGhostUI() {
    const enabled = ghostHoldMode ? transientGhostActive : ghostMode;
    windowEl.classList.toggle("ghost-mode", enabled);
    ghostToggle.setAttribute("aria-pressed", String(enabled));
    ghostToggle.title = ghostHoldMode
      ? "Hold to activate ghost mode"
      : enabled
        ? "Turn off ghost mode"
        : "Turn on ghost mode";
  }

  function formatGhostShortcut(shortcut) {
    const modifiers = [];
    if (shortcut.ctrl) modifiers.push("Ctrl");
    if (shortcut.alt) modifiers.push("Alt");
    if (shortcut.shift) modifiers.push("Shift");
    if (shortcut.meta) modifiers.push("Meta");
    const key = shortcut.key.length === 1
      ? shortcut.key.toUpperCase()
      : shortcut.key.replace(/^Arrow/, "");
    return [...modifiers, key].join(" + ");
  }

  function setGhostMode(enabled) {
    ghostMode = enabled;
    updateGhostUI();
    saveData("lazymod_ghost_mode", ghostMode);
  }

  function updateTransientGhostMode() {
    const enabled = ghostButtonPointerId !== null || ghostShortcutHeld;
    if (!ghostHoldMode || transientGhostActive === enabled) return;
    transientGhostActive = enabled;
    updateGhostUI();
  }

  function releaseGhostButton() {
    ghostButtonPointerId = null;
    updateTransientGhostMode();
  }

  function releaseGhostMode() {
    ghostShortcutHeld = false;
    releaseGhostButton();
  }

  function setTaggerCollapsed(collapsed) {
    windowEl.classList.toggle("is-collapsed", collapsed);
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.setAttribute(
      "aria-label",
      collapsed ? "Expand tagger" : "Collapse tagger",
    );
    collapseButton.title = collapsed ? "Expand tagger" : "Collapse tagger";
    const iconPath = collapseButton.querySelector("svg path");
    if (iconPath) {
      iconPath.setAttribute(
        "d",
        collapsed ? "M3 3.5h10v9H3z" : "M3 8h10",
      );
    }
    updateDockPageSpace();
  }

  function updateShowTaggerButtonPosition() {
    const positions = ["left", "right", "top", "bottom"];
    showTaggerButton.classList.remove(...positions.map((position) => `edge-${position}`));
    showTaggerButton.classList.add(`edge-${activeDockPosition}`);
    showTaggerButton.querySelector("span").textContent = {
      left: "‹",
      right: "›",
      top: "⌄",
      bottom: "⌃",
    }[activeDockPosition];
  }

  function hideTaggerToEdge() {
    windowEl.hidden = true;
    showTaggerButton.hidden = false;
    updateShowTaggerButtonPosition();
    updateDockPageSpace();
    persistPageLayout({ visible: false });
  }

  function showTaggerFromEdge() {
    windowEl.hidden = false;
    showTaggerButton.hidden = true;
    applyWindowScale(parseFloat(scaleSlider.value) || 1);
    updateDockPageSpace();
    persistPageLayout({ visible: true });
  }

  updateGhostUI();
  ghostHoldCheckbox.checked = ghostHoldMode;
  ghostShortcutButton.textContent = formatGhostShortcut(ghostShortcut);
  dockPositionSelect.value = activeDockPosition;
  dockBtn.textContent = isDocked ? "Undock" : "Dock";

  dockBtn.onclick = () => {
    const dockedNow = windowEl.classList.toggle("docked");
    isDocked = dockedNow;
    persistPageLayout({ docked: dockedNow });
    dockBtn.textContent = dockedNow ? "Undock" : "Dock";

    if (dockedNow) {
      windowEl.style.top = "";
      windowEl.style.left = "";
    } else {
      updateDockPageSpace();
      windowEl.classList.remove(...dockEdges.map((edge) => `docked-${edge}`));
      windowEl.style.height = "";
      const floatPosition = savedPageLayout?.position || savedPos;
      windowEl.style.top = floatPosition.top;
      windowEl.style.left = floatPosition.left;
    }
    if (dockedNow) applyDockPositionClass();
    applyWindowScale(parseFloat(scaleSlider.value));
  };

  dockPositionSelect.onchange = () => {
    if (!dockEdges.includes(dockPositionSelect.value)) return;
    activeDockPosition = dockPositionSelect.value;
    persistPageLayout({ dockPosition: activeDockPosition });
    updateShowTaggerButtonPosition();
    if (windowEl.classList.contains("docked")) {
      applyDockPositionClass();
      applyWindowScale(parseFloat(scaleSlider.value));
    }
  };

  ghostHoldCheckbox.onchange = () => {
    ghostHoldMode = ghostHoldCheckbox.checked;
    transientGhostActive = false;
    ghostShortcutHeld = false;
    ghostButtonPointerId = null;
    if (ghostHoldMode) {
      ghostMode = false;
      saveData("lazymod_ghost_mode", false);
    }
    saveData("lazymod_ghost_hold_mode", ghostHoldMode);
    updateGhostUI();
  };
  ghostToggle.onpointerdown = (event) => {
    if (!ghostHoldMode || event.button !== 0) return;
    event.preventDefault();
    ghostButtonPointerId = event.pointerId;
    ghostToggle.setPointerCapture(event.pointerId);
    updateTransientGhostMode();
  };
  ghostToggle.onpointerup = (event) => {
    if (ghostButtonPointerId !== event.pointerId) return;
    releaseGhostButton();
  };
  ghostToggle.onpointercancel = releaseGhostButton;
  ghostToggle.onlostpointercapture = (event) => {
    if (ghostButtonPointerId === event.pointerId) releaseGhostButton();
  };
  ghostToggle.onclick = () => {
    if (!ghostHoldMode) setGhostMode(!ghostMode);
  };
  ghostShortcutButton.onclick = () => {
    isRecordingGhostShortcut = true;
    ghostShortcutButton.textContent = "Press shortcut…";
    ghostShortcutButton.focus();
  };
  document.addEventListener("keydown", (event) => {
    if (!siteAccessAllowed) return;
    if (isRecordingGhostShortcut) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        isRecordingGhostShortcut = false;
        ghostShortcutButton.textContent = formatGhostShortcut(ghostShortcut);
        return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        ghostShortcutButton.textContent = "Use a modifier + key";
        return;
      }
      ghostShortcut = {
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        key: event.key.toLowerCase(),
      };
      isRecordingGhostShortcut = false;
      ghostShortcutButton.textContent = formatGhostShortcut(ghostShortcut);
      saveData("lazymod_ghost_shortcut", ghostShortcut);
      return;
    }
    if (
      event.ctrlKey === ghostShortcut.ctrl &&
      event.altKey === ghostShortcut.alt &&
      event.shiftKey === ghostShortcut.shift &&
      event.metaKey === ghostShortcut.meta &&
      event.key.toLowerCase() === ghostShortcut.key
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (ghostHoldMode) {
        ghostShortcutHeld = true;
        updateTransientGhostMode();
      } else {
        setGhostMode(!ghostMode);
      }
    }
  }, true);
  document.addEventListener("keyup", (event) => {
    if (!siteAccessAllowed || !ghostShortcutHeld) return;
    const key = event.key.toLowerCase();
    if (
      key === ghostShortcut.key ||
      (ghostShortcut.ctrl && key === "control") ||
      (ghostShortcut.alt && key === "alt") ||
      (ghostShortcut.shift && key === "shift") ||
      (ghostShortcut.meta && key === "meta")
    ) {
      ghostShortcutHeld = false;
      updateTransientGhostMode();
    }
  }, true);
  window.addEventListener("blur", releaseGhostMode);
  collapseButton.onclick = () =>
    setTaggerCollapsed(!windowEl.classList.contains("is-collapsed"));
  hideTaggerButton.onclick = hideTaggerToEdge;
  showTaggerButton.onclick = showTaggerFromEdge;
  updateShowTaggerButtonPosition();
  if (!savedPageLayout || savedPageLayout.visible === undefined) {
    persistPageLayout({
      docked: isDocked,
      dockPosition: activeDockPosition,
      visible: !windowEl.hidden,
      position: savedPos,
    });
  }

  scaleSlider.oninput = () => {
    $("#lm-scale-value").textContent = `${Math.round(parseFloat(scaleSlider.value) * 100)}%`;
    if (windowEl.classList.contains("docked")) {
      applyWindowScale(parseFloat(scaleSlider.value));
    }
  };

  scaleSlider.onchange = () => {
    const scale = applyWindowScale(parseFloat(scaleSlider.value));
    saveData("lazymod_scale", scale);
    if (!windowEl.classList.contains("docked")) {
      persistPageLayout({
        position: { top: windowEl.style.top, left: windowEl.style.left },
      });
    }
  };

  let resizeState = null;

  function finishWindowResize() {
    if (!resizeState) return;
    resizeState = null;
    windowEl.classList.remove("resizing");
    saveData("lazymod_win_size", {
      width: parseFloat(windowEl.style.width),
      height: parseFloat(windowEl.style.height),
    });
    persistPageLayout({
      position: { top: windowEl.style.top, left: windowEl.style.left },
    });
  }

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (windowEl.classList.contains("docked")) return;
    event.preventDefault();
    const scale = parseFloat(scaleSlider.value) || 1;
    const style = getComputedStyle(windowEl);
    resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: parseFloat(style.width),
      startHeight: parseFloat(style.height),
      startLeft: parseFloat(windowEl.style.left) || windowEl.getBoundingClientRect().left,
      startTop: parseFloat(windowEl.style.top) || windowEl.getBoundingClientRect().top,
      scale,
    };
    windowEl.classList.add("resizing");
    resizeHandle.setPointerCapture(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    event.preventDefault();
    const maxWidth = Math.max(1, window.innerWidth - 24) / resizeState.scale;
    const maxHeight = Math.max(1, window.innerHeight - 24) / resizeState.scale;
    const width = Math.max(
      Math.min(320, maxWidth),
      Math.min(
        maxWidth,
        resizeState.startWidth -
          (event.clientX - resizeState.startX) / resizeState.scale,
      ),
    );
    const height = Math.max(
      Math.min(240, maxHeight),
      Math.min(
        maxHeight,
        resizeState.startHeight +
          (event.clientY - resizeState.startY) / resizeState.scale,
      ),
    );
    windowEl.style.width = `${width}px`;
    windowEl.style.height = `${height}px`;
    windowEl.style.left = `${
      resizeState.startLeft +
      (resizeState.startWidth - width)
    }px`;
    windowEl.style.top = `${resizeState.startTop}px`;
    applyWindowScale(resizeState.scale);
  });

  document.addEventListener("pointerup", (event) => {
    if (resizeState && event.pointerId === resizeState.pointerId) finishWindowResize();
  });
  document.addEventListener("pointercancel", (event) => {
    if (resizeState && event.pointerId === resizeState.pointerId) finishWindowResize();
  });

  window.addEventListener("resize", () => {
    if (windowEl.hidden) return;
    const scale = applyWindowScale(parseFloat(scaleSlider.value) || 1);
    saveData("lazymod_scale", scale);
    if (!windowEl.classList.contains("docked")) {
      persistPageLayout({
        position: { top: windowEl.style.top, left: windowEl.style.left },
      });
    }
  });

  const handle = $("#lazymod-drag-handle");
  let isDragging = false,
    offsetX = 0,
    offsetY = 0;

  handle.addEventListener("mousedown", (e) => {
    if (
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      windowEl.classList.contains("docked")
    )
      return;
    isDragging = true;
    const rect = windowEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging || windowEl.classList.contains("docked")) return;
    const left = `${e.clientX - offsetX}px`,
      top = `${e.clientY - offsetY}px`;
    windowEl.style.left = left;
    windowEl.style.top = top;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    persistPageLayout({
      position: { top: windowEl.style.top, left: windowEl.style.left },
    });
  });
  setInterval(() => {
    const currentDetected = detectActiveSiteKey();
    if (currentDetected !== activeSiteKey) {
      activeSiteKey = currentDetected;
      $("#lm-active-badge").textContent = activeSiteKey;
      renderSettingsUI();
    }
    const input = getMainInput();
    if (input) {
      input.removeEventListener("input", updateAllChipStates);
      input.addEventListener("input", updateAllChipStates);
    }
  }, 1500);

  function updateTagCounter() {
    const countEl = $("#lm-tag-count-badge");
    if (!countEl) return;
    countEl.textContent = `Tags: ${getMainTags().length}`;
  }

  // INIT
  applyTheme();
  renderFoldersUI();
  extensionReady = true;
  hostDiv.style.visibility = "visible";
  if (siteAccessAllowed) updateDockPageSpace();
})();
