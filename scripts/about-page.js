// About page: interactive "What's new" demos. They use the extension's own
// shared modules (ghost scroll, Focus Mode layout transforms, pack summary)
// on sample data and never touch storage. DOM is built with createElement /
// textContent / replaceChildren only.
import { attachGhostScroll } from "./shared/ghost-scroll.js";
import { createDefaultFocusLayout, resizePanel, swapPanels } from "./shared/focus-layout.js";
import { summarizePack } from "./shared/file-hub.js";

function el(tagName, { className, text, attrs } = {}, children = []) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  Object.entries(attrs || {}).forEach(([name, value]) => element.setAttribute(name, value));
  element.append(...children.filter(Boolean));
  return element;
}

// --- Pack switcher: deep search and ghost scroll ---

const DEMO_PACKS = [
  { name: "Character Portrait Pack", source: "Local", groups: { Subject: { Hair: ["long_hair", "short_hair", "ponytail"], Eyes: ["blue_eyes", "green_eyes"] } } },
  { name: "Anthro & Fursuit Pack", source: "File Hub 1.0.0", groups: { Species: { Canine: ["wolf", "fox", "husky"], Feline: ["cat", "lynx"] } } },
  { name: "Weather & Sky Pack", source: "File Hub 1.0.0", groups: { Sky: { Weather: ["rain", "snow", "fog"], Time: ["sunset", "night"] } } },
  { name: "Lighting Essentials", source: "Local", groups: { Lighting: { Mood: ["rim_light", "backlighting", "soft_light"] } } },
  { name: "Composition Basics", source: "Local", groups: { Camera: { Framing: ["close-up", "wide_shot", "from_above"] } } },
  { name: "Fantasy Creatures", source: "File Hub 1.1.0", groups: { Creatures: { Dragons: ["dragon", "wyvern"], Spirits: ["kitsune", "wisp"] } } },
  { name: "Clothing & Outfits", source: "Local", groups: { Outfit: { Tops: ["hoodie", "shirt"], Accessories: ["scarf", "hat"] } } },
  { name: "Backgrounds", source: "Local", groups: { Scene: { Outdoor: ["forest", "beach", "mountain"], Indoor: ["cafe", "library"] } } },
  { name: "Art Styles", source: "File Hub 1.0.0", groups: { Style: { Medium: ["watercolor", "oil_painting", "pixel_art"] } } },
  { name: "Expressions", source: "Local", groups: { Face: { Mood: ["smile", "smug", "surprised", "sleepy"] } } },
  { name: "Poses & Actions", source: "Local", groups: { Body: { Pose: ["sitting", "running", "jumping", "waving"] } } },
  { name: "Seasonal Events", source: "File Hub 1.2.0", groups: { Events: { Holidays: ["halloween", "christmas", "new_year"] } } },
];

/** First match in a pack: name, source, group, category, then tag. */
function matchPack(pack, query) {
  if (pack.name.toLowerCase().includes(query)) return { kind: "name", text: "" };
  if (pack.source.toLowerCase().includes(query)) return { kind: "source", text: pack.source };
  for (const [group, categories] of Object.entries(pack.groups)) {
    if (group.toLowerCase().includes(query)) return { kind: "group", text: group };
    for (const [category, tags] of Object.entries(categories)) {
      if (category.toLowerCase().includes(query)) return { kind: "category", text: category };
      const tag = tags.find((item) => item.toLowerCase().includes(query));
      if (tag) return { kind: "tag", text: tag };
    }
  }
  return null;
}

function initPackDemo() {
  const search = document.getElementById("demo-pack-search");
  const list = document.getElementById("demo-pack-list");
  const ghost = document.getElementById("demo-pack-ghost");
  const status = document.getElementById("demo-pack-status");
  if (!search || !list || !ghost) return;
  let selected = DEMO_PACKS[0].name;

  const ghostScroll = attachGhostScroll({
    list,
    ghost,
    renderGhost: (item, index, total) => [
      el("span", { className: "demo-ghost-name", text: item.querySelector(".demo-pack-name")?.textContent || "" }),
      el("span", { className: "demo-ghost-position", text: `${index + 1} / ${total}` }),
    ],
  });

  function render() {
    const query = search.value.trim().toLowerCase();
    const rows = DEMO_PACKS.map((pack) => ({ pack, match: query ? matchPack(pack, query) : { kind: "name", text: "" } })).filter((row) => row.match);
    list.replaceChildren(
      ...rows.map(({ pack, match }) => {
        const tagCount = Object.values(pack.groups).flatMap((categories) => Object.values(categories).flat()).length;
        const button = el("button", { className: "demo-pack-select", attrs: { type: "button" } }, [
          el("span", { className: "demo-pack-name", text: pack.name }),
          el("span", { className: "demo-pack-meta", text: `${pack.source} · ${tagCount} tags` }),
          match.kind !== "name" ? el("span", { className: "demo-pack-match", text: `${match.kind}: ${match.text}` }) : null,
        ]);
        button.addEventListener("click", () => {
          selected = pack.name;
          status.textContent = `Selected "${pack.name}".`;
          render();
        });
        return el("div", { className: `demo-pack${pack.name === selected ? " active" : ""}`, attrs: { role: "listitem" } }, [button]);
      }),
    );
    if (query) status.textContent = rows.length ? `${rows.length} of ${DEMO_PACKS.length} packs match "${search.value.trim()}".` : `No pack matches "${search.value.trim()}".`;
    ghostScroll.end();
  }

  search.addEventListener("input", () => {
    ghostScroll.setScrollTop(0);
    render();
  });
  render();
}

