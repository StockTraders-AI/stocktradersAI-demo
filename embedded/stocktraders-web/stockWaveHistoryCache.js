import {
  getAllStockWaveSummaryRowsFromDb,
  upsertStockWaveRows,
} from "./stockDataDb.js";

const STOCK_WAVE_API_URL = process.env.STOCK_WAVE_API_URL || "https://stocktraders.vn/service/data/getStockWave";
const STOCK_WAVE_ACCOUNT = process.env.STOCK_WAVE_ACCOUNT || "thao.dtt";
const HISTORY_REQUEST = { StockWaveRequest: { account: STOCK_WAVE_ACCOUNT } };
let summaryRowsSnapshot = null;
let summaryRowsSnapshotPromise = null;

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function getWaveRows(payload) {
  const root = payload?.StockWaveRequest ?? payload;
  const waves = root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
  const rows = waves?.waveDatas ?? waves?.waveData ?? waves?.rows ?? waves?.history ?? waves?.stockWaves?.waveDatas ?? waves;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === "object" && (rows.date || rows.buy !== undefined)) return [rows];
  return [];
}

function getRawDate(row) {
  return String(row?.date || row?.tradingDate || row?.ngay || "");
}

function sortWaveRows(rows) {
  return [...rows]
    .filter((row) => getRawDate(row))
    .sort((a, b) => getRawDate(b).localeCompare(getRawDate(a)));
}

function selectPreviousSessions(rows, before) {
  return sortWaveRows(rows)
    .filter((row) => getRawDate(row) < before)
    .slice(0, 3);
}

async function loadSummaryRowsSnapshot() {
  if (summaryRowsSnapshot) return summaryRowsSnapshot;
  if (!summaryRowsSnapshotPromise) {
    summaryRowsSnapshotPromise = getAllStockWaveSummaryRowsFromDb()
      .then((rows) => {
        summaryRowsSnapshot = sortWaveRows(rows);
        return summaryRowsSnapshot;
      })
      .finally(() => {
        summaryRowsSnapshotPromise = null;
      });
  }
  return summaryRowsSnapshotPromise;
}

export async function preloadStockWaveHistorySnapshot() {
  return loadSummaryRowsSnapshot();
}

export function invalidateStockWaveHistorySnapshot() {
  summaryRowsSnapshot = null;
}

export async function backfillStockWaveHistoryFromApi() {
  const response = await fetch(STOCK_WAVE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(HISTORY_REQUEST),
  });
  if (!response.ok) throw new Error(`Stock wave upstream failed: ${response.status}`);

  const payload = await response.json();
  const allRows = sortWaveRows(getWaveRows(payload));
  const cachedAt = new Date().toISOString();
  await upsertStockWaveRows(allRows, { cacheKey: "backfill-full", source: "api-backfill", cachedAt });
  return {
    success: true,
    source: "api-backfill",
    cachedAt,
    allRows,
  };
}

export async function getStockWaveHistory(before) {
  if (!isValidDate(before)) {
    const error = new Error("Missing or invalid before date. Use YYYY-MM-DD.");
    error.statusCode = 400;
    throw error;
  }

  const allRows = await loadSummaryRowsSnapshot();
  return {
    success: true,
    source: "db",
    before,
    allRows,
    rows: selectPreviousSessions(allRows, before),
  };
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export async function handleStockWaveHistory(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  const before = url.searchParams.get("before");

  try {
    sendJson(res, 200, await getStockWaveHistory(before));
  } catch (error) {
    const status = error.statusCode || 502;
    console.error("Stock wave history DB read failed", error);
    sendJson(res, status, { success: false, error: error.message || "Cannot load stock wave history." });
  }
}
