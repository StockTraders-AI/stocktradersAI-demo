import { sendJson } from "./stockWaveHistoryCache.js";
import { getStockWaveRowForDateFromDb } from "./stockDataDb.js";

const CACHE_VERSION = 2;

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function getRawDate(row) {
  return String(row?.date || row?.tradingDate || row?.ngay || "");
}

export async function getStockWaveTickers(date) {
  const hasDate = Boolean(date);
  if (hasDate && !isValidDate(date)) {
    const error = new Error("Invalid date. Use YYYY-MM-DD.");
    error.statusCode = 400;
    throw error;
  }

  const row = await getStockWaveRowForDateFromDb(hasDate ? date : "");
  return {
    success: true,
    cacheVersion: CACHE_VERSION,
    source: "db",
    date: hasDate ? date : getRawDate(row),
    row,
    rows: row ? [row] : [],
    sourceRows: row ? [row] : [],
  };
}

export async function handleStockWaveTickers(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  const date = url.searchParams.get("date") || "";

  try {
    sendJson(res, 200, await getStockWaveTickers(date));
  } catch (error) {
    const status = error.statusCode || 502;
    console.error("Stock wave tickers DB read failed", error);
    sendJson(res, status, { success: false, error: error.message || "Cannot load stock wave tickers." });
  }
}
