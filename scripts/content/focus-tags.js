// Focus Mode tag list: the page's tags plus "muted" tags (switched off but
// kept), with ordering, sorting, and two-way sync with the page tag field.
// No DOM rendering here; see ui/focus-tags-panel.js.
//
// Model rules:
// - The page field holds exactly the active tags, in list order.
// - Muting removes a tag from the page field but keeps its badge; removing
//   (x) drops it from the list entirely. Muted tags live only in memory for
//   this page and are cleared when the page is reloaded.
// - With live sync on, every change is written to the page immediately and
//   edits made on the page are merged back: tags removed on the page are
//   dropped (muted tags are kept), new page tags are appended.
// - With live sync off, changes stay in Focus Mode until applied; page edits
//   are ignored until the list is reloaded from the page.
import { formatTag } from "../shared/tags.js";
import { state } from "./state.js";
import { emit, on, EVENTS } from "./events.js";
import { getMainInput, getMainTags, setMainTags } from "./page.js";
import { getActivePack } from "./palettes.js";

const model = {
  /** `{ tag, muted, addedAt }` in display order. */
  entries: [],
  nextAddedAt: 0,
  liveSync: true,
  /** Unapplied changes while live sync is off. */
  dirty: false,
};

function notify(source) {
  emit(EVENTS.focusTagsChanged, { source });
}

function createEntry(tag, muted = false) {
  return { tag, muted, addedAt: model.nextAddedAt++ };
}

function findEntry(tag) {
  return model.entries.find((entry) => entry.tag === tag);
}

/** Splits user input ("a b, c") into formatted tags. Underscores are kept. */
export function parseTagInput(text) {
  return text
    .split(/[\s,]+/)
    .map(formatTag)
    .filter(Boolean);
}

export function getEntries() {
  return model.entries.map((entry) => ({ ...entry }));
}

export function getActiveTags() {
  return model.entries.filter((entry) => !entry.muted).map((entry) => entry.tag);
}

export function getCounts() {
  const muted = model.entries.filter((entry) => entry.muted).length;
  return { active: model.entries.length - muted, muted, total: model.entries.length };
}

export function getTagState(tag) {
  const entry = findEntry(tag);
  return entry ? (entry.muted ? "muted" : "active") : "none";
}

export function hasPageField() {
  return Boolean(getMainInput());
}

export function isLiveSync() {
  return model.liveSync;
}

export function isDirty() {
  return model.dirty;
}

function sameList(first, second) {
  return first.length === second.length && first.every((tag, index) => tag === second[index]);
}

/** Writes the active tags to the page (live sync) or marks them unapplied. */
function commit(source) {
  if (model.liveSync) {
    const active = getActiveTags();
    if (!sameList(active, getMainTags())) setMainTags(active);
    model.dirty = false;
  } else {
    model.dirty = true;
  }
  notify(source);
}

/** Replaces the list with the page's tags (keeps muted tags that are not on the page). */
export function loadFromPage() {
  const pageTags = [...new Set(getMainTags())];
  const muted = model.entries.filter((entry) => entry.muted && !pageTags.includes(entry.tag));
  const fromPage = pageTags.map((tag) => {
    const entry = findEntry(tag);
    return entry ? { ...entry, muted: false } : createEntry(tag);
  });
  model.entries = [...fromPage, ...muted];
  model.dirty = false;
  notify("page");
}

/** Merges edits made on the page into the list (live sync only). */
function mergeFromPage() {
  if (!model.liveSync || !state.focusModeActive) return;
  const pageTags = [...new Set(getMainTags())];
  if (sameList(pageTags, getActiveTags())) return;
  const pageSet = new Set(pageTags);
  model.entries = model.entries.filter((entry) => entry.muted || pageSet.has(entry.tag));
  pageTags.forEach((tag) => {
    const entry = findEntry(tag);
    if (!entry) model.entries.push(createEntry(tag));
    else if (entry.muted) entry.muted = false;
  });
  // Follow the page's order for active tags; muted tags keep their slots.
  const activeInPageOrder = pageTags.map(findEntry);
  let next = 0;
  model.entries = model.entries.map((entry) => (entry.muted ? entry : activeInPageOrder[next++]));
  notify("page");
}

