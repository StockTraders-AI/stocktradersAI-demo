import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { readDataCache, removeDataCache, writeDataCache } from "./cacheStorage";
import { REALTIME_RECONNECT_EVENT, emitRealtimeReconnected, resolveRealtimeUrl } from "./realtimeUrl";

const API_BASE_URL = "/api/cashflow-ticker";
const INITIAL_LIMIT = 25;
const FULL_LIMIT = "full";
// Giữ đủ dữ liệu trong RAM (để lịch lùi sâu hơn), nhưng chỉ lưu localStorage ít phiên
// gần nhất — tránh QuotaExceededError. Lần mở lại sẽ refetch full ngay nên không mất gì.
const CACHE_PERSIST_LIMIT = 30;
const WARMUP_REFRESH_DELAYS = [1_000, 3_000, 6_000];
const CACHE_KEY = "cashflow_ticker_data_cache_v5";
const CACHE_SCHEMA_VERSION = 1;
const LEGACY_CACHE_KEYS = ["cashflow_ticker_data_cache_v4", "cashflow_ticker_data_cache_v3"];
const CHANNELS = ["money-flow-stock"];
const REPLY_KEYS = ["CashFlowTickerReply", "CashFlowTickerRequest"];

export const CONTENT_TO_SIG = {
  "Tiếp tục đổ vào": "si",
  "Nhen nhóm đổ vào": "sn",
  "Đang thoát ra": "so",
  "Tiếp tục thoát ra": "st",
};

export function tickerContentToSig(content) {
  return content ? CONTENT_TO_SIG[content] || null : null;
}

let globalCache = null;

function getApiUrl(limit, { fresh = false, bust = false } = {}) {
  const params = new URLSearchParams();
  if (limit === FULL_LIMIT) {
    params.set("limit", FULL_LIMIT);
  } else if (Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(limit));
  }
  if (fresh) params.set("fresh", "1");
  if (bust) params.set("_", String(Date.now()));
  const query = params.toString();
  return query ? `${API_BASE_URL}?${query}` : API_BASE_URL;
}

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return null;
}

function getBucketDate(bucket, index = 0) {
  return bucket?.date || bucket?.tradingDate || bucket?.tradeDate || bucket?.createdDate || bucket?.time || `latest-${index}`;
}

function toDateSortKey(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : date;
  }
  return date.slice(0, 10);
}

function normalizePercent(percent) {
  if (percent == null) return "";
  return String(percent);
}

function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTicker(item) {
  const ticker = normalizeTickerCode(item?.ticker || item?.code || item?.symbol);
  if (!ticker) return null;
  return {
    ticker,
    type: item?.type || item?.exchange || "",
    price: toNumber(item?.price),
    percent: normalizePercent(item?.percent),
    content: item?.content || "",
  };
}

function normalizeTickerCode(ticker) {
  return ticker ? String(ticker).trim().toUpperCase() : "";
}

function getAllowedTickers(data) {
  const allowedTickers = getReply(data)?.allowedTickers ?? data?.allowedTickers;
  if (!Array.isArray(allowedTickers)) return [];
  return allowedTickers.map(normalizeTickerCode).filter(Boolean);
}

