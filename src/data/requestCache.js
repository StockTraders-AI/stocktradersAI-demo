import { secureFetchJson } from "./secureClient.js";

const DEFAULT_TTL_MS = 15_000;
const DATA_PROXY_URL = "/api/data";
const DATA_ROUTE_BY_PATH = new Map([
  ["/api/branch-path", "branch-path"],
  ["/api/cashflow-branch", "cashflow-branch"],
  ["/api/cashflow-ticker", "cashflow-ticker"],
  ["/api/index-daily-changes", "index-daily-changes"],
  ["/api/performance", "performance"],
  ["/api/smdt", "smdt"],
  ["/api/smdt-ticker", "smdt-ticker"],
  ["/api/stock-noti", "stock-noti"],
  ["/api/stock-signal", "stock-signal"],
  ["/api/stock-wave", "stock-wave"],
  ["/api/total-trade", "total-trade"],
  ["/api/total-trade-real", "total-trade-real"],
]);

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

export function dataPostOptions(params = {}) {
  const body = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value != null && value !== "")
  );

  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function dataRouteForUrl(url) {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const pathname = new URL(url, base).pathname.replace(/\/+$/, "") || "/";
  return DATA_ROUTE_BY_PATH.get(pathname);
}

export function fetchDataPostWithClientCache(url, params = {}, options = {}) {
  const route = dataRouteForUrl(url);
  if (!route) {
    return fetchJsonWithClientCache(url, {
      ...options,
      options: dataPostOptions(params),
    });
  }

  return fetchJsonWithClientCache(DATA_PROXY_URL, {
    ...options,
    options: {
      ...dataPostOptions({ route, params }),
      secureUrl: url,
    },
  });
}