export function addTags(tags) {
  let changed = false;
  tags.forEach((tag) => {
    const entry = findEntry(tag);
    if (!entry) {
      model.entries.push(createEntry(tag));
      changed = true;
    } else if (entry.muted) {
      entry.muted = false;
      changed = true;
    }
  });
  if (changed) commit("user");
  return changed;
}

export function removeTag(tag) {
  const before = model.entries.length;
  model.entries = model.entries.filter((entry) => entry.tag !== tag);
  if (model.entries.length !== before) commit("user");
}

export function toggleMuted(tag) {
  const entry = findEntry(tag);
  if (!entry) return;
  entry.muted = !entry.muted;
  commit("user");
}

/** Palette click: absent → active, active → muted, muted → active. */
export function togglePaletteTag(tag) {
  const entry = findEntry(tag);
  if (!entry) addTags([tag]);
  else toggleMuted(tag);
}

/** Raw-text edit: the text becomes the active tags; muted tags are kept. */
export function setActiveFromText(text) {
  const tags = [...new Set(parseTagInput(text))];
  const muted = model.entries.filter((entry) => entry.muted && !tags.includes(entry.tag));
  const nextEntries = tags.map((tag) => {
    const entry = findEntry(tag);
    return entry ? { ...entry, muted: false } : createEntry(tag);
  });
  if (sameList(tags, getActiveTags())) return;
  model.entries = [...nextEntries, ...muted];
  commit("raw");
}

function packOrderIndex() {
  const index = new Map();
  const pack = getActivePack();
  if (!pack) return index;
  let position = 0;
  Object.values(pack.groups).forEach((categories) =>
    Object.values(categories).forEach((tags) =>
      tags.forEach((tag) => {
        const clean = formatTag(tag);
        if (clean && !index.has(clean)) index.set(clean, position++);
      }),
    ),
  );
  return index;
}

export const SORT_MODES = Object.freeze({
  "a-z": "Name A–Z",
  "z-a": "Name Z–A",
  added: "Added order",
  group: "By pack group",
});

export function sortTags(mode) {
  const byName = (first, second) => first.tag.localeCompare(second.tag);
  const comparators = {
    "a-z": byName,
    "z-a": (first, second) => byName(second, first),
    added: (first, second) => first.addedAt - second.addedAt,
    group: (() => {
      const order = packOrderIndex();
      // Tags from the active pack follow its group/category order; others go last, A–Z.
      return (first, second) => (order.get(first.tag) ?? Infinity) - (order.get(second.tag) ?? Infinity) || byName(first, second);
    })(),
  };
  if (!comparators[mode]) return;
  model.entries = [...model.entries].sort(comparators[mode]);
  commit("user");
}

/**
 * Removes duplicate tags from the page field (the list itself never holds
 * duplicates). Returns the number of duplicates removed.
 */
export function deduplicate() {
  const pageTags = getMainTags();
  const duplicates = pageTags.length - new Set(pageTags).size;
  if (duplicates > 0 && model.liveSync) setMainTags([...new Set(pageTags)]);
  else if (duplicates > 0) model.dirty = true;
  notify("user");
  return duplicates;
}

export function clearTags() {
  model.entries = [];
  commit("user");
}

export function getTagString() {
  return getActiveTags().join(" ");
}

export function setLiveSync(enabled) {
  model.liveSync = enabled;
  if (enabled) {
    // Turning sync back on applies the Focus Mode list to the page.
    commit("user");
  } else {
    notify("user");
  }
}

/** Writes the list to the page now (live sync off). */
export function applyToPage() {
  setMainTags(getActiveTags());
  model.dirty = false;
  notify("user");
}

export function initFocusTags({ liveSync }) {
  model.liveSync = liveSync;
  on(EVENTS.tagsChanged, mergeFromPage);
}
