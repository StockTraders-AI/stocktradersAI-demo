import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { readDataCache, writeDataCache } from "./cacheStorage";
import { resolveRealtimeUrl } from "./realtimeUrl";

/* ───────────────────────────────────────────────────────────────────────
 * useSMDTTicker — nguồn dữ liệu "Sức mạnh dòng tiền cổ phiếu"
 *
 * - Tải snapshot ban đầu từ API getSMDTTicker (POST) qua proxy /api/smdt-ticker.
 * - Mỗi cổ phiếu trả về một chuỗi SMDT theo ngày: { keyName, keyValue, smdts: [{ date, smdt }] }.
 * - Chuẩn hoá thành lưới (cổ phiếu × ngày) → smdt (số), dễ render heatmap.
 *   (Mô hình số giống SMDT ngành; bố cục cột theo mã giống Dòng tiền cổ phiếu.)
 * - Realtime: bật `useRealtimeSMDTTickerFeed` (Socket.IO) trỏ tới Realtime Core,
 *   subscribe channel "smdt-stock", hoặc gọi `applyTick()` để merge tick mới.
 * ─────────────────────────────────────────────────────────────────────── */

const API_BASE_URL = "/api/smdt-ticker";
const INITIAL_LIMIT = 500;
const FULL_LIMIT = "full";
const DEFAULT_REFRESH_MS = 15_000;
const CACHE_KEY = "smdt_ticker_data_cache";
const CACHE_SCHEMA_VERSION = 1;
// Giữ đủ dữ liệu trong RAM (để lịch lùi sâu hơn), nhưng chỉ lưu localStorage 150 phiên
// gần nhất — tránh QuotaExceededError. Lần mở lại sẽ refetch full ngay nên không mất gì.
const CACHE_PERSIST_LIMIT = 150;
const CHANNELS = ["smdt-stock"];
const REPLY_KEYS = ["SMDTTickerReply", "SMDTTickerRequest"];

let globalCache = null; // RAM Cache to keep data alive across hook remounts

function getRefreshMs() {
  const configured = Number(import.meta.env.VITE_SMDT_TICKER_REFRESH_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_MS;
}

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return null;
}

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function sortTickers(tickers) {
  return [...tickers].sort((a, b) => a.key.localeCompare(b.key));
}

function applyLimitParam(params, limit) {
  if (limit === FULL_LIMIT) {
    params.set("limit", FULL_LIMIT);
  } else if (Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(limit));
  }
}

/** Chuẩn hoá payload API -> { tickers, datesAsc, matrix }. */
function normalize(reply) {
  const datas = getReply(reply)?.SMDTDatas ?? reply?.SMDTDatas ?? [];

  const dateSet = new Set();
  // matrix[keyValue][date] = smdt
  const matrix = {};
  const tickers = [];
  const seen = new Set();

  for (const d of datas) {
    const key = d?.keyValue || d?.ticker || d?.code;
    if (!key) continue;
    const row = matrix[key] || (matrix[key] = {});
    for (const p of d.smdts ?? []) {
      const smdt = toNumber(p?.smdt);
      if (!p?.date || smdt == null) continue;
      row[p.date] = smdt;
      dateSet.add(p.date);
    }
    if (!seen.has(key)) {
      seen.add(key);
      tickers.push({ key, name: d?.keyName || key });
    }
  }

  return { tickers: sortTickers(tickers), datesAsc: [...dateSet].sort(), matrix };
}

function mergeSnapshots(base, patch) {
  const dateSet = new Set([...(base?.datesAsc || []), ...(patch?.datesAsc || [])]);
  const tickerMap = new Map((base?.tickers || []).map((ticker) => [ticker.key, ticker]));
  for (const ticker of patch?.tickers || []) tickerMap.set(ticker.key, ticker);

  const matrix = { ...(base?.matrix || {}) };
  for (const ticker in patch?.matrix || {}) {
    matrix[ticker] = { ...(matrix[ticker] || {}), ...patch.matrix[ticker] };
  }

  return { tickers: sortTickers([...tickerMap.values()]), datesAsc: [...dateSet].sort(), matrix };
}

/** Khoá ô (cổ phiếu × ngày) cho map theo dõi giá trị realtime. */
function cellKey(ticker, date) {
  return `${ticker}\u0000${date}`;
}

