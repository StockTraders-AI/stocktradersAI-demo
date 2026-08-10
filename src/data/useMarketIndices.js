import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readDataCache, writeDataCache } from "./cacheStorage";
import { fetchDataPostWithClientCache } from "./requestCache";
import { REALTIME_RECONNECT_EVENT, shouldRunClientRefresh } from "./realtimeUrl";

const API_URL = "/api/index-daily-changes";
const CACHE_KEY = "market_indices_daily_changes_cache_v1";
const CACHE_SCHEMA_VERSION = 2;

const INDEX_CONFIG = [
  { name: "VNINDEX", aliases: ["VNINDEX", "VN-INDEX", "VN_INDEX"] },
  { name: "HNX", aliases: ["HNXINDEX", "HNX", "HNX-INDEX", "HNX_INDEX"] },
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
  const data = reply?.IndexDailyChangesReply || reply || {};
  const rows = Array.isArray(data.indices) ? data.indices : [];
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
    const chg = toNumber(row.change);
    const pct = toNumber(row.percent);

    return {
      name: item.name,
      val: formatValue(close),
      chg: chg == null ? "—" : `${chg >= 0 ? "+" : ""}${formatValue(chg)}`,
      pct: formatPct(pct),
      rawPct: pct,
      date: row.date,
      previousDate: row.previousDate,
      previousClose: toNumber(row.previousClose),
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
        const json = await fetchDataPostWithClientCache(API_URL, force ? { fresh: true } : {}, {
          force,
          ttlMs: 30_000,
        });
        const code = json?.IndexDailyChangesReply?.codeReply?.codeID;
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
        console.error("IndexDailyChanges Fetch error:", error);
        const currentCache = getCachedData();
        setState((current) => ({
          indices: currentCache?.indices || current.indices,
          updatedAt: currentCache?.updatedAt || current.updatedAt,
          status: current.status === "ready" || currentCache ? "ready" : "error",
          error: currentCache ? null : error.message || "Lỗi tải dữ liệu chỉ số",
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
      if (document.visibilityState === "visible" && shouldRunClientRefresh("market-indices")) {
        fetchSnapshot({ background: true });
      }
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

  return useMemo(
    () => ({
      ...state,
      refresh: () => fetchSnapshot({ force: true }),
    }),
    [fetchSnapshot, state]
  );
}
