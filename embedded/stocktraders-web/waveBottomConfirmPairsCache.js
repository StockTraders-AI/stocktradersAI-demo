import { sendJson } from "./stockWaveHistoryCache.js";
import {
  getWaveBottomRowsFromDb,
  upsertWaveBottomRows,
} from "./stockDataDb.js";

const WAVE_BOTTOM_PAIRS_URL = process.env.WAVE_BOTTOM_PAIRS_URL || "https://stocktradersai.vn/service/data/getWaveBottomConfirmPairs";
const VNINDEX_TRADE_URL = process.env.VNINDEX_TRADE_URL || "https://stocktradersai.vn/service/data/getTotalTrade?ticker=VNINDEX";
const VNINDEX_TRADE_REAL_URL = process.env.VNINDEX_TRADE_REAL_URL || "https://stocktraders.vn/service/data/getTotalTradeReal";
const CACHE_VERSION = 24;
const UPSTREAM_TIMEOUT_MS = Number(process.env.WAVE_BOTTOM_UPSTREAM_TIMEOUT_MS || 600000);
const ZIGZAG_THRESHOLD = 0.052;
const MARKET_TIME_ZONE = "Asia/Bangkok";
const REFRESH_SCHEDULE = [
  { id: "0915", label: "09:15", minutes: 9 * 60 + 15 },
  { id: "1000", label: "10:00", minutes: 10 * 60 },
];
const PAIRS_REQUEST = { count: 4 };
const VNINDEX_TRADE_REAL_REQUEST = { TotalTradeRealRequest: { account: "stocktraders2013" } };
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
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

