import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { readDataCache, writeDataCache } from "./cacheStorage";
import { resolveRealtimeUrl } from "./realtimeUrl";

const API_URL = "/api/stock-signal";
const CACHE_KEY = "stock_signal_data_cache_v4";
const CACHE_SCHEMA_VERSION = 1;
const LEGACY_CACHE_KEYS = ["stock_signal_data_cache_v3"];
const CACHE_POINT_LIMIT = 16;
const DEFAULT_REFRESH_MS = 15_000;
const REPLY_KEYS = ["StockSignalReply", "StockSignalRequest"];
const CHANNELS = ["stock-signal"];

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

  if (pickTicker(reply)) return [reply];
  if (pickTicker(data)) return [data];
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
    ave: toNumber(point.ave),
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
        hold: latestPoint?.hold ?? null,
        ave: latestPoint?.ave ?? null,
        price: latestPoint?.price ?? null,
        smdt: latestPoint?.smdt ?? null,
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

function mergeSignalPoints(basePoints = [], patchPoints = []) {
  const pointMap = new Map(basePoints.map((point) => [getPointDate(point), point]));
  for (const point of patchPoints) {
    const date = getPointDate(point);
    if (date) pointMap.set(date, { ...(pointMap.get(date) || {}), ...point });
  }
  return sortSignalPoints([...pointMap.values()]);
}

function mergeSignals(base, patch) {
  if (!patch?.rows?.length) return base;

  const rowMap = new Map((base?.rows || []).map((row) => [row.ticker, row]));
  for (const row of patch.rows) {
    const current = rowMap.get(row.ticker);
    if (!current) {
      rowMap.set(row.ticker, row);
      continue;
    }

    const points = mergeSignalPoints(current.points, row.points);
    const latestPoint = points[points.length - 1] || null;
    rowMap.set(row.ticker, {
      ...current,
      ...row,
      signal: latestPoint?.signal || row.signal || current.signal,
      weight: latestPoint?.hold ?? latestPoint?.weight ?? row.weight ?? current.weight,
      hold: latestPoint?.hold ?? row.hold ?? current.hold,
      percent: latestPoint?.percent ?? row.percent ?? current.percent,
      ave: latestPoint?.ave ?? row.ave ?? current.ave,
      price: latestPoint?.price ?? row.price ?? current.price,
      smdt: latestPoint?.smdt ?? row.smdt ?? current.smdt,
      date: latestPoint?.date || row.date || current.date,
      points,
    });
  }

  const rows = [...rowMap.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const signalByTicker = {};
  for (const row of rows) signalByTicker[row.ticker] = row;
  return { rows, signalByTicker };
}

function extractRealtimeSignals(payload) {
  if (!payload) return { rows: [], signalByTicker: {} };

  if (typeof payload === "string") {
    try {
      return extractRealtimeSignals(JSON.parse(payload));
    } catch {
      return { rows: [], signalByTicker: {} };
    }
  }

  if (Array.isArray(payload)) {
    return payload.reduce((acc, item) => mergeSignals(acc, extractRealtimeSignals(item)), { rows: [], signalByTicker: {} });
  }

  const data = CHANNELS.includes(payload?.channel) && payload?.data ? payload.data : payload;
  return normalize(data);
}

function readCacheKey(key) {
  try {
    const parsed = readDataCache(key, { schemaVersion: CACHE_SCHEMA_VERSION });
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    if (parsed && parsed.signalByTicker && rows.length) {
      return {
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
        signalByTicker: parsed.signalByTicker,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
    }
  } catch (e) {
    console.warn("Failed to load StockSignal cache:", e);
  }
  return null;
}

function getCachedData() {
  if (globalCache) return globalCache;
  globalCache = readCacheKey(CACHE_KEY) || LEGACY_CACHE_KEYS.map(readCacheKey).find(Boolean) || null;
  return globalCache;
}

function serializeRows(data, pointLimit) {
  return (data.rows || []).map((row) => ({
    ticker: row.ticker,
    signal: row.signal,
    weight: row.weight,
    hold: row.hold,
    percent: row.percent,
    ave: row.ave,
    price: row.price,
    smdt: row.smdt,
    date: row.date,
    points: Array.isArray(row.points)
      ? row.points.slice(-pointLimit).map((point) => ({
          date: point.date,
          signal: point.signal,
          weight: point.weight,
          hold: point.hold,
          percent: point.percent,
          ave: point.ave,
          price: point.price,
          smdt: point.smdt,
          trade: point.trade,
        }))
      : [],
  }));
}

function setCachedData(data) {
  const rows = serializeRows(data, CACHE_POINT_LIMIT);
  const signalByTicker = {};
  for (const row of rows) signalByTicker[row.ticker] = row;
  try {
    writeDataCache(
      CACHE_KEY,
      {
        rows,
        signalByTicker,
        updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
      },
      { schemaVersion: CACHE_SCHEMA_VERSION }
    );
  } catch (e) {
    try {
      const fallbackRows = serializeRows(data, 1);
      const fallbackSignalByTicker = {};
      for (const row of fallbackRows) fallbackSignalByTicker[row.ticker] = row;
      writeDataCache(
        CACHE_KEY,
        {
          rows: fallbackRows,
          signalByTicker: fallbackSignalByTicker,
          updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
        },
        { schemaVersion: CACHE_SCHEMA_VERSION }
      );
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
        // URL ổn định (không cache-buster) để hit được edge cache của CDN; chỉ bust khi force refresh.
        const url = force ? `${API_URL}?fresh=1&_=${Date.now()}` : API_URL;
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

  const applyTick = useCallback((payload) => {
    const normalized = extractRealtimeSignals(payload);
    if (!normalized.rows.length) return;

    const now = new Date();
    setState((prev) => {
      const nextState = mergeSignals(prev, normalized);
      const cacheVal = { ...nextState, updatedAt: now };
      globalCache = cacheVal;
      setCachedData(cacheVal);
      return nextState;
    });
    setUpdatedAt(now);
    setStatus("ready");
    setError(null);
  }, []);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }), applyTick };
}

function getRealtimeUrl() {
  return resolveRealtimeUrl(import.meta.env.VITE_STOCK_SIGNAL_WS_URL, import.meta.env.VITE_SMDT_WS_URL);
}

export function useRealtimeStockSignalFeed(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), { autoConnect: true });

    const handlePayload = (payload) => {
      if (extractRealtimeSignals(payload).rows.length > 0) cbRef.current?.(payload);
    };

    socket.on("connect", () => {
      console.log("Socket.IO (stock signal) connected to namespace:", socket.nsp);
      setConnected(true);
      socket.emit("message", { action: "subscribe", channels: CHANNELS });
    });

    socket.on("message", handlePayload);
    socket.on("connect_error", (error) => console.error("Socket.IO (stock signal) connection error:", error.message));
    socket.on("disconnect", () => setConnected(false));

    return () => socket.disconnect();
  }, []);

  return { connected };
}
