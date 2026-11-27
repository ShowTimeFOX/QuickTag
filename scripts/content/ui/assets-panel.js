// Assets tab: browse and install tag packs from File Hub.
//
// The catalogue is requested only when the tab is first opened (or on
// Refresh), never at page load. Requests, checksum checks, and validation
// run in the background script; see content/file-hub.js.
import { LOG_PREFIX, STORAGE_KEYS, FILE_HUB_BASE_URL, MESSAGE_ACTIONS } from "../../shared/constants.js";
import { onLocalStorageChange } from "../../shared/storage.js";
import { HUB_SORT_MODES, filterHubPackages, hubPackageUrl, isInstallableHubPackage, sortHubPackages, summarizePack } from "../../shared/file-hub.js";
import { on, EVENTS } from "../events.js";
import { fetchHubCatalogue, getHubInstallStatus, installHubPackage, loadHubInstalls, previewHubPackage, requestHubPermission } from "../file-hub.js";
import { UNDO_TIMEOUT_MS, uninstallPack, undoUninstall } from "../pack-manager.js";
import { $ } from "./shell.js";
import { el, icon, ICONS } from "./dom.js";

const view = {
  packages: null,
  installs: {},
  loading: false,
  error: "",
  /** Ignores responses of superseded requests. */
  requestId: 0,
  /** Package ids with an install in progress. */
  installing: new Set(),
  /** Per-package result line: { text, state }. */
  results: new Map(),
  /** Contents previews by package id: { open, state: loading|ready|error, version, summary, verified, error }. */
  previews: new Map(),
  /** Package id whose Update button waits for a second click. */
  confirmingUpdate: "",
};

const ACTION_LABELS = {
  available: "Install",
  installed: "Installed",
  update: "Update",
  unsupported: "Not supported",
};

let elements;

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(time) {
  return time ? new Date(time).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) : "";
}

function setStatus(text, statusState = "info") {
  elements.status.textContent = text;
  elements.status.dataset.state = statusState;
  elements.status.hidden = !text;
}

function renderCategories() {
  const current = elements.category.value;
  const categories = [...new Set((view.packages || []).map((item) => item.category).filter(Boolean))].sort();
  elements.category.replaceChildren(
    el("option", { text: "All categories", attrs: { value: "" } }),
    ...categories.map((category) => el("option", { text: category.charAt(0).toUpperCase() + category.slice(1), attrs: { value: category } })),
  );
  elements.category.value = categories.includes(current) ? current : "";
  elements.category.disabled = categories.length < 2;
}

function actionButton(item, status) {
  const busy = view.installing.has(item.id);
  const confirming = status === "update" && view.confirmingUpdate === item.id;
  const label = busy ? "Installing…" : confirming ? "Confirm update" : status === "update" ? `Update to ${item.version}` : ACTION_LABELS[status];
  const titles = {
    available: `Install ${item.name} ${item.version}`,
    installed: "This version is installed",
    update: `Replace the installed pack with version ${item.version}`,
    unsupported: `QuickTag can only install JSON tag packs${item.fileType ? ` (this is ${item.fileType.toUpperCase()})` : ""}.`,
  };
  return el("button", {
    className: `lazymod-btn lazymod-asset-action${status === "available" || status === "update" ? " lazymod-btn-accent" : ""}`,
    text: label,
    title: titles[status],
    dataset: { status },
    attrs: { type: "button", disabled: busy || status === "installed" || status === "unsupported" },
    on: { click: () => handleInstall(item, status) },
  });
}

