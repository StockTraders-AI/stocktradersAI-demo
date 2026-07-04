import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readDataCache, writeDataCache } from "./cacheStorage";

const API_URL = "/api/total-trade-real";
const DEFAULT_REFRESH_MS = 10_000;
const CACHE_KEY = "market_indices_real_cache_v1";
const CACHE_SCHEMA_VERSION = 1;

const INDEX_CONFIG = [
  { name: "VNINDEX", aliases: ["VNINDEX", "VN-INDEX", "VN_INDEX"] },
  { name: "HNX", aliases: ["HNXINDEX", "HNX-INDEX", "HNX_INDEX"] },
  { name: "UPCOM", aliases: ["UPCOM", "UPCOMINDEX", "UPCOM-INDEX", "UPCOM_INDEX"] },
];

let globalCache = null;

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatValue(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function emptyIndex(item) {
  return {
    name: item.name,
    val: "—",
    chg: "—",
    pct: "—",
    rawPct: null,
    live: false,
  };
}

function normalize(reply) {
  const data = reply?.TotalTradeRealReply || reply?.TotalTradeRealRequest || reply || {};
  const rows = Array.isArray(data.stockTotalReals) ? data.stockTotalReals : [];
  const rowByTicker = new Map();

  for (const row of rows) {
    const ticker = normalizeKey(row?.ticker || row?.code || row?.symbol);
    if (ticker) rowByTicker.set(ticker, row);
  }

  return INDEX_CONFIG.map((item) => {
    const aliases = [item.name, ...item.aliases].map(normalizeKey);
    const row = aliases.map((alias) => rowByTicker.get(alias)).find(Boolean);
    if (!row) return emptyIndex(item);

    const close = toNumber(row.close);
    const open = toNumber(row.open);
    const chg = close != null && open != null ? close - open : null;
    const pct = chg != null && open ? (chg / open) * 100 : null;

    return {
      name: item.name,
      val: formatValue(close),
      chg: chg == null ? "—" : `${chg >= 0 ? "+" : ""}${formatValue(chg)}`,
      pct: formatPct(pct),
      rawPct: pct,
      date: row.date,
      live: close != null,
    };
  });
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const parsed = readDataCache(CACHE_KEY, { schemaVersion: CACHE_SCHEMA_VERSION });
    if (parsed && Array.isArray(parsed.indices)) {
      globalCache = {
        indices: parsed.indices,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (error) {
    console.warn("Failed to load MarketIndices cache:", error);
  }
  return null;
}

function setCachedData(data) {
  try {
    writeDataCache(
      CACHE_KEY,
      {
        indices: data.indices,
        updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
      },
      { schemaVersion: CACHE_SCHEMA_VERSION }
    );
  } catch (error) {
    console.warn("Failed to save MarketIndices cache:", error);
  }
}

function getRefreshMs() {
  const configured = Number(import.meta.env.VITE_TOTAL_TRADE_REAL_REFRESH_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_MS;
}

export function useMarketIndices() {
  const inFlightRef = useRef(null);
  const cached = getCachedData();
  const [state, setState] = useState(() =>
    cached
      ? { indices: cached.indices, status: "ready", error: null, updatedAt: cached.updatedAt }
      : { indices: INDEX_CONFIG.map(emptyIndex), status: "loading", error: null, updatedAt: null }
  );

  const fetchSnapshot = useCallback(async ({ force = false, background = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      if (!background) {
        setState((current) => ({ ...current, status: current.status === "ready" ? "ready" : "loading" }));
      }
      try {
        const url = force ? `${API_URL}?fresh=1&_=${Date.now()}` : `${API_URL}?_=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = (json?.TotalTradeRealReply || json?.TotalTradeRealRequest)?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);

        const indices = normalize(json);
        const updatedAt = new Date();
        const cacheVal = { indices, updatedAt };
        globalCache = cacheVal;
        setCachedData(cacheVal);

        setState({
          indices,
          status: "ready",
          error: null,
          updatedAt,
        });
      } catch (error) {
        console.error("TotalTradeReal Fetch error:", error);
        const currentCache = getCachedData();
        setState((current) => ({
          indices: currentCache?.indices || current.indices,
          updatedAt: currentCache?.updatedAt || current.updatedAt,
          status: current.status === "ready" || currentCache ? "ready" : "error",
          error: currentCache ? null : error.message || "Lỗi tải dữ liệu realtime",
        }));
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
    const timer = window.setInterval(refresh, getRefreshMs());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchSnapshot]);

  return useMemo(
    () => ({
      ...state,
      refresh: () => fetchSnapshot({ force: true }),
    }),
    [fetchSnapshot, state]
  );
}
