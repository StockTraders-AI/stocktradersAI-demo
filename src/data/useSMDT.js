import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { resolveRealtimeUrl } from "./realtimeUrl";

/* ───────────────────────────────────────────────────────────────────────
 * useSMDT — nguồn dữ liệu "Sức mạnh dòng tiền ngành"
 *
 * - Tải snapshot ban đầu từ API getSMDTBranch (POST).
 * - Chuẩn hoá thành cấu trúc dễ render cho bảng (ngành × ngày).
 * - Sẵn sàng cho realtime Kafka: dùng `applyTick()` để merge dữ liệu mới
 *   (date, keyName, smdt) vào state, hoặc bật `useRealtimeFeed` (Socket.IO)
 *   trỏ tới Realtime Core.
 * ─────────────────────────────────────────────────────────────────────── */

const API_URL = "/api/smdt?limit=500";
const DEFAULT_REFRESH_MS = 15_000;

function getRefreshMs() {
  const configured = Number(import.meta.env.VITE_SMDT_REFRESH_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_MS;
}

/** keyName -> nhãn hiển thị ngắn gọn cho 6 ngành "Chủ lực". */
export const CORE_BRANCHES = [
  { key: "Ngân hàng", label: "Ngân hàng" },
  { key: "Chứng khoán", label: "Chứng khoán" },
  { key: "BĐS Dân cư", label: "Bất động sản" },
  { key: "Thép", label: "Thép" },
  { key: "Xây dựng", label: "Xây dựng" },
  { key: "Sản xuất và Khai thác dầu khí", label: "Dầu khí" },
];

const CORE_KEYS = new Set(CORE_BRANCHES.map((b) => b.key));

function getBranchLabel(keyName) {
  return CORE_BRANCHES.find((c) => c.key === keyName)?.label || keyName;
}

function sortBranches(branches) {
  return branches.sort((a, b) => {
    if (a.isCore && b.isCore)
      return CORE_BRANCHES.findIndex((c) => c.key === a.key) - CORE_BRANCHES.findIndex((c) => c.key === b.key);
    if (a.isCore) return -1;
    if (b.isCore) return 1;
    return a.label.localeCompare(b.label, "vi");
  });
}

/** Chuẩn hoá payload API -> { branches, datesAsc, matrix }. */
function normalize(reply) {
  const datas = reply?.SMDTBranchReply?.SMDTDatas ?? [];

  // Tập hợp toàn bộ ngày (tăng dần) để làm trục thời gian chung.
  const dateSet = new Set();
  for (const b of datas) for (const p of b.smdts) dateSet.add(p.date);
  const datesAsc = [...dateSet].sort();

  // matrix[keyName][date] = smdt
  const matrix = {};
  const branches = datas.map((b) => {
    const row = {};
    for (const p of b.smdts) row[p.date] = p.smdt;
    matrix[b.keyName] = row;
    return {
      key: b.keyName,
      label: getBranchLabel(b.keyName),
      isCore: CORE_KEYS.has(b.keyName),
    };
  });

  // Đưa các ngành chủ lực lên đầu theo thứ tự khai báo.
  sortBranches(branches);

  return { branches, datesAsc, matrix };
}

/** Khoá ô (ngành × ngày) cho map theo dõi giá trị realtime. */
function cellKey(keyName, date) {
  return `${keyName}\u0000${date}`;
}

/**
 * Phủ các tick realtime "còn mới hơn snapshot" lên trên dữ liệu snapshot vừa fetch.
 *
 * - `touchedMap`: Map(cellKey -> { smdt, at }) ghi lại mọi ô đã cập nhật qua realtime.
 * - `sinceMs`: thời điểm bắt đầu fetch snapshot. Tick cũ hơn mốc này coi như đã nằm
 *   trong snapshot → prune đi; tick mới hơn (đến trong/sau khi fetch) thì thắng snapshot.
 *
 * Nhờ vậy poll dự phòng không bao giờ ghi đè dữ liệu realtime mới hơn.
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

    matrix[keyName] = { ...(matrix[keyName] || {}), [date]: v.smdt };
    dateSet.add(date);
    if (!branchKeys.has(keyName)) {
      branchKeys.add(keyName);
      branches = [...branches, { key: keyName, label: getBranchLabel(keyName), isCore: CORE_KEYS.has(keyName) }];
    }
    changed = true;
  }

  if (!changed) return normalized;
  const datesAsc = [...dateSet].sort();
  if (branches !== normalized.branches) branches = sortBranches([...branches]);
  return { branches, datesAsc, matrix };
}

function toRealtimeTick(item) {
  const keyName = item?.keyName;
  const date = item?.date;
  const rawSmdt = item?.smdt;
  const smdt = typeof rawSmdt === "number" ? rawSmdt : Number(rawSmdt);

  if (!keyName || !date || rawSmdt == null || !Number.isFinite(smdt)) return null;
  return { keyName, date, smdt };
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

  const data = payload?.channel === "smdt-branch" && payload?.data ? payload.data : payload;
  const branchDatas = data?.SMDTBranchReply?.SMDTDatas ?? data?.SMDTDatas;
  if (Array.isArray(branchDatas)) {
    return branchDatas.flatMap(extractRealtimeTicks);
  }

  if (Array.isArray(data?.smdts) && data?.keyName) {
    return data.smdts.map((point) => toRealtimeTick({ ...point, keyName: data.keyName })).filter(Boolean);
  }

  const tick = toRealtimeTick(data);
  return tick ? [tick] : [];
}

const CACHE_KEY = "smdt_data_cache";
let globalCache = null; // RAM Cache to keep data alive across hook remounts

function getCachedData() {
  if (globalCache) return globalCache;
  try {
    const serialized = localStorage.getItem(CACHE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    if (parsed && parsed.branches && parsed.datesAsc && parsed.matrix) {
      globalCache = {
        branches: parsed.branches,
        datesAsc: parsed.datesAsc,
        matrix: parsed.matrix,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
      };
      return globalCache;
    }
  } catch (e) {
    console.warn("Failed to load SMDT cache:", e);
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
    localStorage.setItem(CACHE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.warn("Failed to save SMDT cache:", e);
  }
}

export function useSMDT() {
  const inFlightRef = useRef(null);
  // Ô (ngành × ngày) đã cập nhật qua realtime + thời điểm, để poll dự phòng không ghi đè.
  const realtimeTouchedRef = useRef(new Map());

  const [state, setState] = useState(() => {
    const cached = getCachedData();
    if (cached) {
      return { branches: cached.branches, datesAsc: cached.datesAsc, matrix: cached.matrix };
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

  const fetchSnapshot = useCallback(async ({ background = false, force = false } = {}) => {
    if (inFlightRef.current && !force) return inFlightRef.current;

    let request;
    request = (async () => {
      if (!background) {
        setStatus((s) => (s === "ready" ? "ready" : "loading"));
      }
      const startedAt = Date.now();
      try {
        const separator = API_URL.includes("?") ? "&" : "?";
        const res = await fetch(`${API_URL}${separator}_=${startedAt}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code = json?.SMDTBranchReply?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);

        // Phủ tick realtime mới hơn snapshot lên trên để poll không ghi đè dữ liệu live.
        const normalized = overlayFreshTicks(normalize(json), realtimeTouchedRef.current, startedAt);
        const now = new Date();

        setState(normalized);
        setUpdatedAt(now);
        setStatus("ready");
        setError(null);

        // Save to global and localStorage cache
        const cacheVal = { ...normalized, updatedAt: now };
        globalCache = cacheVal;
        setCachedData(cacheVal);
      } catch (e) {
        console.error("SMDT Fetch error:", e);
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

  /** Merge dữ liệu realtime vào state (dùng cho feed Kafka/Socket.IO). */
  const applyTick = useCallback((payload) => {
    const ticks = extractRealtimeTicks(payload);
    if (ticks.length === 0) return;

    const now = new Date();
    // Ghi lại từng ô realtime + thời điểm để snapshot poll sau này không ghi đè.
    for (const { keyName, date, smdt } of ticks) {
      realtimeTouchedRef.current.set(cellKey(keyName, date), { smdt, at: now.getTime() });
    }
    setState((prev) => {
      const matrix = { ...prev.matrix };
      const dateSet = new Set(prev.datesAsc);
      const branchKeys = new Set(prev.branches.map((b) => b.key));
      let branches = prev.branches;

      for (const { keyName, date, smdt } of ticks) {
        matrix[keyName] = { ...(matrix[keyName] || {}), [date]: smdt };
        dateSet.add(date);

        if (!branchKeys.has(keyName)) {
          branchKeys.add(keyName);
          branches = [
            ...branches,
            {
              key: keyName,
              label: getBranchLabel(keyName),
              isCore: CORE_KEYS.has(keyName),
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

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }), applyTick };
}

function getRealtimeUrl() {
  return resolveRealtimeUrl(import.meta.env.VITE_SMDT_WS_URL);
}

/* ───────────────────────────────────────────────────────────────────────
 * useRealtimeFeed — cầu nối tới gateway realtime phía sau Kafka qua Socket.IO.
 *
 * Cách dùng: đặt biến môi trường VITE_SMDT_WS_URL trỏ tới Socket.IO namespace /realtime.
 * ─────────────────────────────────────────────────────────────────────── */
export function useRealtimeFeed(onTick) {
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
      console.log("Socket.IO connected to namespace:", socket.nsp);
      setConnected(true);
      // Re-subscribe trên mỗi lần (re)connect — room subscription là in-memory phía server.
      socket.emit("message", {
        action: "subscribe",
        channels: ["smdt-branch"],
      });
    });

    socket.onAny((event, ...args) => {
      if (event === "connect" || event === "disconnect" || event === "connect_error") return;
      for (const payload of args) {
        handlePayload(payload);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket.IO disconnected:", reason);
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected };
}