function sortRows(rows) {
  return [...rows].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function normalize(reply) {
  const buckets = getReply(reply)?.cashFlowTickers ?? reply?.cashFlowTickers ?? [];
  const allowedTickers = getAllowedTickers(reply);
  const allowedTickerSet = allowedTickers.length ? new Set(allowedTickers) : null;
  const normalizedBuckets = buckets
    .map((bucket, index) => {
      const date = getBucketDate(bucket, index);
      const rows = (bucket?.cashTickerDatas ?? bucket?.cashFlowTickerDatas ?? [])
        .map(normalizeTicker)
        .filter((row) => row && (!allowedTickerSet || allowedTickerSet.has(normalizeTickerCode(row.ticker))));
      return { date, rows: sortRows(rows) };
    })
    .filter((bucket) => bucket.rows.length > 0)
    .sort((a, b) => toDateSortKey(a.date).localeCompare(toDateSortKey(b.date)));

  return { buckets: normalizedBuckets, allowedTickers };
}

function bucketKey(date, ticker) {
  return `${date}\u0000${ticker}`;
}

function mergeTicks(state, ticks) {
  if (ticks.length === 0) return state;
  const allowedTickerSet = state.allowedTickers?.length ? new Set(state.allowedTickers) : null;
  const allowedTicks = allowedTickerSet
    ? ticks.filter((tick) => allowedTickerSet.has(normalizeTickerCode(tick.ticker)))
    : ticks;
  if (allowedTicks.length === 0) return state;

  const bucketMap = new Map(state.buckets.map((bucket) => [bucket.date, new Map(bucket.rows.map((row) => [row.ticker, row]))]));

  for (const tick of allowedTicks) {
    const date = tick.date || state.buckets[state.buckets.length - 1]?.date || new Date().toISOString().slice(0, 10);
    if (!bucketMap.has(date)) bucketMap.set(date, new Map());
    bucketMap.get(date).set(tick.ticker, {
      ticker: tick.ticker,
      type: tick.type || "",
      price: toNumber(tick.price),
      percent: normalizePercent(tick.percent),
      content: tick.content || "",
    });
  }

  const buckets = [...bucketMap.entries()]
    .map(([date, rows]) => ({ date, rows: sortRows([...rows.values()]) }))
    .sort((a, b) => toDateSortKey(a.date).localeCompare(toDateSortKey(b.date)));

  return { ...state, buckets };
}

function mergeSnapshots(base, patch) {
  const bucketMap = new Map(
    (base?.buckets || []).map((bucket) => [bucket.date, new Map(bucket.rows.map((row) => [row.ticker, row]))])
  );

  for (const bucket of patch?.buckets || []) {
    if (!bucketMap.has(bucket.date)) bucketMap.set(bucket.date, new Map());
    const rows = bucketMap.get(bucket.date);
    for (const row of bucket.rows || []) rows.set(row.ticker, row);
  }

  const buckets = [...bucketMap.entries()]
    .map(([date, rows]) => ({ date, rows: sortRows([...rows.values()]) }))
    .sort((a, b) => toDateSortKey(a.date).localeCompare(toDateSortKey(b.date)));

  return {
    buckets,
    allowedTickers: patch?.allowedTickers?.length ? patch.allowedTickers : base?.allowedTickers || [],
  };
}

function overlayFreshTicks(normalized, touchedMap, sinceMs) {
  if (!touchedMap || touchedMap.size === 0) return normalized;
  const freshTicks = [];
  for (const [key, value] of [...touchedMap]) {
    if (value.at < sinceMs) {
      touchedMap.delete(key);
      continue;
    }
    freshTicks.push(value.row);
  }
  return mergeTicks(normalized, freshTicks);
}

function toRealtimeTick(item, fallbackDate) {
  const row = normalizeTicker(item);
  if (!row) return null;
  return { ...row, date: item?.date || fallbackDate };
}

function extractRealtimeTicks(payload) {
  if (!payload) return [];

  if (typeof payload === "string") {
    try {
      return extractRealtimeTicks(JSON.parse(payload));
    } catch {
      return [];
    }
  }

  if (Array.isArray(payload)) {
    return payload.flatMap(extractRealtimeTicks);
  }

  const data = CHANNELS.includes(payload?.channel) && payload?.data ? payload.data : payload;
  const buckets = getReply(data)?.cashFlowTickers ?? data?.cashFlowTickers;

  if (Array.isArray(buckets)) {
    return buckets.flatMap((bucket, index) => {
      const date = getBucketDate(bucket, index);
      return (bucket.cashTickerDatas ?? bucket.cashFlowTickerDatas ?? [])
        .map((item) => toRealtimeTick(item, date))
        .filter(Boolean);
    });
  }

  if (Array.isArray(data?.cashTickerDatas)) {
    const date = getBucketDate(data, 0);
    return data.cashTickerDatas.map((item) => toRealtimeTick(item, date)).filter(Boolean);
  }

  const tick = toRealtimeTick(data, data?.date);
  return tick ? [tick] : [];
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const parsed = readDataCache(CACHE_KEY, { schemaVersion: CACHE_SCHEMA_VERSION });
    if (parsed && Array.isArray(parsed.buckets)) {
      globalCache = {
        buckets: parsed.buckets,
        allowedTickers: Array.isArray(parsed.allowedTickers) ? parsed.allowedTickers : [],
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load CashFlowTicker cache:", e);
  }
  return null;
}

function setCachedData(data) {
  const buildPayload = (limit) => {
    const buckets = Array.isArray(data.buckets) ? data.buckets.slice(-limit) : [];
    return {
      buckets,
      allowedTickers: data.allowedTickers || [],
      updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
    };
  };
  try {
    writeDataCache(CACHE_KEY, buildPayload(CACHE_PERSIST_LIMIT), { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch (e) {
    try {
      removeDataCache(CACHE_KEY);
      for (const key of LEGACY_CACHE_KEYS) removeDataCache(key);
      writeDataCache(CACHE_KEY, buildPayload(8), { schemaVersion: CACHE_SCHEMA_VERSION });
    } catch (retryError) {
      console.warn("Failed to save CashFlowTicker cache:", retryError);
    }
  }
}

export function useCashFlowTicker() {
  const inFlightRef = useRef(null);
  const realtimeTouchedRef = useRef(new Map());
  const cached = getCachedData();

  const [state, setState] = useState(() =>
    cached ? { buckets: cached.buckets, allowedTickers: cached.allowedTickers || [] } : { buckets: [], allowedTickers: [] }
  );
  const [status, setStatus] = useState(() => (cached ? "ready" : "loading"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => cached?.updatedAt || null);

  const fetchSnapshot = useCallback(async ({ background = false, force = false, fresh = false, limit = null, merge = false } = {}) => {
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      if (!background) setStatus((s) => (s === "ready" ? "ready" : "loading"));
      const startedAt = Date.now();
      try {
        const apiUrl = getApiUrl(limit, { fresh, bust: force || fresh });
        const res = await fetch(apiUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = getReply(json)?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);

        const normalized = overlayFreshTicks(normalize(json), realtimeTouchedRef.current, startedAt);
        const now = new Date();

        setState((prev) => {
          const nextState = merge ? mergeSnapshots(prev, normalized) : normalized;
          const cacheVal = { ...nextState, updatedAt: now };
          globalCache = cacheVal;
          setCachedData(cacheVal);
          return nextState;
        });
        setUpdatedAt(now);
        setStatus("ready");
        setError(null);
      } catch (e) {
        console.error("CashFlowTicker Fetch error:", e);
        const currentCache = getCachedData();
        if (currentCache) {
          setError(null);
          setStatus("ready");
        } else {
          setError(e.message || "Lỗi tải dữ liệu");
          setStatus("error");
        }
      } finally {
        if (inFlightRef.current === request) inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const warmupTimers = [];
    const firstLimit = cached ? FULL_LIMIT : INITIAL_LIMIT;
    fetchSnapshot({ background: Boolean(cached), fresh: Boolean(cached), limit: firstLimit }).then(() => {
      if (cancelled) return;
      if (!cached) {
        fetchSnapshot({ background: true, force: true, fresh: true, limit: FULL_LIMIT });
      }

      for (const delay of WARMUP_REFRESH_DELAYS) {
        const timer = window.setTimeout(() => {
          fetchSnapshot({ background: true, force: true, fresh: true, limit: INITIAL_LIMIT, merge: true });
        }, delay);
        warmupTimers.push(timer);
      }
    });
    const refresh = () => {
      if (document.visibilityState === "visible") fetchSnapshot({ background: true, limit: INITIAL_LIMIT, merge: true });
    };
    // Không poll định kỳ: dữ liệu mới đến qua Socket.IO; chỉ fetch lại snapshot
    // khi tab hiện lại / được focus hoặc khi socket realtime reconnect (bù dữ liệu hụt).
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(REALTIME_RECONNECT_EVENT, refresh);
    return () => {
      cancelled = true;
      for (const timer of warmupTimers) window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(REALTIME_RECONNECT_EVENT, refresh);
    };
  }, [fetchSnapshot]);

  const applyTick = useCallback((payload) => {
    const ticks = extractRealtimeTicks(payload);
    if (ticks.length === 0) return;
    const now = new Date();
    const allowedTickerSet = state.allowedTickers?.length ? new Set(state.allowedTickers) : null;

    for (const row of ticks) {
      if (allowedTickerSet && !allowedTickerSet.has(normalizeTickerCode(row.ticker))) continue;
      const date = row.date || state.buckets[state.buckets.length - 1]?.date || new Date().toISOString().slice(0, 10);
      realtimeTouchedRef.current.set(bucketKey(date, row.ticker), { row: { ...row, date }, at: now.getTime() });
    }

    setState((prev) => {
      const next = mergeTicks(prev, ticks);
      const cacheVal = { ...next, updatedAt: now };
      globalCache = cacheVal;
      setCachedData(cacheVal);
      return next;
    });
    setUpdatedAt(now);
    setStatus("ready");
    setError(null);
  }, [state.allowedTickers, state.buckets]);

  const latest = state.buckets[state.buckets.length - 1] || null;
  return { ...state, latest, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true, fresh: true, limit: FULL_LIMIT }), applyTick };
}

function getRealtimeUrl() {
  return resolveRealtimeUrl(
    import.meta.env.VITE_CASHFLOW_TICKER_WS_URL,
    import.meta.env.VITE_CASHFLOW_WS_URL,
    import.meta.env.VITE_SMDT_WS_URL
  );
}

export function useRealtimeCashFlowTickerFeed(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), { autoConnect: true, transports: ["websocket"] });

    const handlePayload = (payload) => {
      if (extractRealtimeTicks(payload).length > 0) cbRef.current?.(payload);
    };

    let hadConnected = false;
    socket.on("connect", () => {
      console.log("Socket.IO (cashflow ticker) connected to namespace:", socket.nsp);
      setConnected(true);
      socket.emit("message", { action: "subscribe", channels: CHANNELS });
      // Reconnect: báo các data hook fetch lại snapshot bù dữ liệu hụt lúc mất kết nối.
      if (hadConnected) emitRealtimeReconnected();
      hadConnected = true;
    });

    socket.on("message", handlePayload);

    socket.on("connect_error", (error) => console.error("Socket.IO (cashflow ticker) connection error:", error.message));
    socket.on("disconnect", () => setConnected(false));

    return () => socket.disconnect();
  }, []);

  return { connected };
}