/**
 * Phủ các tick realtime "còn mới hơn snapshot" lên trên dữ liệu snapshot vừa fetch.
 * Cùng cơ chế với useSMDT: poll dự phòng không bao giờ ghi đè dữ liệu realtime mới hơn.
 */
function overlayFreshTicks(normalized, touchedMap, sinceMs) {
  if (!touchedMap || touchedMap.size === 0) return normalized;

  const matrix = { ...normalized.matrix };
  const dateSet = new Set(normalized.datesAsc);
  const tickerKeys = new Set(normalized.tickers.map((tk) => tk.key));
  let tickers = normalized.tickers;
  let changed = false;

  for (const [k, v] of [...touchedMap]) {
    if (v.at < sinceMs) {
      touchedMap.delete(k); // snapshot đã mới ít nhất bằng tick này → bỏ theo dõi.
      continue;
    }
    const sep = k.indexOf("\u0000");
    const ticker = k.slice(0, sep);
    const date = k.slice(sep + 1);

    matrix[ticker] = { ...(matrix[ticker] || {}), [date]: v.smdt };
    dateSet.add(date);
    if (!tickerKeys.has(ticker)) {
      tickerKeys.add(ticker);
      tickers = [...tickers, { key: ticker, name: v.name || ticker }];
    }
    changed = true;
  }

  if (!changed) return normalized;
  if (tickers !== normalized.tickers) tickers = sortTickers(tickers);
  return { tickers, datesAsc: [...dateSet].sort(), matrix };
}

