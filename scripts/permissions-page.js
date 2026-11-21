// Permission page (pages/permissions.html): asks for host access needed to
// download a File Hub package. The background script opens it when a
// download lacks access; permissions.request() must run inside this click
// handler (a user gesture in an extension page), before any await.
// The result is sent back so the Assets card retries or explains the fallback.
import { MESSAGE_ACTIONS } from "./shared/constants.js";
import { isValidPermissionOrigin } from "./shared/file-hub.js";

const params = new URLSearchParams(window.location.search);
const tabId = params.get("tabId");
const packageId = params.get("packageId") || "";
const purpose = params.get("purpose") === "preview" ? "preview" : "install";

function readOrigins() {
  try {
    const origins = JSON.parse(params.get("origins") || "[]");
    return Array.isArray(origins) && origins.length > 0 && origins.length <= 10 && origins.every(isValidPermissionOrigin) ? origins : null;
  } catch {
    return null;
  }
}

const origins = readOrigins();
const list = document.getElementById("permission-origins");
const allowButton = document.getElementById("permission-allow");
const cancelButton = document.getElementById("permission-cancel");
const status = document.getElementById("permission-status");

const MANUAL_STEPS = navigator.userAgent.includes("Firefox")
  ? "You can still allow it in about:addons › QuickTag LazyMod › Permissions, then select Install again."
  : "You can still allow it in chrome://extensions › QuickTag LazyMod › Details › Site access, then select Install again.";

function setStatus(text, state) {
  status.textContent = text;
  status.dataset.state = state;
}

function report(granted) {
  chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.fileHubPermissionResult, granted, tabId, packageId, purpose }).catch(() => {});
}

if (!origins) {
  setStatus("This request is not valid. Close this window and try again from QuickTag.", "error");
  allowButton.disabled = true;
} else {
  list.replaceChildren(
    ...origins.map((origin) => {
      const item = document.createElement("li");
      item.textContent = origin.replace(/\/\*$/, "");
      return item;
    }),
  );
}

allowButton.addEventListener("click", () => {
  if (!origins) return;
  allowButton.disabled = true;
  // Called directly in the click handler (Firefox requires a user gesture).
  chrome.permissions
    .request({ origins })
    .then((granted) => {
      report(granted);
      if (granted) {
        setStatus(`Access granted. QuickTag continues the ${purpose === "preview" ? "preview" : "installation"}…`, "success");
        setTimeout(() => window.close(), 1200);
      } else {
        allowButton.disabled = false;
        setStatus(`Access was not granted. ${MANUAL_STEPS}`, "error");
      }
    })
    .catch((error) => {
      allowButton.disabled = false;
      report(false);
      setStatus(`The browser could not ask for access (${error.message}). ${MANUAL_STEPS}`, "error");
    });
});

cancelButton.addEventListener("click", () => {
  report(false);
  window.close();
});
