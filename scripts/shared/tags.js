// Tag string helpers shared by the tagger and the editor.

/** Normalizes a tag: trimmed, lower case, whitespace runs replaced by "_". */
export function formatTag(tag) {
  return tag.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Formats a list of tags, dropping non-strings, empty tags, and duplicates. */
export function normalizeTagList(tags) {
  return [...new Set(tags.filter((tag) => typeof tag === "string").map(formatTag).filter(Boolean))];
}
