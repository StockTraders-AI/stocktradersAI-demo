import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { resolveRealtimeUrl } from "./realtimeUrl";

/* ───────────────────────────────────────────────────────────────────────
 * useStockWave — nguồn dữ liệu "Sóng cổ phiếu"
 *
 * - Tải snapshot từ API getStockWave qua proxy nội bộ.
 * - Chuẩn hoá waveDatas thành danh sách theo ngày, dễ render bảng/biểu đồ.
 * - Có cache RAM + localStorage để giữ giao diện ổn định khi remount.
 * ─────────────────────────────────────────────────────────────────────── */

const API_URL = "/api/stock-wave?limit=150";
const DEFAULT_REFRESH_MS = 15_000;
const CACHE_KEY = "stock_wave_data_cache";
const MAX_ROWS = 150;
const STOCK_WAVE_CHANNELS = ["smdt-stock"];
const STOCK_WAVE_REPLY_KEYS = ["StockWaveReply", "StockWaveRequest"];

let globalCache = null;

function getRefreshMs() {
  const configured = Number(import.meta.env.VITE_STOCK_WAVE_REFRESH_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_MS;
}

function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getStockWaveReply(data) {
  for (const key of STOCK_WAVE_REPLY_KEYS) {
    if (data?.[key]) {
      return data[key];
    }
  }
  return null;
}

function normalize(reply) {
  const stockWaves = getStockWaveReply(reply)?.stockWaves;
  const waveDatas = Array.isArray(stockWaves?.waveDatas) ? stockWaves.waveDatas : [];

  const rows = waveDatas
    .filter((item) => item?.date)
    .map((item) => ({
      date: item.date,
      buy: toNumber(item.buy),
      waitbuy: toNumber(item.waitbuy),
      waitsell: toNumber(item.waitsell),
      sell: toNumber(item.sell),
      total: toNumber(item.total),
      reliability: toNumber(item.reliability),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    name: stockWaves?.name || "ALL",
    rows,
  };
}

function sortAndTrimRows(rows) {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_ROWS);
}

function overlayFreshTicks(normalized, touchedMap, sinceMs) {
  if (!touchedMap || touchedMap.size === 0) return normalized;

  const rowMap = new Map(normalized.rows.map((row) => [row.date, row]));
  let changed = false;

  for (const [date, value] of [...touchedMap]) {
    if (value.at < sinceMs) {
      touchedMap.delete(date);
      continue;
    }

    rowMap.set(date, value.row);
    changed = true;
  }

  if (!changed) return normalized;
  return { ...normalized, rows: sortAndTrimRows([...rowMap.values()]) };
}

function toRealtimeTick(item) {
  const date = item?.date;
  if (!date) return null;

  return {
    date,
    buy: toNumber(item.buy),
    waitbuy: toNumber(item.waitbuy),
    waitsell: toNumber(item.waitsell),
    sell: toNumber(item.sell),
    total: toNumber(item.total),
    reliability: toNumber(item.reliability),
  };
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

  const data = STOCK_WAVE_CHANNELS.includes(payload?.channel) && payload?.data ? payload.data : payload;
  const stockWaves = getStockWaveReply(data)?.stockWaves ?? data?.stockWaves;
  const waveDatas = stockWaves?.waveDatas ?? data?.waveDatas;

  if (Array.isArray(waveDatas)) {
    return waveDatas.map(toRealtimeTick).filter(Boolean);
  }

  const tick = toRealtimeTick(data);
  return tick ? [tick] : [];
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const serialized = localStorage.getItem(CACHE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    if (parsed && Array.isArray(parsed.rows)) {
      globalCache = {
        name: parsed.name || "ALL",
        rows: parsed.rows,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load stock wave cache:", e);
  }
  return null;
}

function setCachedData(data) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        name: data.name,
        rows: data.rows,
        updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
      })
    );
  } catch (e) {
    console.warn("Failed to save stock wave cache:", e);
  }
}

export function useStockWave() {
  const inFlightRef = useRef(null);
  const realtimeTouchedRef = useRef(new Map());

  const [state, setState] = useState(() => {
    const cached = getCachedData();
    return cached ? { name: cached.name, rows: cached.rows } : { name: "ALL", rows: [] };
  });

  const [status, setStatus] = useState(() => (getCachedData() ? "ready" : "loading"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => getCachedData()?.updatedAt || null);

  const fetchSnapshot = useCallback(async ({ background = false, force = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      if (!background) {
        setStatus((s) => (s === "ready" ? "ready" : "loading"));
      }

      const startedAt = Date.now();
      try {
        const separator = API_URL.includes("?") ? "&" : "?";
        const res = await fetch(`${API_URL}${separator}_=${startedAt}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const code = getStockWaveReply(json)?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);

        const normalized = overlayFreshTicks(normalize(json), realtimeTouchedRef.current, startedAt);
        const now = new Date();

        setState(normalized);
        setUpdatedAt(now);
        setStatus("ready");
        setError(null);

        const cacheVal = { ...normalized, updatedAt: now };
        globalCache = cacheVal;
        setCachedData(cacheVal);
      } catch (e) {
        console.error("Stock wave fetch error:", e);
        const cached = getCachedData();
        if (cached) {
          setError(null);
          setStatus("ready");
        } else {
          setError(e.message || "Lỗi tải dữ liệu");
          setStatus("error");
        }
      } finally {
        if (inFlightRef.current === request) {
          inFlightRef.current = null;
        }
      }
    })();

    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    fetchSnapshot();

    const refresh = () => {
      if (document.visibilityState === "visible") {
        fetchSnapshot({ background: true });
      }
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
    const ticks = extractRealtimeTicks(payload);
    if (ticks.length === 0) return;

    const now = new Date();
    for (const row of ticks) {
      realtimeTouchedRef.current.set(row.date, { row, at: now.getTime() });
    }

    setState((prev) => {
      const rowMap = new Map(prev.rows.map((row) => [row.date, row]));
      for (const row of ticks) {
        rowMap.set(row.date, row);
      }

      const nextState = {
        ...prev,
        rows: sortAndTrimRows([...rowMap.values()]),
      };

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
  return resolveRealtimeUrl(import.meta.env.VITE_STOCK_WAVE_WS_URL, import.meta.env.VITE_SMDT_WS_URL);
}

/* ───────────────────────────────────────────────────────────────────────
 * useRealtimeStockWaveFeed — cầu nối realtime cho dữ liệu sóng cổ phiếu.
 *
 * Mặc định subscribe channel `smdt-stock`; nếu gateway dùng channel khác,
 * chỉ cần đổi STOCK_WAVE_CHANNELS hoặc cấu hình phía realtime core.
 * ─────────────────────────────────────────────────────────────────────── */
export function useRealtimeStockWaveFeed(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), {
      autoConnect: true,
    });

    const handlePayload = (payload) => {
      if (extractRealtimeTicks(payload).length > 0) {
        cbRef.current?.(payload);
      }
    };

    socket.on("connect", () => {
      console.log("Socket.IO connected for stock wave:", socket.nsp);
      setConnected(true);
      socket.emit("message", {
        action: "subscribe",
        channels: STOCK_WAVE_CHANNELS,
      });
    });

    socket.onAny((event, ...args) => {
      if (event === "connect" || event === "disconnect" || event === "connect_error") return;

      if (STOCK_WAVE_CHANNELS.includes(event) && args.length === 1) {
        handlePayload({ channel: event, data: args[0] });
        return;
      }

      for (const payload of args) {
        handlePayload(payload);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO stock wave connection error:", error.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket.IO stock wave disconnected:", reason);
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected };
}
