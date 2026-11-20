// easyJson: an indentation-based text format for editing tag packs without
// writing JSON syntax.
//
//   Group:
//     Category: tag, tag, tag
import { normalizePalettePack } from "../shared/palette.js";

export function serializePaletteEasy(pack) {
  return Object.entries(pack.groups)
    .map(([groupName, categories]) => {
      const categoryLines = Object.entries(categories).map(([categoryName, tags]) => `  ${categoryName}: ${tags.join(", ")}`);
      return [`${groupName}:`, ...categoryLines].join("\n");
    })
    .join("\n\n");
}

/** Parses easyJson into a normalized pack; throws errors with line numbers. */
export function parsePaletteEasy(text, fallbackName) {
  const groups = {};
  let currentGroup = null;

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const lineNumber = index + 1;

    const groupMatch = line.match(/^([^:\s][^:\n]*):\s*$/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      if (!currentGroup) throw new Error(`Line ${lineNumber}: group name cannot be empty.`);
      groups[currentGroup] ||= {};
      return;
    }

    const categoryMatch = line.match(/^ {2}([^:\n]+):(?:[ \t]*(.*))?$/);
    if (!categoryMatch) {
      throw new Error(`Line ${lineNumber}: use "Group:" followed by indented "  Category: tag, tag" lines.`);
    }
    if (!currentGroup) {
      throw new Error(`Line ${lineNumber}: add a group heading before this category.`);
    }

    const categoryName = categoryMatch[1].trim();
    if (!categoryName) {
      throw new Error(`Line ${lineNumber}: category name cannot be empty.`);
    }
    groups[currentGroup][categoryName] = (categoryMatch[2] || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  });

  if (Object.keys(groups).length === 0) {
    throw new Error("Add at least one group and category.");
  }
  if (Object.values(groups).some((categories) => Object.keys(categories).length === 0)) {
    throw new Error("Every group needs at least one indented category line.");
  }

  return normalizePalettePack({ name: fallbackName, groups }, fallbackName);
}
