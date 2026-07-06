const CACHE_FORMAT_VERSION = 1;

const APP_CACHE_VERSION =
  import.meta.env.VITE_APP_CACHE_VERSION || import.meta.env.VITE_COMMIT_SHA || import.meta.env.MODE || "local";

function isEnvelope(value) {
  return value && typeof value === "object" && value.cacheFormatVersion === CACHE_FORMAT_VERSION && "payload" in value;
}

export function readDataCache(key, { schemaVersion = 1 } = {}) {
  try {
    const serialized = localStorage.getItem(key);
    if (!serialized) return null;

    const parsed = JSON.parse(serialized);
    if (!isEnvelope(parsed)) {
      localStorage.removeItem(key);
      return null;
    }

    if (
      parsed.key !== key ||
      parsed.appCacheVersion !== APP_CACHE_VERSION ||
      parsed.schemaVersion !== schemaVersion
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.payload ?? null;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup errors.
    }
    return null;
  }
}

export function writeDataCache(key, payload, { schemaVersion = 1 } = {}) {
  const envelope = {
    cacheFormatVersion: CACHE_FORMAT_VERSION,
    appCacheVersion: APP_CACHE_VERSION,
    schemaVersion,
    key,
    savedAt: new Date().toISOString(),
    payload,
  };
  localStorage.setItem(key, JSON.stringify(envelope));
}

export function removeDataCache(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup errors.
  }
}
