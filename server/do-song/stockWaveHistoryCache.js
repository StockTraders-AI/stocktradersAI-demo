import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const STOCK_WAVE_API_URL = process.env.STOCK_WAVE_API_URL || "https://stocktraders.vn/service/data/getStockWave";
const STOCK_WAVE_ACCOUNT = process.env.STOCK_WAVE_ACCOUNT || "thao.dtt";
const HISTORY_REQUEST = { StockWaveRequest: { account: STOCK_WAVE_ACCOUNT } };
const CACHE_DIR = process.env.STOCK_WAVE_CACHE_DIR || path.join(os.tmpdir(), "stocktraders-do-song-cache");
const CACHE_FILE_PREFIX = "stock-wave-history-full";
const MARKET_TIME_ZONE = "Asia/Bangkok";
const REFRESH_SCHEDULE = [
  { id: "0915", label: "09:15", minutes: 9 * 60 + 15 },
  { id: "1000", label: "10:00", minutes: 10 * 60 },
];
let memoryCache = null;
let memoryCacheKey = "";
let pendingRequest = null;
let pendingRequestKey = "";

function getMarketNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${lookup.year}-${lookup.month}-${lookup.day}`, hour: Number(lookup.hour), minute: Number(lookup.minute) };
}

function getRefreshState(date = new Date()) {
  const marketNow = getMarketNowParts(date);
  const currentMinutes = marketNow.hour * 60 + marketNow.minute;
  let activeSlot = null;
  let nextRefresh = null;

  for (const slot of REFRESH_SCHEDULE) {
    if (currentMinutes >= slot.minutes) {
      activeSlot = slot;
    } else if (!nextRefresh) {
      nextRefresh = slot;
    }
  }

  return {
    ...marketNow,
    activeSlot,
    nextRefresh,
    cacheKey: activeSlot ? `${marketNow.date}-${activeSlot.id}` : "",
  };
}

function getDefaultCacheKey(date = new Date()) {
  const state = getRefreshState(date);
  return state.cacheKey || `${state.date}-pre0915`;
}

function getCacheFilePath(cacheKey) {
  return path.join(CACHE_DIR, `${CACHE_FILE_PREFIX}-${cacheKey}.json`);
}

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

function isValidCachePayload(payload) {
  return Boolean(payload && payload.success === true && Array.isArray(payload.allRows));
}

function withSource(payload, source, extra = {}) {
  return { ...payload, ...extra, source };
}

function setMemoryCache(payload, cacheKey = getDefaultCacheKey()) {
  memoryCache = payload;
  memoryCacheKey = cacheKey;
  return payload;
}

async function writeDailyCache(allRows, cacheKey = getDefaultCacheKey()) {
  const payload = {
    success: true,
    cacheKey,
    cachedAt: new Date().toISOString(),
    allRows: sortWaveRows(allRows),
  };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(getCacheFilePath(cacheKey), JSON.stringify(payload), "utf8");
  return setMemoryCache(payload, cacheKey);
}

async function readDailyCache(cacheKey) {
  if (!cacheKey) return null;
  try {
    const payload = JSON.parse(await readFile(getCacheFilePath(cacheKey), "utf8"));
    if (!isValidCachePayload(payload)) return null;
    return setMemoryCache({ ...payload, cacheKey: payload.cacheKey || cacheKey }, cacheKey);
  } catch {
    return null;
  }
}

async function readLatestDiskCache() {
  try {
    if (!existsSync(CACHE_DIR)) return null;
    const files = (await readdir(CACHE_DIR))
      .filter((file) => file.startsWith(`${CACHE_FILE_PREFIX}-`) && file.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of files) {
      const cacheKey = file.slice(CACHE_FILE_PREFIX.length + 1, -".json".length);
      const payload = await readDailyCache(cacheKey);
      if (payload) return payload;
    }
  } catch {
    return null;
  }
  return null;
}
function startFullHistoryRefresh(requestKey, force = false) {
  if (!force && pendingRequest && pendingRequestKey === requestKey) return pendingRequest;

  pendingRequestKey = requestKey;
  const request = fetch(STOCK_WAVE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(HISTORY_REQUEST),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Stock wave upstream failed: ${response.status}`);
      const payload = await response.json();
      return writeDailyCache(getWaveRows(payload), requestKey);
    })
    .finally(() => {
      if (pendingRequest === request && pendingRequestKey === requestKey) {
        pendingRequest = null;
        pendingRequestKey = "";
      }
    });

  pendingRequest = request;
  return request;
}

async function getFullHistory(forceRefresh = false) {
  const { date: cacheDate, cacheKey, activeSlot, nextRefresh } = getRefreshState();
  const upstreamCacheKey = cacheKey || `${cacheDate}-pre0915`;

  if (forceRefresh) {
    const payload = await startFullHistoryRefresh(upstreamCacheKey, true);
    return withSource(payload, "upstream-refresh", { refreshed: true });
  }

  if (cacheKey && memoryCache && memoryCacheKey === cacheKey) return withSource(memoryCache, "memory");

  if (cacheKey) {
    const slotDiskCache = await readDailyCache(cacheKey);
    if (slotDiskCache) return withSource(slotDiskCache, "disk");
  }

  const latestDiskCache = await readLatestDiskCache();
  if (latestDiskCache) {
    if (activeSlot) {
      startFullHistoryRefresh(upstreamCacheKey).catch((error) => {
        console.warn("Stock wave history background refresh failed", error);
      });
      return withSource(latestDiskCache, "stale-disk-refreshing", {
        stale: true,
        refreshing: true,
        targetCacheKey: upstreamCacheKey,
      });
    }

    return withSource(latestDiskCache, "stale-disk-before0915", {
      stale: true,
      nextRefreshTime: nextRefresh?.label || "09:15",
    });
  }

  try {
    const payload = await startFullHistoryRefresh(upstreamCacheKey);
    return withSource(payload, "upstream");
  } catch (error) {
    const fallbackDiskCache = await readLatestDiskCache();
    if (fallbackDiskCache) {
      return withSource(fallbackDiskCache, "stale-disk", {
        stale: true,
        warning: error?.message || "Cannot refresh stock wave history.",
      });
    }
    throw error;
  }
}
export async function getStockWaveHistory(before, forceRefresh = false) {
  if (!isValidDate(before)) {
    const error = new Error("Missing or invalid before date. Use YYYY-MM-DD.");
    error.statusCode = 400;
    throw error;
  }

  const payload = await getFullHistory(forceRefresh);
  return {
    ...payload,
    before,
    rows: selectPreviousSessions(payload.allRows, before),
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
  const refreshParam = String(url.searchParams.get("refresh") || url.searchParams.get("force") || "").toLowerCase();
  const forceRefresh = refreshParam === "1" || refreshParam === "true" || refreshParam === "yes";

  try {
    sendJson(res, 200, await getStockWaveHistory(before, forceRefresh));
  } catch (error) {
    const status = error.statusCode || 502;
    console.error("Stock wave history cache failed", error);
    sendJson(res, status, { success: false, error: error.message || "Cannot load stock wave history." });
  }
}
