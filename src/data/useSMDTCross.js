import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { readDataCache, writeDataCache } from "./cacheStorage";
import { REALTIME_RECONNECT_EVENT, emitRealtimeReconnected, resolveRealtimeUrl } from "./realtimeUrl";
import { CORE_BRANCHES } from "./useSMDT";

const ACCOUNT = "thao.dtt";
const BRANCH_CROSS_API = "/service/data/getSMDTBranchCross";
const TICKER_CROSS_API = "/service/data/getSMDTTickerCross";
const BRANCH_CACHE_KEY = "smdt_branch_cross_data_cache";
const TICKER_CACHE_KEY = "smdt_ticker_cross_data_cache";
const CACHE_SCHEMA_VERSION = 1;
const BRANCH_CHANNEL = "smdt-branch-cross";
const TICKER_CHANNEL = "smdt-ticker-cross";

const CORE_KEYS = new Set(CORE_BRANCHES.map((item) => item.key));

function getBranchLabel(keyName) {
  return CORE_BRANCHES.find((item) => item.key === keyName)?.label || keyName;
}

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readCache(key) {
  try {
    const parsed = readDataCache(key, { schemaVersion: CACHE_SCHEMA_VERSION });
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    writeDataCache(key, value, { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch {
    // Bỏ qua nếu trình duyệt chặn hoặc quota localStorage đầy.
  }
}

function sortBranches(branches) {
  return branches.sort((a, b) => {
    if (a.isCore && b.isCore) {
      return CORE_BRANCHES.findIndex((item) => item.key === a.key) - CORE_BRANCHES.findIndex((item) => item.key === b.key);
    }
    if (a.isCore) return -1;
    if (b.isCore) return 1;
    return a.label.localeCompare(b.label, "vi");
  });
}

function sortTickers(tickers) {
  return [...tickers].sort((a, b) => a.key.localeCompare(b.key));
}

function normalizeBranchCross(data) {
  const payload = data?.channel === BRANCH_CHANNEL && data?.data ? data.data : data;
  const datas = payload?.SMDTBranchCrossReply?.SMDTDatas ?? payload?.SMDTBranchCrossRequest?.SMDTDatas ?? payload?.SMDTDatas ?? [];
  const dateSet = new Set();
  const matrix = {};

  const branches = datas
    .map((branch) => {
      const key = branch?.keyName || branch?.keyValue;
      if (!key) return null;
      const row = {};
      for (const point of Array.isArray(branch?.smdts) ? branch.smdts : []) {
        const smdt = toNumber(point?.smdt);
        if (!point?.date || smdt == null) continue;
        row[point.date] = smdt;
        dateSet.add(point.date);
      }
      matrix[key] = row;
      return {
        key,
        label: getBranchLabel(key),
        isCore: CORE_KEYS.has(key),
      };
    })
    .filter(Boolean);

  return { branches: sortBranches(branches), datesAsc: [...dateSet].sort(), matrix };
}

function normalizeTickerCross(data) {
  const payload = data?.channel === TICKER_CHANNEL && data?.data ? data.data : data;
  const datas = payload?.SMDTTickerCrossReply?.SMDTDatas ?? payload?.SMDTTickerCrossRequest?.SMDTDatas ?? payload?.SMDTDatas ?? [];
  const dateSet = new Set();
  const matrix = {};
  const tickers = [];
  const seen = new Set();

  for (const item of datas) {
    const key = item?.keyValue || item?.ticker || item?.code;
    if (!key) continue;
    const row = matrix[key] || (matrix[key] = {});
    for (const point of Array.isArray(item?.smdts) ? item.smdts : []) {
      const smdt = toNumber(point?.smdt);
      if (!point?.date || smdt == null) continue;
      row[point.date] = smdt;
      dateSet.add(point.date);
    }
    if (!seen.has(key)) {
      seen.add(key);
      tickers.push({ key, name: item?.keyName || key });
    }
  }

  return { tickers: sortTickers(tickers), datesAsc: [...dateSet].sort(), matrix };
}

function mergeBranchCross(base, patch) {
  const dateSet = new Set([...(base?.datesAsc || []), ...(patch?.datesAsc || [])]);
  const branchMap = new Map((base?.branches || []).map((branch) => [branch.key, branch]));
  for (const branch of patch?.branches || []) branchMap.set(branch.key, branch);

  const matrix = { ...(base?.matrix || {}) };
  for (const key in patch?.matrix || {}) {
    matrix[key] = { ...(matrix[key] || {}), ...patch.matrix[key] };
  }

  return { branches: sortBranches([...branchMap.values()]), datesAsc: [...dateSet].sort(), matrix };
}

function mergeTickerCross(base, patch) {
  const dateSet = new Set([...(base?.datesAsc || []), ...(patch?.datesAsc || [])]);
  const tickerMap = new Map((base?.tickers || []).map((ticker) => [ticker.key, ticker]));
  for (const ticker of patch?.tickers || []) tickerMap.set(ticker.key, ticker);

  const matrix = { ...(base?.matrix || {}) };
  for (const key in patch?.matrix || {}) {
    matrix[key] = { ...(matrix[key] || {}), ...patch.matrix[key] };
  }

  return { tickers: sortTickers([...tickerMap.values()]), datesAsc: [...dateSet].sort(), matrix };
}

function hasCrossData(data) {
  return Boolean(data?.datesAsc?.length && data?.matrix && Object.keys(data.matrix).length);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function fetchBranchCross() {
  return postJson(BRANCH_CROSS_API, { SMDTBranchCrossRequest: { account: ACCOUNT } });
}

function fetchTickerCross() {
  return postJson(TICKER_CROSS_API, { SMDTTickerCrossRequest: { account: ACCOUNT } });
}

function validateBranchCross(json) {
  const reply = json?.SMDTBranchCrossReply;
  const code = reply?.codeReply?.codeID;
  if (code && code !== "S0000") throw new Error(`API ${code}`);
  if (!Array.isArray(reply?.SMDTDatas)) throw new Error("API response missing SMDTDatas");
}

function validateTickerCross(json) {
  const reply = json?.SMDTTickerCrossReply;
  const code = reply?.codeReply?.codeID;
  if (code && code !== "S0000") throw new Error(`API ${code}`);
  if (!Array.isArray(reply?.SMDTDatas)) throw new Error("API response missing SMDTDatas");
}

function useCrossData({ cacheKey, initialState, fetcher, normalize, validate, merge }) {
  const inFlightRef = useRef(null);
  const cached = readCache(cacheKey);
  const [state, setState] = useState(() => cached?.state || initialState);
  const [status, setStatus] = useState(() => (cached?.state ? "ready" : "loading"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => (cached?.updatedAt ? new Date(cached.updatedAt) : null));

  const fetchSnapshot = useCallback(async ({ force = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      setStatus((current) => (current === "ready" ? "ready" : "loading"));
      try {
        const json = await fetcher();
        validate(json);
        const normalized = normalize(json);
        const now = new Date();
        setState(normalized);
        setUpdatedAt(now);
        setStatus("ready");
        setError(null);
        writeCache(cacheKey, { state: normalized, updatedAt: now.toISOString() });
      } catch (err) {
        const fallback = readCache(cacheKey);
        if (fallback?.state) {
          setStatus("ready");
          setError(null);
        } else {
          setStatus("error");
          setError(err?.message || "Lỗi tải dữ liệu");
        }
      } finally {
        if (inFlightRef.current === request) inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [cacheKey, fetcher, normalize, validate]);

  useEffect(() => {
    fetchSnapshot();
    // Fetch lại snapshot khi socket realtime reconnect để bù dữ liệu hụt lúc mất kết nối.
    const refresh = () => fetchSnapshot();
    window.addEventListener(REALTIME_RECONNECT_EVENT, refresh);
    return () => window.removeEventListener(REALTIME_RECONNECT_EVENT, refresh);
  }, [fetchSnapshot]);

  const applyTick = useCallback((payload) => {
    const normalized = normalize(payload);
    if (!hasCrossData(normalized)) return;

    const now = new Date();
    setState((prev) => {
      const nextState = merge(prev, normalized);
      writeCache(cacheKey, { state: nextState, updatedAt: now.toISOString() });
      return nextState;
    });
    setUpdatedAt(now);
    setStatus("ready");
    setError(null);
  }, [cacheKey, merge, normalize]);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }), applyTick };
}

export function useSMDTBranchCross() {
  return useCrossData({
    cacheKey: BRANCH_CACHE_KEY,
    initialState: { branches: [], datesAsc: [], matrix: {} },
    fetcher: fetchBranchCross,
    normalize: normalizeBranchCross,
    validate: validateBranchCross,
    merge: mergeBranchCross,
  });
}

export function useSMDTTickerCross() {
  return useCrossData({
    cacheKey: TICKER_CACHE_KEY,
    initialState: { tickers: [], datesAsc: [], matrix: {} },
    fetcher: fetchTickerCross,
    normalize: normalizeTickerCross,
    validate: validateTickerCross,
    merge: mergeTickerCross,
  });
}

function getRealtimeUrl() {
  return resolveRealtimeUrl(import.meta.env.VITE_SMDT_CROSS_WS_URL, import.meta.env.VITE_SMDT_WS_URL);
}

function useRealtimeCrossFeed({ channel, normalize, onTick, label }) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), { autoConnect: true, transports: ["websocket"] });

    const handlePayload = (payload) => {
      if (payload?.channel && payload.channel !== channel) return;
      if (hasCrossData(normalize(payload))) cbRef.current?.(payload);
    };

    let hadConnected = false;
    socket.on("connect", () => {
      console.log(`Socket.IO (${label}) connected to namespace:`, socket.nsp);
      setConnected(true);
      socket.emit("message", { action: "subscribe", channels: [channel] });
      // Reconnect: báo các data hook fetch lại snapshot bù dữ liệu hụt lúc mất kết nối.
      if (hadConnected) emitRealtimeReconnected();
      hadConnected = true;
    });

    socket.on("message", handlePayload);
    socket.on("connect_error", (error) => console.error(`Socket.IO (${label}) connection error:`, error.message));
    socket.on("disconnect", () => setConnected(false));

    return () => socket.disconnect();
  }, [channel, label, normalize]);

  return { connected };
}

export function useRealtimeSMDTBranchCrossFeed(onTick) {
  return useRealtimeCrossFeed({
    channel: BRANCH_CHANNEL,
    normalize: normalizeBranchCross,
    onTick,
    label: "smdt branch cross",
  });
}

export function useRealtimeSMDTTickerCrossFeed(onTick) {
  return useRealtimeCrossFeed({
    channel: TICKER_CHANNEL,
    normalize: normalizeTickerCross,
    onTick,
    label: "smdt ticker cross",
  });
}
