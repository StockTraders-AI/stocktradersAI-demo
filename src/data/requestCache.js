import { secureFetchJson } from "./secureClient.js";

const DEFAULT_TTL_MS = 15_000;

const responseCache = new Map();
const inFlight = new Map();

function nowMs() {
  return Date.now();
}

function makeKey(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const body = options.body ? String(options.body) : "";
  return `${method} ${url} ${body}`;
}

export async function fetchJsonWithClientCache(url, { force = false, ttlMs = DEFAULT_TTL_MS, options = {} } = {}) {
  const key = makeKey(url, options);
  const cached = responseCache.get(key);
  const now = nowMs();

  if (!force && cached && now - cached.savedAt <= ttlMs) {
    return cached.data;
  }

  if (!force && inFlight.has(key)) {
    return inFlight.get(key);
  }

  // secureFetchJson lo phần ký request và giải mã gói nhị phân; các hook gọi
  // fetchJsonWithClientCache không cần biết tới lớp đó.
  const request = secureFetchJson(url, options)
    .then((data) => {
      responseCache.set(key, { data, savedAt: nowMs() });
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
