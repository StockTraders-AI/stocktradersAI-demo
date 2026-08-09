import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import { sendJson } from "./stockWaveHistoryCache.js";

const REALTIME_URL = process.env.REALTIME_WAVE_URL || process.env.REALTIME_URL || "http://112.213.91.235:3005/realtime";
const CACHE_DIR = process.env.STOCK_NOTI_CACHE_DIR || path.join(os.tmpdir(), "stocktraders-do-song-cache");
const CACHE_PATH = path.join(CACHE_DIR, "stock-noti.json");
const STOCK_NOTI_CHANNEL = "stock-noti";
const STOCK_NOTI_API_URL = process.env.STOCK_NOTI_API_URL || "https://stocktraders.vn/service/data/getStockNoti";
const STOCK_NOTI_ACCOUNT = process.env.STOCK_NOTI_ACCOUNT || "thao.dtt";
const CACHE_SCHEMA_VERSION = 3;
const MAX_ROWS_PER_DATE = 500;

let memoryStore = null;
let socketStarted = false;
const stockNotiClients = new Set();

function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createStore() {
  return {
    success: true,
    schemaVersion: CACHE_SCHEMA_VERSION,
    latestDate: "",
    updatedAt: "",
    byDate: {},
  };
}

function normalizeStore(payload) {
  if (payload?.schemaVersion !== CACHE_SCHEMA_VERSION || !payload?.byDate || typeof payload.byDate !== "object") {
    return createStore();
  }

  return {
    success: true,
    schemaVersion: CACHE_SCHEMA_VERSION,
    latestDate: normalizeText(payload.latestDate),
    updatedAt: normalizeText(payload.updatedAt),
    byDate: payload.byDate,
  };
}

function getPayloadData(payload) {
  return payload?.data?.data ?? payload?.data?.payload ?? payload?.data ?? payload?.payload ?? payload;
}

function getPayloadChannel(payload) {
  return String(payload?.channel || payload?.data?.channel || "");
}

function getRawRows(payload) {
  const data = getPayloadData(payload);
  const reply = data?.StockNotiReply || data?.data?.StockNotiReply || data;
  if (Array.isArray(reply?.stockNotifications)) return reply.stockNotifications;
  if (Array.isArray(reply?.rows)) return reply.rows;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && (data.content || data.title || data.date)) return [data];
  return [];
}

function getRowDateKey(row, fallbackDate = toLocalDateKey()) {
  const text = normalizeText(row?.date);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || fallbackDate;
}

function normalizeStockNotiPayload(payload) {
  const rows = getRawRows(payload)
    .map((row) => ({
      content: normalizeText(row?.content),
      date: normalizeText(row?.date),
      title: normalizeText(row?.title),
      type: normalizeText(row?.type),
    }))
    .filter((row) => row.content)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return rows;
}

async function readStore() {
  if (memoryStore) return memoryStore;

  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    memoryStore = normalizeStore(JSON.parse(raw));
  } catch {
    memoryStore = createStore();
  }

  return memoryStore;
}

async function writeStore(store) {
  memoryStore = store;
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(store), "utf8");
}

function mergeRows(existingRows, incomingRows) {
  const byId = new Map();
  [...incomingRows, ...existingRows].forEach((row) => {
    const id = `${row.date}|${row.title}|${row.type}|${row.content}`;
    if (!byId.has(id)) byId.set(id, row);
  });
  return [...byId.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_ROWS_PER_DATE);
}

async function cacheStockNotiRows(dateKey, rows, source) {
  if (!rows.length) return null;

  const store = await readStore();
  const existing = store.byDate[dateKey]?.rows || [];
  store.byDate[dateKey] = {
    success: true,
    schemaVersion: CACHE_SCHEMA_VERSION,
    requestedDate: dateKey,
    sourceDate: dateKey,
    cachedAt: new Date().toISOString(),
    source,
    rows: mergeRows(existing, rows),
  };
  store.latestDate = [store.latestDate, dateKey].filter(Boolean).sort().pop() || dateKey;
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  const cached = store.byDate[dateKey];
  broadcastStockNoti(cached);
  return cached;
}

async function cacheSocketNotifications(payload) {
  const rows = normalizeStockNotiPayload(payload);
  if (!rows.length) return;

  const byDate = new Map();
  rows.forEach((row) => {
    const dateKey = getRowDateKey(row);
    byDate.set(dateKey, [...(byDate.get(dateKey) || []), row]);
  });

  for (const [dateKey, dateRows] of byDate) {
    await cacheStockNotiRows(dateKey, dateRows, "socket");
  }
}

