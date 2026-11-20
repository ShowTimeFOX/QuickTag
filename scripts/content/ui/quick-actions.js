// Quick actions: copy tags, clear tags, and the tag counter.
import { on, EVENTS } from "../events.js";
import { getMainInput, getMainTags, setMainTags } from "../page.js";
import { $ } from "./shell.js";

function updateTagCounter() {
  const counter = $("#lm-tag-count-badge");
  if (counter) counter.textContent = `Tags: ${getMainTags().length}`;
}

export function initQuickActions() {
  $("#lm-copy-tags").onclick = () => {
    const input = getMainInput();
    if (!input) {
      alert("Target tag input field not found.");
      return;
    }
    navigator.clipboard.writeText(input.value);
    alert("Tags copied to the clipboard.");
  };

  $("#lm-clear-all").onclick = () => {
    if (confirm("Clear all tags?")) setMainTags([]);
  };

  on(EVENTS.tagsChanged, updateTagCounter);
}