function packageCard(item) {
  const { status, installedVersion } = getHubInstallStatus(item, view.installs);
  const result = view.results.get(item.id);
  const meta = [item.category, item.fileType.toUpperCase(), formatSize(item.fileSize)].filter(Boolean).join(" · ");
  const byline = [item.author ? `by ${item.author}` : "", item.updatedAt ? `updated ${formatDate(item.updatedAt)}` : ""].filter(Boolean).join(" · ");
  const installedNote = status === "update" ? `Installed: ${installedVersion}` : status === "installed" ? "Installed" : "";

  return el("article", { className: "lazymod-asset-card", dataset: { packageId: item.id, status }, attrs: { role: "listitem" } }, [
    el("div", { className: "lazymod-asset-head" }, [
      el("h3", { className: "lazymod-asset-name", text: item.name }),
      el("span", { className: "lazymod-badge lazymod-asset-version", text: item.version }),
    ]),
    byline ? el("div", { className: "lazymod-asset-byline", text: byline }) : null,
    item.description ? el("p", { className: "lazymod-asset-description", text: item.description }) : null,
    item.tags.length ? el("div", { className: "lazymod-asset-tags" }, item.tags.map((tag) => el("span", { className: "lazymod-asset-tag", text: tag }))) : null,
    el("div", { className: "lazymod-asset-foot" }, [
      el("div", { className: "lazymod-asset-stats" }, [
        meta ? el("span", { text: meta }) : null,
        el("span", { text: `${item.downloads} downloads · score ${item.score}`, title: "Downloads and score on File Hub" }),
        installedNote ? el("span", { className: "lazymod-asset-installed", text: installedNote }) : null,
      ]),
      el("div", { className: "lazymod-asset-actions" }, [
        // Compact icon buttons; Install keeps its text label.
        el(
          "a",
          {
            className: "lazymod-btn lazymod-icon-btn lazymod-asset-hub",
            title: "Show in Hub: open this package's page on File Hub (new tab)",
            attrs: { href: hubPackageUrl(item), target: "_blank", rel: "noopener noreferrer", "aria-label": `Show ${item.name} in File Hub` },
          },
          [icon(ICONS.external)],
        ),
        isInstallableHubPackage(item) ? previewButton(item) : null,
        status === "installed" || status === "update"
          ? el("button", {
              className: "lazymod-btn lazymod-asset-uninstall",
              text: "Uninstall",
              title: `Remove ${item.name} from your tag packs`,
              attrs: { type: "button", disabled: view.installing.has(item.id) },
              on: { click: () => handleUninstall(item) },
            })
          : null,
        actionButton(item, status),
      ]),
    ]),
    previewBlock(item),
    result
      ? el("div", { className: "lazymod-asset-result", dataset: { state: result.state }, attrs: { role: "status" } }, [
          el("span", { text: result.text }),
          result.removal ? el("button", { className: "lazymod-btn lazymod-asset-undo", text: "Undo", attrs: { type: "button" }, on: { click: () => handleUndo(item) } }) : null,
          result.permission
            ? el("button", {
                className: "lazymod-btn lazymod-asset-allow",
                text: "Allow access",
                title: "Open the QuickTag window that asks the browser for access",
                attrs: { type: "button" },
                on: { click: () => handleAllowAccess(item, result.permission) },
              })
            : null,
        ])
      : null,
  ]);
}

function previewButton(item) {
  const open = Boolean(view.previews.get(item.id)?.open);
  const label = open ? "Hide contents" : "Preview contents";
  return el(
    "button",
    {
      className: "lazymod-btn lazymod-icon-btn lazymod-asset-preview",
      title: open ? "Hide contents" : "Preview contents: groups, categories, and tags before installing",
      attrs: { type: "button", "aria-label": label, "aria-expanded": String(open), "aria-pressed": String(open) },
      on: { click: () => togglePreview(item) },
    },
    [icon(ICONS.eye)],
  );
}

function previewBlock(item) {
  const preview = view.previews.get(item.id);
  if (!preview?.open) return null;
  const block = (children, previewState) => el("div", { className: "lazymod-asset-preview-block", dataset: { state: previewState } }, children);
  if (preview.state === "loading") return block([el("span", { text: "Loading package contents…" })], "loading");
  if (preview.state === "error") return block([el("span", { text: `Could not preview: ${preview.error}` })], "error");
  const { summary } = preview;
  return block(
    [
      el("div", {
        className: "lazymod-asset-preview-summary",
        text: `"${summary.name}": ${plural(summary.groupCount, "group")} · ${plural(summary.categoryCount, "category", "categories")} · ${plural(summary.tagCount, "tag")}${preview.verified ? " · SHA-256 verified" : ""}`,
      }),
      ...summary.categories.map(({ group, category, count, tags }) =>
        el("div", { className: "lazymod-asset-preview-category" }, [
          el("span", { className: "lazymod-asset-preview-path", text: `${group} › ${category} (${count})` }),
          el("span", { className: "lazymod-asset-preview-tags", text: `${tags.join(", ")}${count > tags.length ? `, +${count - tags.length} more` : ""}` }),
        ]),
      ),
      summary.hiddenCategories ? el("div", { className: "lazymod-asset-preview-more", text: `+${summary.hiddenCategories} more categories` }) : null,
    ],
    "ready",
  );
}

