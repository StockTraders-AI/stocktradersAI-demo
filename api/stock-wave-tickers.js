import { getStockWaveData } from "./stock-wave.js";

const REPLY_KEYS = ["StockWaveReply", "StockWaveRequest"];

function getWaveRows(payload) {
  const replyKey = REPLY_KEYS.find((key) => payload?.[key]);
  const stockWaves = replyKey ? payload[replyKey]?.stockWaves : payload?.stockWaves;
  return Array.isArray(stockWaves?.waveDatas) ? stockWaves.waveDatas : [];
}

function getRawDate(row) {
  return String(row?.date || row?.tradingDate || row?.ngay || "");
}

function findTickerRow(rows, date) {
  const sortedRows = rows
    .filter((item) => getRawDate(item))
    .sort((a, b) => getRawDate(b).localeCompare(getRawDate(a)));
  return date
    ? sortedRows.find((item) => getRawDate(item) <= date) || null
    : sortedRows[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method === "OPTIONS") return res.status(200).end();

  const date = String(req.query?.date || "");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, error: "Invalid date. Use YYYY-MM-DD." });
  }

  try {
    const sourceRows = getWaveRows(await getStockWaveData());
    const row = findTickerRow(sourceRows, date);
    return res.status(200).json({
      success: true,
      cacheVersion: 2,
      date: date || getRawDate(row),
      cachedAt: new Date().toISOString(),
      row,
      rows: row ? [row] : [],
      sourceRows,
      source: "stock-wave-cache",
    });
  } catch (error) {
    console.error("Stock wave tickers cache failed", error);
    return res.status(502).json({
      success: false,
      error: error.message || "Cannot load stock wave tickers.",
    });
  }
}