function getMarketDateKey(date = new Date()) {
  return getMarketNowParts(date).date;
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

function getCacheKey(date = new Date()) {
  const state = getRefreshState(date);
  return state.cacheKey || `${state.date}-pre0915`;
}

function withSource(payload, source, extra = {}) {
  return { ...payload, ...extra, source };
}

function getPairs(payload) {
  const pairs = payload?.pairs ?? payload?.data?.pairs ?? payload;
  return Array.isArray(pairs) ? pairs : [];
}

function normalizeDateKey(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const date = new Date(text.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getPayloadDate(payload) {
  return normalizeDateKey(
    payload?.date ??
    payload?.tradingDate ??
    payload?.ngay ??
    payload?.tradeDate ??
    payload?.sourceDate ??
    payload?.requestedDate ??
    payload?.data?.date ??
    payload?.data?.tradingDate ??
    payload?.data?.ngay ??
    payload?.data?.tradeDate
  );
}

function getRowDate(row, fallbackDate = "") {
  return normalizeDateKey(
    row?.date ??
    row?.tradingDate ??
    row?.ngay ??
    row?.tradeDate ??
    row?.time ??
    row?.datetime ??
    row?.createdAt ??
    fallbackDate
  );
}

function hasTradeFields(row) {
  return Boolean(
    row &&
    typeof row === "object" &&
    (
      row.high !== undefined ||
      row.High !== undefined ||
      row.h !== undefined ||
      row.low !== undefined ||
      row.Low !== undefined ||
      row.l !== undefined ||
      row.close !== undefined ||
      row.Close !== undefined ||
      row.c !== undefined ||
      row.price !== undefined ||
      row.lastPrice !== undefined ||
      row.matchPrice !== undefined ||
      row.gia !== undefined
    )
  );
}

function findTradeRows(value, depth = 0) {
  if (!value || depth > 4) return [];
  if (Array.isArray(value)) {
    if (value.some(hasTradeFields)) return value;
    for (const item of value) {
      const nested = findTradeRows(item, depth + 1);
      if (nested.length) return nested;
    }
    return [];
  }
  if (typeof value !== "object") return [];

  const direct = [
    value.rows,
    value.data,
    value.data?.rows,
    value.items,
    value.list,
    value.stockTrades,
    value.stockTotalReals,
    value.totalTrades,
    value.tradeRows,
    value.TotalTradeReply,
    value.TotalTradeRealReply,
    value.TotalTradeRealReply?.rows,
    value.TotalTradeRealReply?.stockTrades,
    value.TotalTradeRealReply?.stockTotalReals,
    value.TotalTradeRealReply?.totalTrades,
  ];

  for (const candidate of direct) {
    const rows = findTradeRows(candidate, depth + 1);
    if (rows.length) return rows;
  }

  if (hasTradeFields(value)) return [value];

  for (const candidate of Object.values(value)) {
    const rows = findTradeRows(candidate, depth + 1);
    if (rows.length) return rows;
  }

  return [];
}

function getTradeRows(payload) {
  return findTradeRows(payload);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function withTimeout(options = {}) {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return options;
  return { ...options, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) };
}

function setMemoryCache(payload, cacheKey = getCacheKey()) {
  memoryCache = payload;
  memoryCacheKey = cacheKey;
  return payload;
}

async function writeDailyCache(rows, cacheKey = getCacheKey()) {
  const payload = {
    success: true,
    cacheVersion: CACHE_VERSION,
    cacheKey,
    cachedAt: new Date().toISOString(),
    rows,
  };
  await upsertWaveBottomRows(rows, { cacheKey, source: "api", calcVersion: String(CACHE_VERSION) });
  return setMemoryCache(payload, cacheKey);
}

async function readDailyCache(cacheKey) {
  if (!cacheKey) return null;
  const rows = await getWaveBottomRowsFromDb(cacheKey);
  if (!rows?.length) return null;
  return setMemoryCache({
    success: true,
    cacheVersion: CACHE_VERSION,
    cacheKey,
    cachedAt: new Date().toISOString(),
    rows,
  }, cacheKey);
}

async function readLatestDiskCache() {
  const rows = await getWaveBottomRowsFromDb();
  if (!rows?.length) return null;
  return setMemoryCache({
    success: true,
    cacheVersion: CACHE_VERSION,
    cacheKey: getCacheKey(),
    cachedAt: new Date().toISOString(),
    rows,
  }, getCacheKey());
}

async function readLatestLegacyDiskCache() {
  return null;
}

function normalizeTradeRows(payload) {
  const payloadDate = getPayloadDate(payload);
  return getTradeRows(payload)
    .filter((row) => {
      const ticker = String(row?.ticker || row?.symbol || row?.code || "").toUpperCase();
      return !ticker || ticker === "VNINDEX";
    })
    .map((row) => {
      const fallbackPrice = toNumber(
        row?.close ?? row?.Close ?? row?.c ?? row?.price ?? row?.lastPrice ?? row?.matchPrice ?? row?.gia
      );
      return {
        date: getRowDate(row, payloadDate) || getMarketDateKey(),
        high: toNumber(row?.high ?? row?.High ?? row?.h) || fallbackPrice,
        low: toNumber(row?.low ?? row?.Low ?? row?.l) || fallbackPrice,
      };
    })
    .filter((row) => row.date && row.high > 0 && row.low > 0)
    .sort((a, b) => rowDateValue(a.date) - rowDateValue(b.date))
    .map((row, index) => ({ ...row, index }));
}

function mergeTradeRows(...payloads) {
  const rowsByDate = new Map();
  payloads.flatMap(normalizeTradeRows).forEach((row) => {
    const existing = rowsByDate.get(row.date);
    rowsByDate.set(row.date, existing ? {
      ...existing,
      high: Math.max(existing.high, row.high),
      low: Math.min(existing.low, row.low),
    } : row);
  });

  return Array.from(rowsByDate.values())
    .sort((a, b) => rowDateValue(a.date) - rowDateValue(b.date))
    .map((row, index) => ({ ...row, index }));
}

function rowDateValue(value) {
  const time = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(time) ? time : 0;
}

function buildQuoteLookup(rows) {
  const lookup = new Map();
  rows.forEach((row) => lookup.set(row.date, row));
  return lookup;
}

function buildZigzagPivots(rows, threshold = ZIGZAG_THRESHOLD) {
  if (!rows.length) return [];

  const pivots = [];
  let trend = 0;
  let low = rows[0];
  let high = rows[0];
  let candidate = rows[0];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];

    if (trend === 0) {
      if (row.low < low.low) low = row;
      if (row.high > high.high) high = row;

      if (row.high >= low.low * (1 + threshold)) {
        pivots.push({ ...low, price: low.low, type: "low" });
        trend = 1;
        candidate = row;
      } else if (row.low <= high.high * (1 - threshold)) {
        pivots.push({ ...high, price: high.high, type: "high" });
        trend = -1;
        candidate = row;
      }
      continue;
    }

    if (trend === 1) {
      if (row.high > candidate.high) candidate = row;
      if (row.low <= candidate.high * (1 - threshold)) {
        pivots.push({ ...candidate, price: candidate.high, type: "high" });
        trend = -1;
        candidate = row;
      }
      continue;
    }

    if (row.low < candidate.low) candidate = row;
    if (row.high >= candidate.low * (1 + threshold)) {
      pivots.push({ ...candidate, price: candidate.low, type: "low" });
      trend = 1;
      candidate = row;
    }
  }

  return pivots;
}

function isLowestThanPreviousSessions(row, rows, sessionCount = 5) {
  if (!row || row.index <= 0) return false;
  const start = Math.max(0, row.index - sessionCount);
  const previousRows = rows.slice(start, row.index);
  return previousRows.length > 0 && previousRows.every((previous) => row.low <= previous.low);
}

function findLowestRecentSession(rows, confirmQuote, sessionCount = 5) {
  if (!confirmQuote) return null;
  const start = Math.max(0, confirmQuote.index - sessionCount + 1);
  const recentRows = rows.slice(start, confirmQuote.index + 1);
  if (!recentRows.length) return null;
  const lowest = recentRows.reduce(
    (candidate, row) => row.low < candidate.low ? row : candidate,
    recentRows[0]
  );
  return { ...lowest, price: lowest.low, type: "low", isRecentWindowLow: true };
}

function findLowPivot(pivots, quoteByDate, rows, pair) {
  const lows = pivots.filter((pivot) => pivot.type === "low");
  const bottomDate = String(pair.confirm_wave_date || "");
  const bottomQuote = quoteByDate.get(bottomDate);
  const exactBottom = lows.find((pivot) => pivot.date === bottomDate);
  if (exactBottom) return exactBottom;

  if (isLowestThanPreviousSessions(bottomQuote, rows)) {
    return { ...bottomQuote, price: bottomQuote.low, type: "low", isTemporary: true };
  }

  if (bottomQuote?.index === rows.length - 1) {
    const recentLow = findLowestRecentSession(rows, bottomQuote);
    if (recentLow) return recentLow;
  }

  if (!lows.length) {
    if (bottomQuote) return { ...bottomQuote, price: bottomQuote.low, type: "low", isTemporary: true };
    return null;
  }

  const prepareDate = String(pair.prepare_bottom_date || "");
  const exactPrepare = lows.find((pivot) => pivot.date === prepareDate);
  if (exactPrepare) return exactPrepare;

  if (bottomQuote) {
    const previous = lows.filter((pivot) => pivot.index <= bottomQuote.index);
    if (previous.length) return previous[previous.length - 1];
    return { ...bottomQuote, price: bottomQuote.low, type: "low", isTemporary: true };
  }

  return lows[0];
}

function findNextHighPivot(pivots, bottom) {
  if (!bottom) return null;
  return pivots.find((pivot) => pivot.type === "high" && pivot.index > bottom.index) || null;
}

function findRunningHighAfterBottom(rows, bottom) {
  if (!bottom) return null;
  const thresholdHigh = bottom.low * (1 + ZIGZAG_THRESHOLD);
  const confirmedRows = rows.filter(
    (row) => row.index > bottom.index && row.high >= thresholdHigh
  );
  if (!confirmedRows.length) return null;
  const highest = confirmedRows.reduce(
    (candidate, row) => row.high > candidate.high ? row : candidate,
    confirmedRows[0]
  );
  return { ...highest, price: highest.high, type: "high", isRunningPeak: true };
}

function findNextHigh(pivots, rows, bottom) {
  return findNextHighPivot(pivots, bottom) || findRunningHighAfterBottom(rows, bottom);
}

function findLowestNearbyLow(pivots, bottom) {
  if (!bottom) return null;
  if (bottom.isTemporary) return bottom;
  const nearbyLows = pivots.filter(
    (pivot) => pivot.type === "low" && Math.abs(pivot.index - bottom.index) <= 1
  );
  if (!nearbyLows.length) return bottom;
  return nearbyLows.reduce(
    (lowest, pivot) => toNumber(pivot.price) < toNumber(lowest.price) ? pivot : lowest,
    bottom
  );
}

async function fetchPairs() {
  const response = await fetch(WAVE_BOTTOM_PAIRS_URL, withTimeout({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(PAIRS_REQUEST),
  }));
  if (!response.ok) throw new Error(`Wave bottom pairs upstream failed: ${response.status}`);
  return response.json();
}

async function fetchVnindexTrades() {
  const baseUrl = VNINDEX_TRADE_URL.split("?")[0];
  const attempts = [
    () => fetch(VNINDEX_TRADE_URL, withTimeout({ method: "POST" })),
    () => fetch(baseUrl, withTimeout({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "VNINDEX" }),
    })),
    () => fetch(baseUrl, withTimeout({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ticker: "VNINDEX" }),
    })),
  ];

  const statuses = [];
  for (const request of attempts) {
    const response = await request();
    if (response.ok) return response.json();
    statuses.push(response.status);
  }

  throw new Error(`VNINDEX trade upstream failed: ${statuses.join("/")}`);
}