/** Downloads and validates the package once per version; nothing is saved. */
async function togglePreview(item) {
  const current = view.previews.get(item.id);
  if (current?.open) {
    view.previews.set(item.id, { ...current, open: false });
    renderList();
    return;
  }
  if (current && current.state !== "error" && current.version === item.version) {
    view.previews.set(item.id, { ...current, open: true });
    renderList();
    return;
  }
  view.previews.set(item.id, { open: true, state: "loading", version: item.version });
  renderList();
  try {
    const { pack, verified } = await previewHubPackage(item);
    view.previews.set(item.id, { open: view.previews.get(item.id)?.open !== false, state: "ready", version: item.version, summary: summarizePack(pack), verified });
  } catch (error) {
    if (error.permission) {
      view.previews.delete(item.id);
      view.results.set(item.id, permissionResult(error, "preview"));
    } else {
      view.previews.set(item.id, { open: true, state: "error", version: item.version, error: error.message });
    }
  }
  renderList();
}

// --- Missing host access (Firefox lets users withhold it) ---

const MANUAL_ACCESS_STEPS = navigator.userAgent.includes("Firefox")
  ? "Allow it in about:addons › QuickTag LazyMod › Permissions, then try again."
  : "Allow it in chrome://extensions › QuickTag LazyMod › Details › Site access, then try again.";

/** The background already opened the permission window; this line waits for it. */
function permissionResult(error, purpose) {
  return { text: `${error.message} Confirm in the QuickTag window that opened.`, state: "info", permission: purpose };
}

async function handleAllowAccess(item, purpose) {
  try {
    const { missing } = await requestHubPermission(item, purpose);
    if (!missing) retryAfterPermission(item, purpose);
  } catch (error) {
    view.results.set(item.id, { text: `Could not ask for access: ${error.message} ${MANUAL_ACCESS_STEPS}`, state: "error" });
    renderList();
  }
}

/** After access is granted, continue what the user started. */
function retryAfterPermission(item, purpose) {
  view.results.delete(item.id);
  if (purpose === "preview") {
    togglePreview(item);
    return;
  }
  handleInstall(item, getHubInstallStatus(item, view.installs).status);
}

function handlePermissionResult({ granted, packageId, purpose }) {
  const item = view.packages?.find((entry) => entry.id === packageId);
  if (!item) return;
  if (granted) retryAfterPermission(item, purpose);
  else {
    view.results.set(item.id, { text: `QuickTag was not given access, so the package was not downloaded. ${MANUAL_ACCESS_STEPS}`, state: "error", permission: purpose });
    renderList();
  }
}

function renderList() {
  if (view.loading && !view.packages) {
    setStatus("Loading packages from File Hub…");
    elements.list.replaceChildren();
    return;
  }
  if (view.error) {
    setStatus(`${view.error} Select Refresh to try again.`, "error");
    if (!view.packages) {
      elements.list.replaceChildren();
      return;
    }
  }
  const packages = view.packages || [];
  const visible = sortHubPackages(filterHubPackages(packages, { query: elements.search.value, category: elements.category.value }), elements.sort.value);
  if (!view.error) {
    if (!packages.length) setStatus("No tag packs are available on File Hub yet.");
    else if (!visible.length) setStatus("No packages match your search.");
    else setStatus(view.loading ? "Refreshing…" : `${visible.length} of ${packages.length} packages`);
  }
  elements.list.replaceChildren(...visible.map(packageCard));
}

async function loadCatalogue({ force = false } = {}) {
  const requestId = ++view.requestId;
  view.loading = true;
  view.error = "";
  elements.refresh.disabled = true;
  renderList();
  try {
    const [catalogue, installs] = await Promise.all([fetchHubCatalogue({ force }), loadHubInstalls()]);
    if (requestId !== view.requestId) return;
    view.packages = catalogue.packages;
    view.installs = installs;
  } catch (error) {
    if (requestId !== view.requestId) return;
    console.warn(`${LOG_PREFIX} Could not load the File Hub catalogue.`, error);
    view.error = error.message;
  } finally {
    if (requestId === view.requestId) {
      view.loading = false;
      elements.refresh.disabled = false;
      renderCategories();
      renderList();
    }
  }
}

