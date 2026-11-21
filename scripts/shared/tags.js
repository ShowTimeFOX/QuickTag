// Tag string helpers shared by the tagger and the editor.

/** Normalizes a tag: trimmed, lower case, whitespace runs replaced by "_". */
export function formatTag(tag) {
  return tag.trim().toLowerCase().replace(/\s+/g, "_");
}

export const DEFAULT_TAG_SEPARATOR = " ";
export const MAX_TAG_SEPARATOR_LENGTH = 5;

/** A profile's separator, or the default (a space) when unset or blank. */
export function normalizeTagSeparator(value) {
  return typeof value === "string" && value.trim() && value.length <= MAX_TAG_SEPARATOR_LENGTH ? value : DEFAULT_TAG_SEPARATOR;
}

/**
 * Splits a tag field's text. Whitespace separators split on any whitespace;
 * other separators split on their non-space part (", " splits on ","), so
 * spacing around them does not matter.
 */
export function splitTagText(text, separator = DEFAULT_TAG_SEPARATOR) {
  const delimiter = normalizeTagSeparator(separator).trim();
  const parts = delimiter ? String(text).split(delimiter) : String(text).split(/\s+/);
  return parts.map(formatTag).filter(Boolean);
}

export function joinTags(tags, separator = DEFAULT_TAG_SEPARATOR) {
  return tags.join(normalizeTagSeparator(separator));
}

/** Formats a list of tags, dropping non-strings, empty tags, and duplicates. */
export function normalizeTagList(tags) {
  return [...new Set(tags.filter((tag) => typeof tag === "string").map(formatTag).filter(Boolean))];
}