async function fetchVnindexTradeReal() {
  const response = await fetch(VNINDEX_TRADE_REAL_URL, withTimeout({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VNINDEX_TRADE_REAL_REQUEST),
  }));
  if (!response.ok) throw new Error(`VNINDEX trade real upstream failed: ${response.status}`);
  return response.json();
}

function buildWaveBottomRows(pairsPayload, vnindexPayload, vnindexRealPayload = []) {
  const vnindexRows = mergeTradeRows(vnindexPayload, vnindexRealPayload);
  const quoteByDate = buildQuoteLookup(vnindexRows);
  const pivots = buildZigzagPivots(vnindexRows);
  const pairs = getPairs(pairsPayload)
    .slice()
    .sort((a, b) => rowDateValue(String(a?.confirm_wave_date || "")) - rowDateValue(String(b?.confirm_wave_date || "")));

  return pairs.map((pair) => {
    const confirmDate = String(pair.confirm_wave_date || "");
    const bottom = findLowPivot(pivots, quoteByDate, vnindexRows, pair);
    const displayBottom = findLowestNearbyLow(pivots, bottom);
    const peak = findNextHigh(pivots, vnindexRows, bottom);
    const increasePoints = bottom && peak ? peak.high - bottom.low : 0;
    const durationSessions = bottom && peak ? peak.index - bottom.index + 1 : 0;

    return {
      confirm_wave_date: confirmDate,
      prepare_bottom_date: String(pair.prepare_bottom_date || ""),
      zigzag_bottom_date: bottom?.date || "",
      zigzag_peak_date: peak?.date || "",
      vnindex: toNumber(displayBottom?.price),
      vnindex_date: displayBottom?.date || "",
      increase_points: Number(increasePoints.toFixed(2)),
      zigzag_bottom_price: toNumber(bottom?.low),
      zigzag_peak_price: toNumber(peak?.high),
      duration_sessions: durationSessions,
      reliability: toNumber(pair.reliability),
    };
  });
}

