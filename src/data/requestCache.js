import { secureFetchJson } from "./secureClient.js";

const DEFAULT_TTL_MS = 15_000;
const DATA_PROXY_URL = "/api/data";
const DATA_ROUTE_BY_PATH = new Map([
  ["/api/branch-path", { code: "r01", securePath: "/api/branch-path" }],
  ["/api/cashflow-branch", { code: "r02", securePath: "/api/cashflow-branch" }],
  ["/api/cashflow-ticker", { code: "r03", securePath: "/api/cashflow-ticker" }],
  ["/api/condition-signal-latest", { code: "r04", securePath: "/api/condition-signal-latest" }],
  ["/api/do-song-advice", { code: "r05", securePath: "/api/do-song-advice" }],
  ["/api/do-song-recommendation", { code: "r06", securePath: "/api/do-song-recommendation" }],
  ["/api/index-daily-changes", { code: "r07", securePath: "/api/index-daily-changes" }],
  ["/api/performance", { code: "r08", securePath: "/api/performance" }],
  ["/api/portfolio-chat", { code: "r09", securePath: "/api/portfolio-chat" }],
  ["/api/smdt", { code: "r10", securePath: "/api/smdt" }],
  ["/api/smdt-branch-cross", { code: "r11", securePath: "/api/smdt-branch-cross" }],
  ["/api/smdt-ticker", { code: "r12", securePath: "/api/smdt-ticker" }],
  ["/api/smdt-ticker-cross", { code: "r13", securePath: "/api/smdt-ticker-cross" }],
  ["/api/stock-noti", { code: "r14", securePath: "/api/stock-noti" }],
  ["/api/stock-signal", { code: "r15", securePath: "/api/stock-signal" }],
  ["/api/stock-wave", { code: "r16", securePath: "/api/stock-wave" }],
  ["/api/stock-wave-current", { code: "r17", securePath: "/api/stock-wave-current" }],
  ["/api/stock-wave-history", { code: "r18", securePath: "/api/stock-wave-history" }],
  ["/api/stock-wave-tickers", { code: "r19", securePath: "/api/stock-wave-tickers" }],
  ["/api/total-trade", { code: "r20", securePath: "/api/total-trade" }],
  ["/api/total-trade-real", { code: "r21", securePath: "/api/total-trade-real" }],
  ["/api/wave-bottom-confirm-pairs", { code: "r22", securePath: "/api/wave-bottom-confirm-pairs" }],
  ["/thi-truong/api/do-song-recommendation", { code: "r06", securePath: "/api/do-song-recommendation" }],
  ["/thi-truong/api/portfolio-chat", { code: "r09", securePath: "/api/portfolio-chat" }],
  ["/thi-truong/api/stock-noti", { code: "r34", securePath: "/api/stock-noti" }],
  ["/thi-truong/api/stock-wave-current", { code: "r31", securePath: "/api/stock-wave-current" }],
  ["/thi-truong/api/stock-wave-history", { code: "r32", securePath: "/api/stock-wave-history" }],
  ["/thi-truong/api/stock-wave-tickers", { code: "r33", securePath: "/api/stock-wave-tickers" }],
  ["/thi-truong/api/wave-bottom-confirm-pairs", { code: "r35", securePath: "/api/wave-bottom-confirm-pairs" }],
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
  const routeConfig = dataRouteForUrl(url);
  if (!routeConfig) {
    return fetchJsonWithClientCache(url, {
      ...options,
      options: dataPostOptions(params),
    });
  }

  return fetchJsonWithClientCache(DATA_PROXY_URL, {
    ...options,
    options: {
      ...dataPostOptions({ r: routeConfig.code, p: params }),
      secureUrl: routeConfig.securePath,
    },
  });
}
