// Site profiles: URL patterns mapped to page selectors.
import { FALLBACK_SITE_KEY, SITE_SELECTOR_KEYS } from "./constants.js";
import { isRecord } from "./validation.js";

/** Returns the first non-fallback profile key whose pattern matches `url`. */
export function detectSiteKey(siteConfigs, url) {
  for (const [key, config] of Object.entries(siteConfigs)) {
    if (key === FALLBACK_SITE_KEY) continue;
    const pattern = config.urlPattern || key;
    if (pattern && new RegExp(pattern, "i").test(url)) return key;
  }
  return FALLBACK_SITE_KEY;
}

/** Lenient shape check used when importing a configuration backup. */
export function isValidSiteConfigs(configs) {
  return (
    isRecord(configs) &&
    Object.values(configs).every(
      (config) =>
        isRecord(config) &&
        ["urlPattern", ...SITE_SELECTOR_KEYS].every((key) => config[key] === undefined || typeof config[key] === "string") &&
        (config.isXPath === undefined || typeof config.isXPath === "boolean"),
    )
  );
}

/** Strict normalization used by the settings editor; throws user-facing errors. */
export function normalizeSiteConfigs(rawConfigs) {
  if (!isRecord(rawConfigs)) {
    throw new Error("URL profiles must be a JSON object.");
  }

  const entries = Object.entries(rawConfigs);
  if (entries.length === 0) throw new Error("At least one URL profile is required.");
  if (!Object.hasOwn(rawConfigs, FALLBACK_SITE_KEY)) {
    throw new Error(`Keep the "${FALLBACK_SITE_KEY}" fallback profile so the tagger always has a default configuration.`);
  }

  const normalized = {};
  entries.forEach(([profileKey, config]) => {
    if (!isRecord(config)) {
      throw new Error(`Profile "${profileKey}" must be an object.`);
    }
    if (config.urlPattern !== undefined && typeof config.urlPattern !== "string") {
      throw new Error(`Profile "${profileKey}" URL pattern must be a string.`);
    }
    const urlPattern = typeof config.urlPattern === "string" && config.urlPattern.trim() ? config.urlPattern.trim() : profileKey;
    try {
      new RegExp(urlPattern, "i");
    } catch (error) {
      throw new Error(`Profile "${profileKey}" has an invalid URL pattern: ${error.message}`);
    }

    for (const selectorKey of SITE_SELECTOR_KEYS) {
      if (config[selectorKey] !== undefined && typeof config[selectorKey] !== "string") {
        throw new Error(`Profile "${profileKey}" field "${selectorKey}" must be a string.`);
      }
    }
    if (config.isXPath !== undefined && typeof config.isXPath !== "boolean") {
      throw new Error(`Profile "${profileKey}" isXPath must be true or false.`);
    }

    normalized[profileKey] = {
      ...config,
      urlPattern,
      tagInputSelector: config.tagInputSelector || "",
      imgSelector: config.imgSelector || "",
      linkSelector: config.linkSelector || "",
      isXPath: Boolean(config.isXPath),
    };
  });
  return normalized;
}