// --- Focus Mode: layout customization and scale ---

// The real default preset with smaller minimum widths so it fits the demo.
function demoPreset() {
  const preset = createDefaultFocusLayout().presets.default;
  return { ...preset, columns: "minmax(60px, 2fr) minmax(80px, 3fr)" };
}

function initFocusDemo() {
  const grid = document.getElementById("demo-focus-grid");
  const status = document.getElementById("demo-focus-status");
  const scale = document.getElementById("demo-focus-scale");
  const scaleValue = document.getElementById("demo-focus-scale-value");
  if (!grid) return;
  let preset = demoPreset();

  function apply(message) {
    grid.style.gridTemplateColumns = preset.columns;
    grid.style.gridTemplateRows = preset.rows;
    grid.style.gridTemplateAreas = preset.areas.map((row) => `"${row}"`).join(" ");
    grid.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.style.gridArea = panel.dataset.panel;
    });
    status.textContent = message || `columns: ${preset.columns} · rows: ${preset.rows}`;
  }

  const actions = {
    swap: () => swapPanels(preset, "image", "palette"),
    wider: () => resizePanel(preset, "image", "columns", 1),
    taller: () => resizePanel(preset, "tags", "rows", 1),
    reset: () => demoPreset(),
  };
  document.querySelectorAll("#showcase-focus [data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = actions[button.dataset.action]();
      if (!next) {
        apply("That panel cannot grow any further in this layout.");
        return;
      }
      preset = next;
      apply();
    });
  });
  scale.addEventListener("input", () => {
    const value = parseFloat(scale.value);
    grid.style.setProperty("--demo-scale", String(value));
    scaleValue.textContent = `${Math.round(value * 100)}%`;
  });
  apply("Use the buttons to rearrange the layout.");
}

// --- Assets: preview, install, uninstall with undo ---

const DEMO_ASSET = {
  name: "Weather & Sky Pack",
  groups: {
    Sky: { Weather: ["rain", "snow", "fog", "storm", "rainbow"], "Time of day": ["sunrise", "sunset", "night", "golden_hour"] },
    Light: { Atmosphere: ["god_rays", "lens_flare", "mist", "backlighting", "silhouette"] },
  },
};

function initAssetsDemo() {
  const previewButton = document.getElementById("demo-asset-preview");
  const installButton = document.getElementById("demo-asset-install");
  const uninstallButton = document.getElementById("demo-asset-uninstall");
  const contents = document.getElementById("demo-asset-contents");
  const status = document.getElementById("demo-asset-status");
  if (!previewButton || !installButton) return;
  let installed = false;
  let undoTimer = null;

  const summary = summarizePack(DEMO_ASSET, { categories: 6, tags: 4 });
  contents.replaceChildren(
    el("div", { className: "demo-preview-summary", text: `${summary.groupCount} groups · ${summary.categoryCount} categories · ${summary.tagCount} tags · SHA-256 verified` }),
    ...summary.categories.map(({ group, category, count, tags }) =>
      el("div", { className: "demo-preview-row" }, [
        el("span", { className: "demo-preview-path", text: `${group} › ${category} (${count})` }),
        el("span", { className: "demo-preview-tags", text: `${tags.join(", ")}${count > tags.length ? `, +${count - tags.length} more` : ""}` }),
      ]),
    ),
  );

  function render() {
    installButton.textContent = installed ? "Installed" : "Install";
    installButton.disabled = installed;
    uninstallButton.hidden = !installed;
  }

  function showUndo() {
    const undo = el("button", { className: "demo-button", text: "Undo", attrs: { type: "button" } });
    undo.addEventListener("click", () => {
      clearTimeout(undoTimer);
      installed = true;
      status.textContent = `Restored "${DEMO_ASSET.name}".`;
      render();
    });
    status.replaceChildren(el("span", { text: `Uninstalled "${DEMO_ASSET.name}". ` }), undo);
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      status.textContent = "";
    }, 10000);
  }

  previewButton.addEventListener("click", () => {
    contents.hidden = !contents.hidden;
    previewButton.textContent = contents.hidden ? "Preview" : "Hide contents";
    previewButton.setAttribute("aria-expanded", String(!contents.hidden));
  });
  installButton.addEventListener("click", () => {
    installed = true;
    clearTimeout(undoTimer);
    status.textContent = `Installed "${DEMO_ASSET.name}" and selected it in Tagging.`;
    render();
  });
  uninstallButton.addEventListener("click", () => {
    installed = false;
    render();
    showUndo();
  });
  render();
}

initPackDemo();
initFocusDemo();
initAssetsDemo();
