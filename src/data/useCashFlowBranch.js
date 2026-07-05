import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { readDataCache, writeDataCache } from "./cacheStorage";
import { resolveRealtimeUrl } from "./realtimeUrl";

/* ───────────────────────────────────────────────────────────────────────
 * useCashFlowBranch — nguồn dữ liệu "Dòng tiền ngành"
 *
 * - Tải snapshot ban đầu từ API getCashFlowBranch (POST) qua proxy /api/cashflow-branch.
 * - Mỗi phiên (ngày) trả về danh sách trạng thái dòng tiền của từng ngành:
 *     content ∈ {"Tiếp tục đổ vào", "Nhen nhóm đổ vào", "Đang thoát ra", "Tiếp tục thoát ra"}
 * - Chuẩn hoá thành lưới (ngành × ngày) → content, dễ render bảng tín hiệu.
 * - Realtime giống SMDT ngành: bật `useRealtimeCashFlowFeed` (Socket.IO) trỏ tới
 *   Realtime Core, hoặc gọi `applyTick()` để merge tick mới (date, keyName, content).
 * ─────────────────────────────────────────────────────────────────────── */

const API_BASE_URL = "/api/cashflow-branch";
const INITIAL_LIMIT = 500;
const FULL_LIMIT = "full";
const DEFAULT_REFRESH_MS = 15_000;

