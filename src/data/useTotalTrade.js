import { useCallback, useEffect, useRef, useState } from "react";
import { readDataCache, removeDataCache, writeDataCache } from "./cacheStorage";
import { REALTIME_RECONNECT_EVENT } from "./realtimeUrl";

const API_URL = "/api/total-trade";
const CACHE_KEY = "total_trade_data_cache_v1";
const CACHE_SCHEMA_VERSION = 1;
const CACHE_PERSIST_LIMIT = 45;

let globalCache = null;

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTicker(ticker) {
  return ticker ? String(ticker).trim().toUpperCase() : "";
}

function normalize(reply) {
  const data = reply?.TotalTradeReply || reply?.TotalTradeRequest || reply || {};
  const stockTotals = Array.isArray(data.stockTotals) ? data.stockTotals : [];
  const tickers = [];
  const matrix = {};

  for (const item of stockTotals) {
    const ticker = normalizeTicker(item?.ticker || item?.code || item?.symbol);
    if (!ticker) continue;
    const row = {};
    for (const point of item.totalDatas || []) {
      const date = point?.date;
      const close = toNumber(point?.close);
      if (!date || close == null) continue;
      row[date] = {
        close,
        price: close > 1000 ? close : close * 1000,
        open: toNumber(point?.open),
        high: toNumber(point?.high),
        low: toNumber(point?.low),
        vol: toNumber(point?.vol),
      };
    }
    matrix[ticker] = row;
    tickers.push({ ticker, type: item?.type || "" });
  }

  return { tickers: tickers.sort((a, b) => a.ticker.localeCompare(b.ticker)), matrix };
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const parsed = readDataCache(CACHE_KEY, { schemaVersion: CACHE_SCHEMA_VERSION });
    if (parsed?.matrix && parsed?.tickers) {
      globalCache = {
        tickers: parsed.tickers,
        matrix: parsed.matrix,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load TotalTrade cache:", e);
  }
  return null;
}

function setCachedData(data) {
  const buildPayload = (limit) => {
    const matrix = {};
    for (const ticker in data.matrix) {
      const row = data.matrix[ticker] || {};
      const dates = Object.keys(row).sort().slice(-limit);
      matrix[ticker] = {};
      for (const date of dates) matrix[ticker][date] = row[date];
    }
    return {
      tickers: data.tickers,
      matrix,
      updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
    };
  };
  try {
    writeDataCache(CACHE_KEY, buildPayload(CACHE_PERSIST_LIMIT), { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch (e) {
    try {
      removeDataCache(CACHE_KEY);
      writeDataCache(CACHE_KEY, buildPayload(12), { schemaVersion: CACHE_SCHEMA_VERSION });
    } catch (retryError) {
      console.warn("Failed to save TotalTrade cache:", retryError);
    }
  }
}

export function useTotalTrade() {
  const inFlightRef = useRef(null);
  const cached = getCachedData();
  const [state, setState] = useState(() => cached ? { tickers: cached.tickers, matrix: cached.matrix } : { tickers: [], matrix: {} });
  const [status, setStatus] = useState(() => cached ? "ready" : "loading");
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => cached?.updatedAt || null);

  const fetchSnapshot = useCallback(async ({ force = false, background = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      if (!background) setStatus((s) => s === "ready" ? "ready" : "loading");
      try {
        // URL ổn định (không cache-buster) để hit được edge cache của CDN; chỉ bust khi force refresh.
        const url = force ? `${API_URL}?fresh=1&_=${Date.now()}` : API_URL;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = (json?.TotalTradeReply || json?.TotalTradeRequest)?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);

        const normalized = normalize(json);
        const now = new Date();
        const cacheVal = { ...normalized, updatedAt: now };
        setState(normalized);
        setUpdatedAt(now);
        setStatus("ready");
        setError(null);
        globalCache = cacheVal;
        setCachedData(cacheVal);
      } catch (e) {
        console.error("TotalTrade Fetch error:", e);
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
    fetchSnapshot({ background: Boolean(cached) });
    const refresh = () => {
      if (document.visibilityState === "visible") fetchSnapshot({ background: true });
    };

    // Không poll định kỳ: chỉ fetch lại snapshot khi tab hiện lại / được focus
    // hoặc khi socket realtime reconnect để bù dữ liệu hụt.
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(REALTIME_RECONNECT_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(REALTIME_RECONNECT_EVENT, refresh);
    };
  }, [fetchSnapshot]);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }) };
}