function toRealtimeTick(item) {
  const ticker = item?.keyValue ?? item?.ticker ?? item?.code;
  const date = item?.date;
  const smdt = toNumber(item?.smdt);
  if (!ticker || !date || smdt == null) return null;
  return { ticker, date, smdt, name: item?.keyName };
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

  // Mảng cổ phiếu: { keyName, keyValue, smdts: [{ date, smdt }] }.
  const datas = getReply(data)?.SMDTDatas ?? data?.SMDTDatas;
  if (Array.isArray(datas)) {
    return datas.flatMap(extractRealtimeTicks);
  }

  // Một cổ phiếu đơn lẻ với chuỗi smdts.
  if (Array.isArray(data?.smdts) && (data?.keyValue || data?.ticker || data?.code)) {
    return data.smdts
      .map((p) => toRealtimeTick({ ...p, keyValue: data.keyValue, ticker: data.ticker, code: data.code, keyName: data.keyName }))
      .filter(Boolean);
  }

  // Một tick đơn lẻ { keyValue, date, smdt }.
  const tick = toRealtimeTick(data);
  return tick ? [tick] : [];
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const parsed = readDataCache(CACHE_KEY, { schemaVersion: CACHE_SCHEMA_VERSION });
    if (parsed && parsed.tickers && parsed.datesAsc && parsed.matrix) {
      globalCache = {
        tickers: parsed.tickers,
        datesAsc: parsed.datesAsc,
        matrix: parsed.matrix,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load SMDTTicker cache:", e);
  }
  return null;
}

function setCachedData(data) {
  try {
    // Chỉ lưu 150 phiên gần nhất để khỏi vượt hạn mức localStorage.
    const datesAsc = Array.isArray(data.datesAsc) ? data.datesAsc.slice(-CACHE_PERSIST_LIMIT) : [];
    const keep = new Set(datesAsc);
    const matrix = {};
    for (const ticker in data.matrix) {
      const byDate = data.matrix[ticker];
      const row = {};
      for (const date in byDate) if (keep.has(date)) row[date] = byDate[date];
      matrix[ticker] = row;
    }
    writeDataCache(
      CACHE_KEY,
      {
        tickers: data.tickers,
        datesAsc,
        matrix,
        updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
      },
      { schemaVersion: CACHE_SCHEMA_VERSION }
    );
  } catch (e) {
    console.warn("Failed to save SMDTTicker cache:", e);
  }
}

export function useSMDTTicker() {
  const inFlightRef = useRef(null);
  // Ô (cổ phiếu × ngày) đã cập nhật qua realtime + thời điểm, để poll dự phòng không ghi đè.
  const realtimeTouchedRef = useRef(new Map());
  const cached = getCachedData();

  const [state, setState] = useState(() =>
    cached
      ? { tickers: cached.tickers, datesAsc: cached.datesAsc, matrix: cached.matrix }
      : { tickers: [], datesAsc: [], matrix: {} }
  );
  const [status, setStatus] = useState(() => (cached ? "ready" : "loading"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => cached?.updatedAt || null);

  const fetchSnapshot = useCallback(async ({ background = false, force = false, limit = null, merge = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      if (!background) setStatus((s) => (s === "ready" ? "ready" : "loading"));
      const startedAt = Date.now();
      try {
        const params = new URLSearchParams({ _: String(startedAt) });
        applyLimitParam(params, limit);
        const res = await fetch(`${API_BASE_URL}?${params.toString()}`, { cache: "no-store" });
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
        console.error("SMDTTicker Fetch error:", e);
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
    fetchSnapshot({ background: Boolean(cached), limit: cached ? FULL_LIMIT : INITIAL_LIMIT }).then(() => {
      if (!cancelled && !cached) fetchSnapshot({ background: true, force: true, limit: FULL_LIMIT });
    });
    const refresh = () => {
      if (document.visibilityState === "visible") fetchSnapshot({ background: true, limit: INITIAL_LIMIT, merge: true });
    };
    const timer = window.setInterval(refresh, getRefreshMs());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchSnapshot]);

  /** Merge dữ liệu realtime vào state (dùng cho feed Kafka/Socket.IO). */
  const applyTick = useCallback((payload) => {
    const ticks = extractRealtimeTicks(payload);
    if (ticks.length === 0) return;

    const now = new Date();
    // Ghi lại từng ô realtime + thời điểm để snapshot poll sau này không ghi đè.
    for (const { ticker, date, smdt, name } of ticks) {
      realtimeTouchedRef.current.set(cellKey(ticker, date), { smdt, name, at: now.getTime() });
    }
    setState((prev) => {
      const matrix = { ...prev.matrix };
      const dateSet = new Set(prev.datesAsc);
      const tickerKeys = new Set(prev.tickers.map((tk) => tk.key));
      let tickers = prev.tickers;

      for (const { ticker, date, smdt, name } of ticks) {
        matrix[ticker] = { ...(matrix[ticker] || {}), [date]: smdt };
        dateSet.add(date);
        if (!tickerKeys.has(ticker)) {
          tickerKeys.add(ticker);
          tickers = [...tickers, { key: ticker, name: name || ticker }];
        }
      }

      const datesAsc = [...dateSet].sort();
      tickers = tickers === prev.tickers ? tickers : sortTickers(tickers);
      const nextState = { ...prev, matrix, datesAsc };
      if (tickers !== prev.tickers) nextState.tickers = tickers;

      const cacheVal = { ...nextState, updatedAt: now };
      globalCache = cacheVal;
      setCachedData(cacheVal);
      return nextState;
    });
    setUpdatedAt(now);
    setStatus("ready");
    setError(null);
  }, []);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true, limit: FULL_LIMIT }), applyTick };
}

function getRealtimeUrl() {
  return resolveRealtimeUrl(import.meta.env.VITE_SMDT_TICKER_WS_URL, import.meta.env.VITE_SMDT_WS_URL);
}

/* ───────────────────────────────────────────────────────────────────────
 * useRealtimeSMDTTickerFeed — cầu nối tới gateway realtime phía sau Kafka qua Socket.IO.
 *
 * Cách dùng: đặt VITE_SMDT_TICKER_WS_URL (hoặc dùng chung VITE_SMDT_WS_URL) trỏ tới
 * Socket.IO namespace /realtime; subscribe channel "smdt-stock".
 * ─────────────────────────────────────────────────────────────────────── */
export function useRealtimeSMDTTickerFeed(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), { autoConnect: true });

    const handlePayload = (payload) => {
      if (extractRealtimeTicks(payload).length > 0) cbRef.current?.(payload);
    };

    socket.on("connect", () => {
      console.log("Socket.IO (smdt ticker) connected to namespace:", socket.nsp);
      setConnected(true);
      socket.emit("message", { action: "subscribe", channels: CHANNELS });
    });

    socket.onAny((event, ...args) => {
      if (event === "connect" || event === "disconnect" || event === "connect_error") return;
      if (CHANNELS.includes(event) && args.length === 1) {
        handlePayload({ channel: event, data: args[0] });
        return;
      }
      for (const payload of args) handlePayload(payload);
    });

    socket.on("connect_error", (error) => console.error("Socket.IO (smdt ticker) connection error:", error.message));
    socket.on("disconnect", () => setConnected(false));

    return () => socket.disconnect();
  }, []);

  return { connected };
}
