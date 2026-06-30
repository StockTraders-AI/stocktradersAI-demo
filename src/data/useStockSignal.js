import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = "/api/stock-signal";
const CACHE_KEY = "stock_signal_data_cache_v2";
const DEFAULT_REFRESH_MS = 15_000;
const REPLY_KEYS = ["StockSignalReply", "StockSignalRequest"];

let globalCache = null;

function getRefreshMs() {
  const configured = Number(import.meta.env.VITE_STOCK_SIGNAL_REFRESH_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_MS;
}

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return data || {};
}

function normalizeTicker(value) {
  return value ? String(value).trim().toUpperCase() : "";
}

function normalizeSignal(value) {
  if (value === 1 || value === "1") return "MUA";
  if (value === 2 || value === "2") return "BAN";
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "BAN" || raw === "BÁN" || raw === "SELL") return "BAN";
  if (raw === "MUA" || raw === "BUY") return "MUA";
  return raw;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickTicker(item) {
  return normalizeTicker(item?.ticker || item?.code || item?.symbol || item?.stock || item?.ma || item?.keyValue);
}

function pickSignal(item) {
  return normalizeSignal(item?.signal || item?.sig || item?.recommend || item?.recommendation || item?.action || item?.tinHieu || item?.trade);
}

function pickWeight(item) {
  return toNumber(item?.weight ?? item?.tyTrong ?? item?.ratio ?? item?.rate ?? item?.hold ?? item?.holding ?? item?.percent);
}

function extractSignalRows(data) {
  const reply = getReply(data);
  const candidates = [
    reply?.stockSignals,
    reply?.stockSignalDatas,
    reply?.stockSignalData,
    reply?.signals,
    reply?.datas,
    reply?.data,
    data?.stockSignals,
    data?.signals,
  ];
  const firstArray = candidates.find(Array.isArray);
  if (firstArray) return firstArray;

  if (Array.isArray(reply?.stocks)) return reply.stocks;
  if (Array.isArray(data)) return data;
  return [];
}

function getPointDate(point) {
  return point?.date ? String(point.date) : "";
}

function sortSignalPoints(points) {
  return [...points].sort((a, b) => getPointDate(a).localeCompare(getPointDate(b)));
}

function normalizeSignalPoint(point) {
  if (!point) return null;
  return {
    date: point.date || "",
    signal: pickSignal(point),
    weight: pickWeight(point),
    hold: pickWeight({ hold: point.hold }),
    percent: pickWeight({ percent: point.percent }),
    price: toNumber(point.price),
    smdt: toNumber(point.smdt),
    trade: point.trade,
    raw: point,
  };
}

function normalize(data) {
  const rows = extractSignalRows(data)
    .map((item) => {
      const ticker = pickTicker(item);
      if (!ticker) return null;
      const points = Array.isArray(item?.signalDatas)
        ? sortSignalPoints(item.signalDatas).map(normalizeSignalPoint).filter(Boolean)
        : [];
      const latestPoint = points[points.length - 1] || normalizeSignalPoint(item);
      return {
        ticker,
        signal: latestPoint?.signal || pickSignal(item),
        weight: latestPoint?.hold ?? latestPoint?.weight ?? pickWeight(item),
        percent: latestPoint?.percent ?? null,
        date: latestPoint?.date || "",
        points,
        raw: item,
      };
    })
    .filter(Boolean);
  const signalByTicker = {};
  for (const row of rows) signalByTicker[row.ticker] = row;
  return { rows, signalByTicker };
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const serialized = localStorage.getItem(CACHE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    if (parsed && parsed.signalByTicker) {
      globalCache = {
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
        signalByTicker: parsed.signalByTicker,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load StockSignal cache:", e);
  }
  return null;
}

function setCachedData(data) {
  const rows = (data.rows || []).map((row) => ({
    ticker: row.ticker,
    signal: row.signal,
    weight: row.weight,
    percent: row.percent,
    date: row.date,
    points: Array.isArray(row.points)
      ? row.points.map((point) => ({
          date: point.date,
          signal: point.signal,
          weight: point.weight,
          hold: point.hold,
          percent: point.percent,
          price: point.price,
          smdt: point.smdt,
          trade: point.trade,
        }))
      : [],
  }));
  const signalByTicker = {};
  for (const row of rows) signalByTicker[row.ticker] = row;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        rows,
        signalByTicker,
        updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
      })
    );
  } catch (e) {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rows: [], signalByTicker: {}, updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null }));
    } catch (retryError) {
      console.warn("Failed to save StockSignal cache:", retryError);
    }
  }
}

export function useStockSignal() {
  const inFlightRef = useRef(null);
  const cached = getCachedData();
  const [state, setState] = useState(() => cached ? { rows: cached.rows, signalByTicker: cached.signalByTicker } : { rows: [], signalByTicker: {} });
  const [status, setStatus] = useState(() => (cached ? "ready" : "loading"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => cached?.updatedAt || null);

  const fetchSnapshot = useCallback(async ({ force = false, background = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      if (!background) setStatus((s) => (s === "ready" ? "ready" : "loading"));
      try {
        const url = force ? `${API_URL}?fresh=1&_=${Date.now()}` : `${API_URL}?_=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = getReply(json)?.codeReply?.codeID;
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
        console.error("StockSignal Fetch error:", e);
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
    const timer = window.setInterval(refresh, getRefreshMs());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchSnapshot]);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }) };
}
