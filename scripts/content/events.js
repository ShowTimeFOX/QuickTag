// Small in-page event bus so modules can react to each other without importing
// each other (avoids circular imports and keeps features pluggable).

export const EVENTS = Object.freeze({
  /** The page's tag field changed (by the tagger or by the user). */
  tagsChanged: "tags-changed",
  /** Global visibility was switched off; stop any page-wide interaction. */
  extensionHidden: "extension-hidden",
  /** `state.siteConfigs` or `state.activeSiteKey` changed. */
  siteProfilesChanged: "site-profiles-changed",
  /** `state.tagBlacklist` changed. */
  blacklistChanged: "blacklist-changed",
});

const bus = new EventTarget();

export function emit(name, detail) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Subscribes to an event; returns an unsubscribe function. */
export function on(name, handler) {
  const listener = (event) => handler(event.detail);
  bus.addEventListener(name, listener);
  return () => bus.removeEventListener(name, listener);
}