async function handleInstall(item, status) {
  if (view.installing.has(item.id) || (status !== "available" && status !== "update")) return;
  // Updating replaces the pack, so the first click only asks (no blocking
  // confirm() dialog on the page).
  if (status === "update" && view.confirmingUpdate !== item.id) {
    view.confirmingUpdate = item.id;
    view.results.set(item.id, { text: `Version ${item.version} replaces the installed pack, including any edits you made to it. Select Confirm update to continue.`, state: "info" });
    renderList();
    return;
  }
  view.confirmingUpdate = "";
  view.installing.add(item.id);
  view.results.delete(item.id);
  renderList();
  try {
    const { packName, verified } = await installHubPackage(item);
    view.installs = await loadHubInstalls();
    view.results.set(item.id, {
      text: `${status === "update" ? "Updated" : "Installed"} "${packName}" and selected it in Tagging.${verified ? " SHA-256 checksum verified." : " File Hub provided no checksum for this file."}`,
      state: "success",
    });
  } catch (error) {
    if (error.permission) {
      view.results.set(item.id, permissionResult(error, "install"));
    } else {
      console.warn(`${LOG_PREFIX} Could not install ${item.id}.`, error);
      view.results.set(item.id, { text: `Could not install: ${error.message}`, state: "error" });
    }
  } finally {
    view.installing.delete(item.id);
    renderList();
  }
}

/** Removes the installed pack right away; the result line offers Undo. */
async function handleUninstall(item) {
  const record = view.installs[item.id];
  if (!record || view.installing.has(item.id)) return;
  view.installing.add(item.id);
  view.confirmingUpdate = "";
  try {
    const removal = await uninstallPack(record.packId, "assets");
    view.installs = await loadHubInstalls();
    const result = { text: `Uninstalled "${removal.pack.name}".`, state: "success", removal };
    view.results.set(item.id, result);
    // Undo expires like the pack switcher's; the line then disappears.
    setTimeout(() => {
      if (view.results.get(item.id) !== result) return;
      view.results.delete(item.id);
      renderList();
    }, UNDO_TIMEOUT_MS);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not uninstall ${item.id}.`, error);
    view.results.set(item.id, { text: `Could not uninstall: ${error.message}`, state: "error" });
  } finally {
    view.installing.delete(item.id);
    renderList();
  }
}

async function handleUndo(item) {
  const removal = view.results.get(item.id)?.removal;
  if (!removal || view.installing.has(item.id)) return;
  view.installing.add(item.id);
  try {
    await undoUninstall(removal, "assets");
    view.installs = await loadHubInstalls();
    view.results.set(item.id, { text: `Restored "${removal.pack.name}".`, state: "success" });
  } catch (error) {
    view.results.set(item.id, { text: `Could not restore: ${error.message}`, state: "error" });
  } finally {
    view.installing.delete(item.id);
    renderList();
  }
}

/** Called when the Assets tab is shown; loads the catalogue the first time. */
export function showAssetsPanel() {
  if (!view.packages && !view.loading) loadCatalogue();
  else renderList();
}

export function initAssetsPanel() {
  elements = {
    search: $("#lm-assets-search"),
    category: $("#lm-assets-category"),
    sort: $("#lm-assets-sort"),
    refresh: $("#lm-assets-refresh"),
    status: $("#lm-assets-status"),
    list: $("#lm-assets-list"),
  };
  $("#lm-assets-site").href = FILE_HUB_BASE_URL;
  elements.sort.replaceChildren(...Object.entries(HUB_SORT_MODES).map(([mode, label]) => el("option", { text: label, attrs: { value: mode } })));
  renderCategories();

  elements.search.addEventListener("input", renderList);
  elements.category.addEventListener("change", renderList);
  elements.sort.addEventListener("change", renderList);
  elements.refresh.addEventListener("click", () => loadCatalogue({ force: true }));
  // Result from the permission window (pages/permissions.html, via the background).
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === MESSAGE_ACTIONS.fileHubPermissionResult) handlePermissionResult(request);
  });

  // Install states follow pack deletions and installs from other tabs.
  const refreshInstalls = async () => {
    if (!view.packages) return;
    view.installs = await loadHubInstalls();
    renderList();
  };
  on(EVENTS.paletteChanged, ({ source }) => source !== "assets" && refreshInstalls());
  onLocalStorageChange((changes) => {
    if (changes[STORAGE_KEYS.hubPackages] || changes[STORAGE_KEYS.palettes]) refreshInstalls();
  });
}