function getRefreshMs() {
  const configured = Number(import.meta.env.VITE_CASHFLOW_REFRESH_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_MS;
}

/** Tên ngành (keyName từ API) -> nhãn hiển thị ngắn gọn cho 6 ngành "Chủ lực". */
export const CORE_BRANCHES = [
  { key: "Ngân hàng thương mại truyền thống", label: "Ngân hàng" },
  { key: "Môi giới chứng khoán", label: "Chứng khoán" },
  { key: "Bất động sản dân cư", label: "BĐS dân cư", aliases: ["BĐS Dân cư", "BĐS dân cư", "Bất động sản Dân cư"] },
  { key: "Sóng ngành Vin", label: "Sóng Vin" },
  { key: "Xây dựng", label: "Xây dựng" },
  { key: "Sản xuất, chế biến thép", label: "Thép" },
];

const CORE_KEY_MAP = new Map(
  CORE_BRANCHES.flatMap((b) => [b.key, ...(b.aliases || [])].map((key) => [key, b]))
);

function normalizeKey(keyName) {
  return String(keyName || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

/** content (text từ API) -> loại tín hiệu si/sn/so/st (xem sigStyle). */
export const CONTENT_TO_SIG = {
  "Tiếp tục đổ vào": "si",
  "Nhen nhóm đổ vào": "sn",
  "Đang thoát ra": "so",
  "Tiếp tục thoát ra": "st",
};

export function contentToSig(content) {
  return content ? CONTENT_TO_SIG[content] || null : null;
}

function getBranchLabel(keyName) {
  const key = normalizeKey(keyName);
  return CORE_KEY_MAP.get(key)?.label || keyName;
}

function isCoreBranch(keyName) {
  return CORE_KEY_MAP.has(normalizeKey(keyName));
}

function coreOrderIndex(keyName) {
  const canonical = CORE_KEY_MAP.get(normalizeKey(keyName))?.key || normalizeKey(keyName);
  return CORE_BRANCHES.findIndex((c) => c.key === canonical);
}

function sortBranches(branches) {
  return branches.sort((a, b) => {
    if (a.isCore && b.isCore)
      return coreOrderIndex(a.key) - coreOrderIndex(b.key);
    if (a.isCore) return -1;
    if (b.isCore) return 1;
    return a.label.localeCompare(b.label, "vi");
  });
}

function applyLimitParam(params, limit) {
  if (limit === FULL_LIMIT) {
    params.set("limit", FULL_LIMIT);
  } else if (Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(limit));
  }
}

function hydrateBranches(branches = []) {
  const hydrated = branches.map((branch) => ({
    ...branch,
    label: getBranchLabel(branch.key),
    isCore: isCoreBranch(branch.key),
  }));
  return sortBranches(hydrated);
}

/** Chuẩn hoá payload API -> { branches, datesAsc, matrix }. */
function normalize(reply) {
  const buckets = reply?.CashFlowBranchReply?.cashFlowBranchs ?? [];

  // Tập hợp toàn bộ ngày (tăng dần) để làm trục thời gian chung.
  const dateSet = new Set();
  // matrix[keyName][date] = content
  const matrix = {};
  const branchKeys = new Set();
  const branches = [];

  for (const bucket of buckets) {
    const date = bucket?.date;
    if (!date) continue;
    dateSet.add(date);
    for (const item of bucket.cashFlowBranchDatas ?? []) {
      const keyName = normalizeKey(item?.name);
      const content = item?.content;
      if (!keyName || !content) continue;
      matrix[keyName] = { ...(matrix[keyName] || {}), [date]: content };
      if (!branchKeys.has(keyName)) {
        branchKeys.add(keyName);
        branches.push({ key: keyName, label: getBranchLabel(keyName), isCore: isCoreBranch(keyName) });
      }
    }
  }

  const datesAsc = [...dateSet].sort();
  sortBranches(branches);

  return { branches, datesAsc, matrix };
}

function mergeSnapshots(base, patch) {
  const dateSet = new Set([...(base?.datesAsc || []), ...(patch?.datesAsc || [])]);
  const branchMap = new Map((base?.branches || []).map((branch) => [branch.key, branch]));
  for (const branch of patch?.branches || []) branchMap.set(branch.key, branch);

  const matrix = { ...(base?.matrix || {}) };
  for (const keyName in patch?.matrix || {}) {
    matrix[keyName] = { ...(matrix[keyName] || {}), ...patch.matrix[keyName] };
  }

  return { branches: sortBranches([...branchMap.values()]), datesAsc: [...dateSet].sort(), matrix };
}

/** Khoá ô (ngành × ngày) cho map theo dõi giá trị realtime. */
function cellKey(keyName, date) {
  return `${keyName}\u0000${date}`;
}

/**
 * Phủ các tick realtime "còn mới hơn snapshot" lên trên dữ liệu snapshot vừa fetch.
 * Cùng cơ chế với useSMDT: poll dự phòng không bao giờ ghi đè dữ liệu realtime mới hơn.
 */
function overlayFreshTicks(normalized, touchedMap, sinceMs) {
  if (!touchedMap || touchedMap.size === 0) return normalized;

  const matrix = { ...normalized.matrix };
  const dateSet = new Set(normalized.datesAsc);
  const branchKeys = new Set(normalized.branches.map((b) => b.key));
  let branches = normalized.branches;
  let changed = false;

  for (const [k, v] of [...touchedMap]) {
    if (v.at < sinceMs) {
      touchedMap.delete(k); // snapshot đã mới ít nhất bằng tick này → bỏ theo dõi.
      continue;
    }
    const sep = k.indexOf("\u0000");
    const keyName = k.slice(0, sep);
    const date = k.slice(sep + 1);

    matrix[keyName] = { ...(matrix[keyName] || {}), [date]: v.content };
    dateSet.add(date);
    if (!branchKeys.has(keyName)) {
      branchKeys.add(keyName);
      branches = [...branches, { key: keyName, label: getBranchLabel(keyName), isCore: isCoreBranch(keyName) }];
    }
    changed = true;
  }

  if (!changed) return normalized;
  const datesAsc = [...dateSet].sort();
  if (branches !== normalized.branches) branches = sortBranches([...branches]);
  return { branches, datesAsc, matrix };
}

function toRealtimeTick(item) {
  const keyName = normalizeKey(item?.name ?? item?.keyName);
  const date = item?.date;
  const content = item?.content;
  if (!keyName || !date || !content) return null;
  return { keyName, date, content };
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

  const data = payload?.channel === "money-flow-branch" && payload?.data ? payload.data : payload;

  // Mảng các bucket theo ngày: { date, cashFlowBranchDatas: [{ name, content }] }.
  const buckets = data?.CashFlowBranchReply?.cashFlowBranchs ?? data?.cashFlowBranchs;
  if (Array.isArray(buckets)) {
    return buckets.flatMap((bucket) => {
      const date = bucket?.date;
      if (!date) return [];
      return (bucket.cashFlowBranchDatas ?? [])
        .map((item) => toRealtimeTick({ ...item, date }))
        .filter(Boolean);
    });
  }

  // Một bucket đơn lẻ.
  if (Array.isArray(data?.cashFlowBranchDatas) && data?.date) {
    return data.cashFlowBranchDatas
      .map((item) => toRealtimeTick({ ...item, date: data.date }))
      .filter(Boolean);
  }

  // Một tick đơn lẻ { name/keyName, date, content }.
  const tick = toRealtimeTick(data);
  return tick ? [tick] : [];
}

const CACHE_KEY = "cashflow_branch_data_cache_v2";
const CACHE_SCHEMA_VERSION = 1;
let globalCache = null; // RAM Cache to keep data alive across hook remounts

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const parsed = readDataCache(CACHE_KEY, { schemaVersion: CACHE_SCHEMA_VERSION });
    if (parsed && parsed.branches && parsed.datesAsc && parsed.matrix) {
      globalCache = {
        branches: hydrateBranches(parsed.branches),
        datesAsc: parsed.datesAsc,
        matrix: parsed.matrix,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load CashFlowBranch cache:", e);
  }
  return null;
}

function setCachedData(data) {
  try {
    const toStore = {
      branches: data.branches,
      datesAsc: data.datesAsc,
      matrix: data.matrix,
      updatedAt: data.updatedAt ? data.updatedAt.toISOString() : null,
    };
    writeDataCache(CACHE_KEY, toStore, { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch (e) {
    console.warn("Failed to save CashFlowBranch cache:", e);
  }
}

export function useCashFlowBranch() {
  const inFlightRef = useRef(null);
  // Ô (ngành × ngày) đã cập nhật qua realtime + thời điểm, để poll dự phòng không ghi đè.
  const realtimeTouchedRef = useRef(new Map());

  const [state, setState] = useState(() => {
    const cached = getCachedData();
    if (cached) {
      return { branches: hydrateBranches(cached.branches), datesAsc: cached.datesAsc, matrix: cached.matrix };
    }
    return { branches: [], datesAsc: [], matrix: {} };
  });

  const [status, setStatus] = useState(() => {
    const cached = getCachedData();
    return cached ? "ready" : "loading";
  });

  const [error, setError] = useState(null);

  const [updatedAt, setUpdatedAt] = useState(() => {
    const cached = getCachedData();
    return cached ? cached.updatedAt : null;
  });

  const fetchSnapshot = useCallback(async ({ background = false, force = false, limit = null, merge = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    let request;
    request = (async () => {
      if (!background) {
        setStatus((s) => (s === "ready" ? "ready" : "loading"));
      }
      const startedAt = Date.now();
      try {
        const params = new URLSearchParams({ _: String(startedAt) });
        applyLimitParam(params, limit);
        const res = await fetch(`${API_BASE_URL}?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = json?.CashFlowBranchReply?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);

        // Phủ tick realtime mới hơn snapshot lên trên để poll không ghi đè dữ liệu live.
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
        console.error("CashFlowBranch Fetch error:", e);
        const cached = getCachedData();
        if (cached) {
          setError(null); // Keep display clean if cached data exists
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
    let cancelled = false;
    const cached = getCachedData();
    fetchSnapshot({ background: Boolean(cached), limit: cached ? FULL_LIMIT : INITIAL_LIMIT }).then(() => {
      if (!cancelled && !cached) fetchSnapshot({ background: true, force: true, limit: FULL_LIMIT });
    });

    const refresh = () => {
      if (document.visibilityState === "visible") {
        fetchSnapshot({ background: true, limit: INITIAL_LIMIT, merge: true });
      }
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
    for (const { keyName, date, content } of ticks) {
      realtimeTouchedRef.current.set(cellKey(keyName, date), { content, at: now.getTime() });
    }
    setState((prev) => {
      const matrix = { ...prev.matrix };
      const dateSet = new Set(prev.datesAsc);
      const branchKeys = new Set(prev.branches.map((b) => b.key));
      let branches = prev.branches;

      for (const { keyName, date, content } of ticks) {
        matrix[keyName] = { ...(matrix[keyName] || {}), [date]: content };
        dateSet.add(date);

        if (!branchKeys.has(keyName)) {
          branchKeys.add(keyName);
          branches = [
            ...branches,
            {
              key: keyName,
              label: getBranchLabel(keyName),
              isCore: isCoreBranch(keyName),
            },
          ];
        }
      }

      const datesAsc = [...dateSet].sort();
      branches = branches === prev.branches ? branches : sortBranches([...branches]);
      const nextState = { ...prev, matrix, datesAsc };
      if (branches !== prev.branches) nextState.branches = branches;

      // Update global and localStorage cache with realtime updates
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
  return resolveRealtimeUrl(import.meta.env.VITE_CASHFLOW_WS_URL, import.meta.env.VITE_SMDT_WS_URL);
}

/* ───────────────────────────────────────────────────────────────────────
 * useRealtimeCashFlowFeed — cầu nối tới gateway realtime phía sau Kafka qua Socket.IO.
 *
 * Cách dùng: đặt VITE_CASHFLOW_WS_URL (hoặc dùng chung VITE_SMDT_WS_URL) trỏ tới
 * Socket.IO namespace /realtime; subscribe channel "money-flow-branch".
 * ─────────────────────────────────────────────────────────────────────── */
export function useRealtimeCashFlowFeed(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = getRealtimeUrl();

    const socket = io(url, {
      autoConnect: true,
    });

    const handlePayload = (payload) => {
      if (extractRealtimeTicks(payload).length > 0) {
        cbRef.current?.(payload);
      }
    };

    socket.on("connect", () => {
      console.log("Socket.IO (cashflow) connected to namespace:", socket.nsp);
      setConnected(true);
      // Re-subscribe trên mỗi lần (re)connect — room subscription là in-memory phía server.
      socket.emit("message", {
        action: "subscribe",
        channels: ["money-flow-branch"],
      });
    });

    socket.onAny((event, ...args) => {
      if (event === "connect" || event === "disconnect" || event === "connect_error") return;
      for (const payload of args) {
        handlePayload(payload);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO (cashflow) connection error:", error.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket.IO (cashflow) disconnected:", reason);
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    globalCache = null;
  });
}