async function fetchStockNotiFromApi(dateKey, account = STOCK_NOTI_ACCOUNT) {
  const response = await fetch(STOCK_NOTI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ StockNotiRequest: { account, date: dateKey } }),
  });

  if (!response.ok) {
    throw new Error(`Stock notification API failed: ${response.status}`);
  }

  return response.json();
}

async function cacheApiNotifications(dateKey, payload) {
  const rows = normalizeStockNotiPayload(payload)
    .filter((row) => getRowDateKey(row, dateKey) === dateKey);
  return cacheStockNotiRows(dateKey, rows, "api");
}

function filterRowsForDate(rows, dateKey) {
  return Array.isArray(rows)
    ? rows.filter((row) => getRowDateKey(row, dateKey) === dateKey)
    : [];
}

function findFallbackPayload(store, dateKey) {
  const rows = Object.entries(store.byDate)
    .map(([key, payload]) => [key, payload, filterRowsForDate(payload?.rows, key)])
    .filter(([key, , dateRows]) => key <= dateKey && dateRows.length)
    .sort(([a], [b]) => b.localeCompare(a));
  const fallback = rows[0];
  return fallback
    ? { ...fallback[1], rows:fallback[2] }
    : null;
}

function responseForDate(store, dateKey) {
  const exact = store.byDate[dateKey];
  const exactRows = filterRowsForDate(exact?.rows, dateKey);
  if (exactRows.length) return { ...exact, rows:exactRows };

  const fallback = findFallbackPayload(store, dateKey);
  if (fallback) {
    return {
      ...fallback,
      requestedDate: dateKey,
      stale: true,
      emptyForDate: dateKey,
    };
  }

  return {
    success: true,
    schemaVersion: CACHE_SCHEMA_VERSION,
    requestedDate: dateKey,
    sourceDate: dateKey,
    source: "socket-cache",
    rows: [],
  };
}

function writeStockNotiEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastStockNoti(payload) {
  for (const res of stockNotiClients) {
    try {
      writeStockNotiEvent(res, "stock-noti", payload);
    } catch {
      stockNotiClients.delete(res);
    }
  }
}

function handleStockNotiStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  writeStockNotiEvent(res, "ready", { success: true, channel: STOCK_NOTI_CHANNEL });
  stockNotiClients.add(res);
  req.on("close", () => {
    stockNotiClients.delete(res);
  });
}


export function startStockNotiSocket() {
  if (socketStarted) return;
  socketStarted = true;

  const socket = io(REALTIME_URL, {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    socket.emit("message", {
      action: "subscribe",
      channels: [STOCK_NOTI_CHANNEL],
    });
  });

  const handleSocketPayload = (payload) => {
    const channel = getPayloadChannel(payload);
    if (channel && channel !== STOCK_NOTI_CHANNEL) return;
    cacheSocketNotifications(payload).catch((error) => {
      console.error("Write stock notification socket cache failed", error);
    });
  };

  socket.on("message", handleSocketPayload);
  socket.on(STOCK_NOTI_CHANNEL, (payload) => {
    handleSocketPayload({ channel: STOCK_NOTI_CHANNEL, data: payload });
  });

  socket.on("connect_error", (error) => {
    console.error("Stock notification socket failed", error.message);
  });
}

export async function handleStockNoti(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/stock-noti/stream") {
    handleStockNotiStream(req, res);
    return true;
  }

  if (req.method !== "GET" || url.pathname !== "/api/stock-noti") return false;

  const requestedDate = url.searchParams.get("date") || toLocalDateKey();
  const dateKey = isDateKey(requestedDate) ? requestedDate : toLocalDateKey();

  try {
    let store = await readStore();
    const exact = store.byDate[dateKey];
    if (exact?.rows?.length) {
      sendJson(res, 200, exact);
      return true;
    }

    try {
      const account = normalizeText(url.searchParams.get("account")) || STOCK_NOTI_ACCOUNT;
      const payload = await fetchStockNotiFromApi(dateKey, account);
      await cacheApiNotifications(dateKey, payload);
    } catch (error) {
      console.error("Fetch stock notification API failed", error.message || error);
    }

    store = await readStore();
    sendJson(res, 200, responseForDate(store, dateKey));
  } catch (error) {
    console.error("Stock notification cache failed", error);
    sendJson(res, 502, { success: false, error: error.message || "Cannot load stock notification cache." });
  }

  return true;
}