export async function buildWaveBottomRowsFromPairs(pairsPayload) {
  const [vnindexPayload, vnindexRealPayload] = await Promise.all([
    fetchVnindexTrades(),
    fetchVnindexTradeReal().catch((error) => {
      console.warn("VNINDEX trade real unavailable", error);
      return [];
    }),
  ]);
  return buildWaveBottomRows(pairsPayload, vnindexPayload, vnindexRealPayload);
}

function startWaveBottomRefresh(requestKey) {
  if (pendingRequest && pendingRequestKey === requestKey) return pendingRequest;

  pendingRequestKey = requestKey;
  pendingRequest = Promise.all([
    fetchPairs(),
    fetchVnindexTrades(),
    fetchVnindexTradeReal().catch((error) => {
      console.warn("VNINDEX trade real unavailable", error);
      return [];
    }),
  ])
    .then(([pairsPayload, vnindexPayload, vnindexRealPayload]) => writeDailyCache(
      buildWaveBottomRows(pairsPayload, vnindexPayload, vnindexRealPayload),
      requestKey,
    ))
    .finally(() => {
      if (pendingRequestKey === requestKey) {
        pendingRequest = null;
        pendingRequestKey = "";
      }
    });

  return pendingRequest;
}
export async function getWaveBottomConfirmPairs(forceRefresh = false) {
  const { date: cacheDate, cacheKey, nextRefresh } = getRefreshState();
  const upstreamCacheKey = cacheKey || `${cacheDate}-pre0915`;

  const refreshNow = async (fallbackPayload = null, fallbackSource = "stale-db", fallbackExtra = {}) => {
    try {
      const payload = await startWaveBottomRefresh(upstreamCacheKey);
      return withSource(payload, "upstream");
    } catch (error) {
      console.warn("Wave bottom confirm pairs upstream unavailable", error);
      if (fallbackPayload) {
        return withSource(fallbackPayload, fallbackSource, {
          stale: true,
          warning: error?.message || "Cannot refresh wave bottom confirm pairs.",
          ...fallbackExtra,
        });
      }
      throw error;
    }
  };

  if (forceRefresh) return refreshNow();

  if (cacheKey && memoryCache && memoryCacheKey === cacheKey && memoryCache.cacheVersion === CACHE_VERSION && Array.isArray(memoryCache.rows)) {
    return withSource(memoryCache, "memory");
  }

  if (cacheKey) {
    const slotDbCache = await readDailyCache(cacheKey);
    if (slotDbCache) return withSource(slotDbCache, "db");
  }

  const latestDbCache = await readLatestDiskCache();
  if (latestDbCache) {
    return withSource(latestDbCache, "stale-db", {
      stale: true,
      nextRefreshTime: nextRefresh?.label || "09:15",
    });
  }

  const legacyDbCache = await readLatestLegacyDiskCache();
  if (legacyDbCache) {
    return withSource(legacyDbCache, "legacy-db", {
      stale: true,
      legacyCache: true,
      nextRefreshTime: nextRefresh?.label || "09:15",
    });
  }

  return {
    success: true,
    cacheVersion: CACHE_VERSION,
    cacheKey: cacheKey || upstreamCacheKey,
    cachedAt: new Date().toISOString(),
    rows: [],
    source: "db-empty",
  };
}
export async function handleWaveBottomConfirmPairs(req, res) {
  try {
    sendJson(res, 200, await getWaveBottomConfirmPairs());
  } catch (error) {
    console.error("Wave bottom confirm pairs cache failed", error);
    sendJson(res, 502, { success: false, error: error.message || "Cannot load wave bottom confirm pairs." });
  }
}
