import { useCallback, useEffect, useRef, useState } from "react";
import { readDataCache, writeDataCache } from "./cacheStorage";

/* ───────────────────────────────────────────────────────────────────────
 * useBranchPath — bản đồ "mã cổ phiếu → ngành" lấy từ API getBranchPath.
 *
 * - API dòng tiền cổ phiếu (getCashFlowTicker) chỉ trả `type` = SÀN (HSX/HNX/UPCOM),
 *   không có tên ngành. API dòng tiền ngành (getCashFlowBranch) có tên ngành nhưng
 *   không kèm danh sách mã. getBranchPath là nguồn duy nhất ghép mã ↔ ngành:
 *     branchs: [{ name, path, tickers: [...], val }]
 * - Hook chuẩn hoá thành Map ticker→tên ngành để module Dòng tiền cổ phiếu lọc/gom
 *   theo đúng tên ngành.
 * - Thành phần ngành ít đổi trong phiên nên chỉ fetch một lần (có cache), không realtime.
 * ─────────────────────────────────────────────────────────────────────── */

const API_URL = "/api/branch-path";
const CACHE_KEY = "branch_path_data_cache";
const CACHE_SCHEMA_VERSION = 1;

let globalCache = null; // Giữ qua các lần remount hook.

function normalizeName(name) {
  return String(name || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTickers(tickers) {
  if (Array.isArray(tickers)) return tickers;
  if (typeof tickers === "string") return [tickers];
  return [];
}

/** payload API → { branches:[{name,val}], tickerToBranch: {ticker: name} }. */
function normalize(reply) {
  const branchs = reply?.BranchPathReply?.branchs ?? [];
  const tickerToBranch = {};
  const branches = [];

  for (const branch of branchs) {
    const name = normalizeName(branch?.name);
    if (!name) continue;
    branches.push({ name, val: branch?.val });
    for (const ticker of normalizeTickers(branch?.tickers)) {
      const tk = String(ticker || "").trim().toUpperCase();
      // Một mã có thể thuộc nhiều ngành; giữ ngành đầu tiên gặp.
      if (tk && !(tk in tickerToBranch)) tickerToBranch[tk] = name;
    }
  }

  return { branches, tickerToBranch };
}

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const parsed = readDataCache(CACHE_KEY, { schemaVersion: CACHE_SCHEMA_VERSION });
    if (parsed && parsed.tickerToBranch) {
      globalCache = {
        branches: parsed.branches || [],
        tickerToBranch: parsed.tickerToBranch,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load BranchPath cache:", e);
  }
  return null;
}

function setCachedData(data) {
  try {
    writeDataCache(CACHE_KEY, data, { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch (e) {
    console.warn("Failed to save BranchPath cache:", e);
  }
}

export function useBranchPath() {
  const inFlightRef = useRef(null);
  const cached = getCachedData();

  const [state, setState] = useState(() => cached || { branches: [], tickerToBranch: {} });
  const [status, setStatus] = useState(() => (cached ? "ready" : "loading"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => cached?.updatedAt || null);

  const fetchSnapshot = useCallback(async ({ force = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      try {
        const res = await fetch(`${API_URL}?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = json?.BranchPathReply?.codeReply?.codeID;
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
        console.error("BranchPath Fetch error:", e);
        if (getCachedData()) {
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
    fetchSnapshot();
  }, [fetchSnapshot]);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }) };
}
