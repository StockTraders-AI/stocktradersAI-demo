import { useCallback, useEffect, useRef, useState } from "react";
import { readDataCache, writeDataCache } from "./cacheStorage";

const API_URL = "/api/performance";
const CACHE_KEY_PREFIX = "performance_by_branch_path";
const CACHE_SCHEMA_VERSION = 1;

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(row) {
  const ticker = String(row?.ticker || "").trim().toUpperCase();
  if (!ticker) return null;

  return {
    ticker,
    branch: row?.branch || "",
    branchPath: row?.branch_path || "",
    leadDate: row?.lead_date || null,
    leadMonth: row?.lead_month || "",
    percent: toNumber(row?.percent),
    bottomDate: row?.bottom_date || null,
    topDate: row?.top_date || null,
    bottomPrice: toNumber(row?.bottom_price),
    topPrice: toNumber(row?.top_price),
    performancePct: toNumber(row?.performance_pct),
    updatedAt: row?.updated_at || null,
  };
}

function normalize(reply) {
  const rows = Array.isArray(reply?.data) ? reply.data.map(normalizeRow).filter(Boolean) : [];
  return {
    status: reply?.status || "ok",
    filter: reply?.filter || {},
    total: Number.isFinite(Number(reply?.total)) ? Number(reply.total) : rows.length,
    rows,
  };
}

function cacheKey(branchPath, date) {
  return `${CACHE_KEY_PREFIX}:${branchPath}:${date || "latest"}`;
}

function readCache(branchPath, date) {
  if (!branchPath) return null;
  try {
    return readDataCache(cacheKey(branchPath, date), { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch {
    return null;
  }
}

function writeCache(branchPath, date, value) {
  if (!branchPath) return;
  try {
    writeDataCache(cacheKey(branchPath, date), value, { schemaVersion: CACHE_SCHEMA_VERSION });
  } catch {
    // Bỏ qua nếu trình duyệt chặn hoặc quota localStorage đầy.
  }
}

export function usePerformance(branchPath, date) {
  const requestKey = `${branchPath || ""}:${date || ""}`;
  const inFlightRef = useRef(null);
  const inFlightKeyRef = useRef("");
  const latestKeyRef = useRef(requestKey);
  const cached = readCache(branchPath, date);
  const [state, setState] = useState(() => cached?.state || { rows: [], filter: {}, total: 0 });
  const [status, setStatus] = useState(() => (branchPath ? (cached?.state ? "ready" : "loading") : "idle"));
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => (cached?.updatedAt ? new Date(cached.updatedAt) : null));
  latestKeyRef.current = requestKey;

  const fetchSnapshot = useCallback(async ({ force = false } = {}) => {
    if (!branchPath) {
      setState({ rows: [], filter: {}, total: 0 });
      setStatus("idle");
      setError(null);
      return null;
    }
    if (inFlightRef.current && inFlightKeyRef.current === requestKey && !force) return inFlightRef.current;
    const localCached = readCache(branchPath, date);
    if (!force && localCached?.state) {
      setState(localCached.state);
      setUpdatedAt(localCached.updatedAt ? new Date(localCached.updatedAt) : null);
      setStatus("ready");
      setError(null);
    } else if (!force) {
      setState({ rows: [], filter: {}, total: 0 });
    }

    const request = (async () => {
      setStatus((current) => (current === "ready" ? "ready" : "loading"));
      try {
        const params = new URLSearchParams({ branch_path: branchPath });
        if (date) params.set("date", date);
        const url = `${API_URL}?${params.toString()}`;
        const response = await fetch(force ? `${url}&_=${Date.now()}` : url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const normalized = normalize(await response.json());
        const now = new Date();
        if (latestKeyRef.current === requestKey) {
          setState(normalized);
          setUpdatedAt(now);
          setStatus("ready");
          setError(null);
        }
        writeCache(branchPath, date, { state: normalized, updatedAt: now.toISOString() });
      } catch (err) {
        const fallback = readCache(branchPath, date);
        if (fallback?.state && latestKeyRef.current === requestKey) {
          setState(fallback.state);
          setUpdatedAt(fallback.updatedAt ? new Date(fallback.updatedAt) : null);
          setStatus("ready");
          setError(null);
        } else if (latestKeyRef.current === requestKey) {
          setStatus("error");
          setError(err?.message || "Lỗi tải dữ liệu performance");
        }
      } finally {
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (inFlightRef.current === null) inFlightKeyRef.current = "";
      }
    })();

    inFlightRef.current = request;
    inFlightKeyRef.current = requestKey;
    return request;
  }, [branchPath, date, requestKey]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  return { ...state, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }) };
}
