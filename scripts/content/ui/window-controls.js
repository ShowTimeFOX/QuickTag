// Window controls: dock/undock, dock edge, scale slider, resize, drag,
// collapse, and hide-to-edge with the edge handle.
import { STORAGE_KEYS, DOCK_EDGES } from "../../shared/constants.js";
import { saveData } from "../../shared/storage.js";
import { $, shell, setIconPath, ICON_PATHS } from "./shell.js";
import {
  layout,
  applyDockPositionClass,
  applyWindowScale,
  getCurrentScale,
  isWindowDocked,
  persistFloatingPosition,
  persistPageLayout,
  updateDockPageSpace,
} from "./window-layout.js";

const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 240;
const EDGE_HANDLE_ARROWS = { left: "‹", right: "›", top: "⌄", bottom: "⌃" };

let showTaggerButton = null;

export function setTaggerCollapsed(collapsed) {
  const collapseButton = $("#lm-toggle-body");
  shell.windowEl.classList.toggle("is-collapsed", collapsed);
  const label = collapsed ? "Expand tagger" : "Collapse tagger";
  collapseButton.setAttribute("aria-expanded", String(!collapsed));
  collapseButton.setAttribute("aria-label", label);
  collapseButton.title = label;
  setIconPath(collapseButton, collapsed ? ICON_PATHS.expand : ICON_PATHS.collapse);
  updateDockPageSpace();
}

function createShowTaggerButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "lm-show-tagger";
  button.className = "lazymod-edge-tab";
  button.setAttribute("aria-label", "Show QuickTag");
  button.title = "Show QuickTag";
  button.hidden = !shell.windowEl.hidden;
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);
  shell.root.appendChild(button);
  return button;
}

function updateShowTaggerButtonPosition() {
  showTaggerButton.classList.remove(...DOCK_EDGES.map((edge) => `edge-${edge}`));
  showTaggerButton.classList.add(`edge-${layout.dockPosition}`);
  showTaggerButton.querySelector("span").textContent = EDGE_HANDLE_ARROWS[layout.dockPosition];
}

function hideTaggerToEdge() {
  shell.windowEl.hidden = true;
  showTaggerButton.hidden = false;
  updateShowTaggerButtonPosition();
  updateDockPageSpace();
  persistPageLayout({ visible: false });
}

function showTaggerFromEdge() {
  shell.windowEl.hidden = false;
  showTaggerButton.hidden = true;
  applyWindowScale(getCurrentScale());
  updateDockPageSpace();
  persistPageLayout({ visible: true });
}

function initDocking() {
  const { windowEl } = shell;
  const dockButton = $("#lm-dock-btn");
  const dockPositionSelect = $("#lm-dock-position");
  dockPositionSelect.value = layout.dockPosition;
  dockButton.textContent = layout.docked ? "Undock" : "Dock";

  dockButton.onclick = () => {
    const dockedNow = windowEl.classList.toggle("docked");
    layout.docked = dockedNow;
    persistPageLayout({ docked: dockedNow });
    dockButton.textContent = dockedNow ? "Undock" : "Dock";

    if (dockedNow) {
      windowEl.style.top = "";
      windowEl.style.left = "";
      applyDockPositionClass();
    } else {
      updateDockPageSpace();
      windowEl.classList.remove(...DOCK_EDGES.map((edge) => `docked-${edge}`));
      windowEl.style.height = "";
      const floatPosition = layout.saved?.position || layout.fallbackPosition;
      windowEl.style.top = floatPosition.top;
      windowEl.style.left = floatPosition.left;
    }
    applyWindowScale(parseFloat($("#lm-scale-slider").value));
  };

  dockPositionSelect.onchange = () => {
    if (!DOCK_EDGES.includes(dockPositionSelect.value)) return;
    layout.dockPosition = dockPositionSelect.value;
    persistPageLayout({ dockPosition: layout.dockPosition });
    updateShowTaggerButtonPosition();
    if (isWindowDocked()) {
      applyDockPositionClass();
      applyWindowScale(parseFloat($("#lm-scale-slider").value));
    }
  };
}

