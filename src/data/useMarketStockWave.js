import { useCallback, useEffect, useRef, useState } from "react";
import { pickTimeField } from "../app/dateUtils";
import { fetchDataPostWithClientCache } from "./requestCache";

const STOCK_WAVE_CURRENT_URL =
  import.meta.env.VITE_STOCK_WAVE_CURRENT_URL ||
  "/api/market/stock-wave-current";
const STOCK_WAVE_HISTORY_URL =
  import.meta.env.VITE_STOCK_WAVE_HISTORY_URL ||
  "/api/market/stock-wave-history";
const STOCK_WAVE_CURRENT_STREAM_URL = "/api/live?c=1";
const WAVE_CHANNEL = "wave";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeWaveRow(row) {
  if (!row || typeof row !== "object") return null;

  const waitbuy = toNumber(row.waitbuy ?? row.waitBuy ?? row.wait_buy ?? row.cm);
  const buy = toNumber(row.buy ?? row.mu);
  const waitsell = toNumber(row.waitsell ?? row.waitSell ?? row.wait_sell ?? row.cb);
  const sell = toNumber(row.sell ?? row.ba);
  const total = toNumber(row.total) || waitbuy + buy + waitsell + sell;
  const date = String(row.date || row.tradingDate || row.ngay || "").slice(0, 10);
  if (!date) return null;

  return {
    date,
    rawDate: date,
    time: pickTimeField(row),
    waitbuy,
    buy,
    waitsell,
    sell,
    total,
    reliability: Math.max(0, Math.min(100, toNumber(row.reliability ?? row.tc))),
    hasReliability: row.reliability !== undefined || row.tc !== undefined,
  };
}

function getWaveRows(payload) {
  const root = payload?.StockWaveRequest ?? payload;
  const waves = root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
  const rows =
    payload?.allRows ??
    waves?.waveDatas ??
    waves?.waveData ??
    waves?.rows ??
    waves?.history ??
    waves?.stockWaves?.waveDatas ??
    waves;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === "object" && (rows.date || rows.buy !== undefined)) return [rows];
  return [];
}

function getPayloadReliability(payload) {
  const root = payload?.StockWaveRequest ?? payload;
  const waves = root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
  const value = waves?.reliability ?? root?.reliability ?? payload?.reliability;
  return value === undefined || value === null ? undefined : value;
}

function normalizeWavePayload(payload) {
  const payloadReliability = getPayloadReliability(payload);
  return getWaveRows(payload)
    .map((row) =>
      normalizeWaveRow(
        row?.reliability === undefined && payloadReliability !== undefined
          ? { ...row, reliability: payloadReliability }
          : row,
      ),
    )
    .filter(Boolean)
    .sort((a, b) => String(b.rawDate).localeCompare(String(a.rawDate)));
}

function mergeWaveRows(...groups) {
  const rowMap = new Map();

  for (const rows of groups) {
    for (const row of rows || []) {
      const current = rowMap.get(row.date);
      rowMap.set(row.date, {
        ...current,
        ...row,
        reliability:
          row.hasReliability || !current?.hasReliability
            ? row.reliability
            : current.reliability,
        hasReliability: Boolean(row.hasReliability || current?.hasReliability),
      });
    }
  }

  return [...rowMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getSocketWaveData(payload) {
  if (payload?.channel && payload.channel !== WAVE_CHANNEL) return null;
  return (
    payload?.data?.data ??
    payload?.data?.payload ??
    payload?.data ??
    payload?.payload ??
    payload
  );
}

function normalizeCurrentPayload(payload) {
  const currentRows = normalizeWavePayload(payload?.data ?? payload);
  const historyRows = normalizeWavePayload(payload?.allRows ?? []);
  return {
    current: currentRows[0] || null,
    rows: mergeWaveRows(historyRows, currentRows),
  };
}

async function fetchCurrent() {
  const payload = await fetchDataPostWithClientCache(STOCK_WAVE_CURRENT_URL, {}, { force: true });
  return normalizeCurrentPayload(payload);
}

async function fetchHistory(referenceDate) {
  if (!referenceDate) return [];
  const payload = await fetchDataPostWithClientCache(STOCK_WAVE_HISTORY_URL, { before: referenceDate });
  return normalizeWavePayload(payload?.allRows ?? payload);
}

export function useMarketStockWave() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const requestSeq = useRef(0);

  const load = useCallback(async ({ background = false } = {}) => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    if (!background) setStatus((current) => (current === "ready" ? "ready" : "loading"));

    try {
      const snapshot = await fetchCurrent();
      if (requestSeq.current !== requestId) return;

      const now = new Date();
      setRows(snapshot.rows);
      setUpdatedAt(now);
      setStatus("ready");
      setError(null);

      if (snapshot.current?.date) {
        fetchHistory(snapshot.current.date)
          .then((historyRows) => {
            if (requestSeq.current !== requestId) return;
            setRows((currentRows) => mergeWaveRows(historyRows, currentRows));
            setUpdatedAt(new Date());
          })
          .catch((historyError) => {
            console.error("Load market stock wave history failed", historyError);
          });
      }
    } catch (loadError) {
      console.error("Load market stock wave current failed", loadError);
      if (requestSeq.current !== requestId) return;
      setError(loadError.message || "Lỗi tải dữ liệu dò sóng thị trường");
      setStatus((current) => (current === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    let active = true;
    load();

    const stream =
      typeof EventSource !== "undefined"
        ? new EventSource(STOCK_WAVE_CURRENT_STREAM_URL)
        : null;

    stream?.addEventListener("stock-wave-current", (event) => {
      if (!active) return;
      try {
        const payload = JSON.parse(event.data);
        const data = getSocketWaveData(payload);
        if (!data) return;

        const nextRows = normalizeWavePayload(data);
        if (!nextRows.length) return;

        setRows((currentRows) => mergeWaveRows(currentRows, nextRows));
        setUpdatedAt(new Date());
        setStatus("ready");
        setError(null);
      } catch (streamError) {
        console.error("Parse market stock wave stream failed", streamError);
      }
    });

    stream?.addEventListener("error", (streamError) => {
      if (active) console.error("Market stock wave stream failed", streamError);
    });

    return () => {
      active = false;
      requestSeq.current += 1;
      stream?.close();
    };
  }, [load]);

  return {
    rows,
    status,
    error,
    updatedAt,
    refresh: () => load({ background: false }),
  };
}
