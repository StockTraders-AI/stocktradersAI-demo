import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sendJson } from "./stockWaveHistoryCache.js";

const STOCK_WAVE_API_URL = process.env.STOCK_WAVE_API_URL || "https://stocktraders.vn/service/data/getStockWave";
const STOCK_WAVE_ACCOUNT = process.env.STOCK_WAVE_ACCOUNT || "thao.dtt";
const TICKERS_REQUEST = { StockWaveRequest: { account: STOCK_WAVE_ACCOUNT } };
const CACHE_DIR = process.env.STOCK_WAVE_CACHE_DIR || path.join(os.tmpdir(), "stocktraders-do-song-cache");
const CACHE_VERSION = 2;
const TICKERS_CACHE_PATH = path.join(CACHE_DIR, "tickers-latest.json");
const memoryCache = new Map();
const pendingRequests = new Map();

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
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

function findTickerRow(rows, date) {
  const sortedRows = rows
    .filter((item) => getRawDate(item))
    .sort((a, b) => getRawDate(b).localeCompare(getRawDate(a)));
  return date ? sortedRows.find((item) => getRawDate(item) <= date) || null : sortedRows[0] || null;
}

function writeMemoryCache(cacheKey, date, row, sourceRows = []) {
  const payload = {
    success: true,
    cacheVersion: CACHE_VERSION,
    date,
    cachedAt: new Date().toISOString(),
    row,
    rows: row ? [row] : [],
    sourceRows,
  };
  memoryCache.set(cacheKey, payload);
  return payload;
}

async function writeDiskCache(sourceRows) {
  const payload = {
    success: true,
    cacheVersion: CACHE_VERSION,
    cachedAt: new Date().toISOString(),
    rows: sourceRows,
  };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(TICKERS_CACHE_PATH, JSON.stringify(payload), "utf8");
  return payload;
}

async function readDiskCache() {
  try {
    const payload = JSON.parse(await readFile(TICKERS_CACHE_PATH, "utf8"));
    if (payload?.success !== true || payload.cacheVersion !== CACHE_VERSION || !Array.isArray(payload.rows)) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildPayloadFromRows(cacheKey, date, sourceRows, stale = false, warning = "") {
  const row = findTickerRow(sourceRows, date);
  const payload = writeMemoryCache(cacheKey, date || getRawDate(row), row, sourceRows);
  return stale ? { ...payload, stale: true, warning } : payload;
}

async function fetchTickerRows() {
  const response = await fetch(STOCK_WAVE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TICKERS_REQUEST),
  });
  if (!response.ok) throw new Error(`Stock wave tickers upstream failed: ${response.status}`);
  const payload = await response.json();
  const rows = getWaveRows(payload)
    .filter((item) => getRawDate(item))
    .sort((a, b) => getRawDate(b).localeCompare(getRawDate(a)));
  await writeDiskCache(rows);
  return rows;
}

export async function getStockWaveTickers(date) {
  const hasDate = Boolean(date);
  if (hasDate && !isValidDate(date)) {
    const error = new Error("Invalid date. Use YYYY-MM-DD.");
    error.statusCode = 400;
    throw error;
  }

  const cacheKey = hasDate ? date : `latest:${getTodayKey()}`;

  if (memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey);
    if (cached?.cacheVersion === CACHE_VERSION && cached?.row) return { ...cached, source: "memory" };
    memoryCache.delete(cacheKey);
  }

  if (!pendingRequests.has(cacheKey)) {
    const request = fetchTickerRows()
      .then((rows) => buildPayloadFromRows(cacheKey, hasDate ? date : "", rows))
      .finally(() => {
        pendingRequests.delete(cacheKey);
      });

    pendingRequests.set(cacheKey, request);
  }

  try {
    const payload = await pendingRequests.get(cacheKey);
    return { ...payload, source: "upstream" };
  } catch (error) {
    const diskCache = await readDiskCache();
    if (diskCache) {
      const payload = buildPayloadFromRows(cacheKey, hasDate ? date : "", diskCache.rows, true, error.message || "Cannot refresh stock wave tickers.");
      return { ...payload, source: "stale-disk" };
    }
    throw error;
  }
}

export async function handleStockWaveTickers(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  const date = url.searchParams.get("date") || "";

  try {
    sendJson(res, 200, await getStockWaveTickers(date));
  } catch (error) {
    const status = error.statusCode || 502;
    console.error("Stock wave tickers cache failed", error);
    sendJson(res, status, { success: false, error: error.message || "Cannot load stock wave tickers." });
  }
}