function initScale() {
  const scaleSlider = $("#lm-scale-slider");

  scaleSlider.oninput = () => {
    $("#lm-scale-value").textContent = `${Math.round(parseFloat(scaleSlider.value) * 100)}%`;
    if (isWindowDocked()) applyWindowScale(parseFloat(scaleSlider.value));
  };

  scaleSlider.onchange = () => {
    const scale = applyWindowScale(parseFloat(scaleSlider.value));
    saveData(STORAGE_KEYS.scale, scale);
    if (!isWindowDocked()) persistFloatingPosition();
  };

  window.addEventListener("resize", () => {
    if (shell.windowEl.hidden) return;
    const scale = applyWindowScale(getCurrentScale());
    saveData(STORAGE_KEYS.scale, scale);
    if (!isWindowDocked()) persistFloatingPosition();
  });
}

/** Resize from the bottom-left handle; the right edge stays anchored. */
function initResize() {
  const { windowEl } = shell;
  const resizeHandle = $("#lm-resize-handle");
  let resizeState = null;

  function finishWindowResize() {
    if (!resizeState) return;
    resizeState = null;
    windowEl.classList.remove("resizing");
    saveData(STORAGE_KEYS.windowSize, {
      width: parseFloat(windowEl.style.width),
      height: parseFloat(windowEl.style.height),
    });
    persistFloatingPosition();
  }

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (isWindowDocked()) return;
    event.preventDefault();
    const style = getComputedStyle(windowEl);
    resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: parseFloat(style.width),
      startHeight: parseFloat(style.height),
      startLeft: parseFloat(windowEl.style.left) || windowEl.getBoundingClientRect().left,
      startTop: parseFloat(windowEl.style.top) || windowEl.getBoundingClientRect().top,
      scale: getCurrentScale(),
    };
    windowEl.classList.add("resizing");
    resizeHandle.setPointerCapture(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    event.preventDefault();
    const { scale, startX, startY, startWidth, startHeight, startLeft, startTop } = resizeState;
    const maxWidth = Math.max(1, window.innerWidth - 24) / scale;
    const maxHeight = Math.max(1, window.innerHeight - 24) / scale;
    const width = Math.max(Math.min(MIN_WINDOW_WIDTH, maxWidth), Math.min(maxWidth, startWidth - (event.clientX - startX) / scale));
    const height = Math.max(Math.min(MIN_WINDOW_HEIGHT, maxHeight), Math.min(maxHeight, startHeight + (event.clientY - startY) / scale));
    windowEl.style.width = `${width}px`;
    windowEl.style.height = `${height}px`;
    windowEl.style.left = `${startLeft + (startWidth - width)}px`;
    windowEl.style.top = `${startTop}px`;
    applyWindowScale(scale);
  });

  const endResize = (event) => {
    if (resizeState && event.pointerId === resizeState.pointerId) finishWindowResize();
  };
  document.addEventListener("pointerup", endResize);
  document.addEventListener("pointercancel", endResize);
}

function initDragging() {
  const { windowEl } = shell;
  const handle = $("#lazymod-drag-handle");
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("mousedown", (event) => {
    if (["BUTTON", "INPUT", "SELECT"].includes(event.target.tagName) || isWindowDocked()) return;
    isDragging = true;
    const rect = windowEl.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
  });

  document.addEventListener("mousemove", (event) => {
    if (!isDragging || isWindowDocked()) return;
    windowEl.style.left = `${event.clientX - offsetX}px`;
    windowEl.style.top = `${event.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    persistFloatingPosition();
  });
}

export function initWindowControls() {
  showTaggerButton = createShowTaggerButton();
  initDocking();

  $("#lm-toggle-body").onclick = () => setTaggerCollapsed(!shell.windowEl.classList.contains("is-collapsed"));
  $("#lm-hide-tagger").onclick = hideTaggerToEdge;
  showTaggerButton.onclick = showTaggerFromEdge;
  updateShowTaggerButtonPosition();

  // First visit to this origin: save the initial (hidden) layout.
  if (!layout.saved || layout.saved.visible === undefined) {
    persistPageLayout({
      docked: layout.docked,
      dockPosition: layout.dockPosition,
      visible: !shell.windowEl.hidden,
      position: layout.fallbackPosition,
    });
  }

  initScale();
  initResize();
  initDragging();
}
