import { useCallback, useEffect, useRef, useState } from "react";
import { CORE_BRANCHES } from "./useSMDT";

const ACCOUNT = "thao.dtt";
const BRANCH_CROSS_API = "/service/data/getSMDTBranchCross";
const TICKER_CROSS_API = "/service/data/getSMDTTickerCross";
const BRANCH_CACHE_KEY = "smdt_branch_cross_data_cache";
const TICKER_CACHE_KEY = "smdt_ticker_cross_data_cache";

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
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
  const datas = data?.SMDTBranchCrossReply?.SMDTDatas ?? [];
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
  const datas = data?.SMDTTickerCrossReply?.SMDTDatas ?? [];
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

function useCrossData({ cacheKey, initialState, fetcher, normalize, validate }) {
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
  }, [fetchSnapshot]);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }) };
}

export function useSMDTBranchCross() {
  return useCrossData({
    cacheKey: BRANCH_CACHE_KEY,
    initialState: { branches: [], datesAsc: [], matrix: {} },
    fetcher: fetchBranchCross,
    normalize: normalizeBranchCross,
    validate: validateBranchCross,
  });
}

export function useSMDTTickerCross() {
  return useCrossData({
    cacheKey: TICKER_CACHE_KEY,
    initialState: { tickers: [], datesAsc: [], matrix: {} },
    fetcher: fetchTickerCross,
    normalize: normalizeTickerCross,
    validate: validateTickerCross,
  });
}
