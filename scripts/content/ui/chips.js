// Tag chips shared by the palette and AI suggestion lists.
import { toggleTagInMain } from "../page.js";

function getChipIcon(isActive) {
  return isActive ? "−" : "+";
}

/**
 * Creates a chip that toggles `tag` in the page tag field when clicked.
 * Structure: <div.lazymod-chip data-tag><span.icon/> tag [<span.score/>]</div>
 */
export function createTagChip(tag, { isActive = false, isHighlighted = false, score = null, title = "" } = {}) {
  const chip = document.createElement("div");
  chip.className = "lazymod-chip";
  chip.classList.toggle("active", isActive);
  chip.classList.toggle("search-highlighted", isHighlighted);
  chip.dataset.tag = tag;
  if (title) chip.title = title;

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = getChipIcon(isActive);
  chip.append(icon, document.createTextNode(` ${tag}`));

  if (Number.isFinite(score)) {
    const scoreLabel = document.createElement("span");
    scoreLabel.className = "score";
    scoreLabel.textContent = ` ${Math.round(score * 100)}%`;
    chip.appendChild(scoreLabel);
  }

  chip.addEventListener("click", () => toggleTagInMain(tag));
  return chip;
}

/** Updates the active state of every chip in `container`. */
export function syncChipStates(container, mainTags) {
  if (!container) return;
  container.querySelectorAll(".lazymod-chip").forEach((chip) => {
    const tag = chip.dataset.tag;
    if (!tag) return;
    const isActive = mainTags.includes(tag);
    chip.classList.toggle("active", isActive);
    const icon = chip.querySelector(".icon");
    if (icon) icon.textContent = getChipIcon(isActive);
  });
}

export function createEmptyMessage(text) {
  const message = document.createElement("span");
  message.className = "lazymod-search-empty";
  message.textContent = text;
  return message;
}
