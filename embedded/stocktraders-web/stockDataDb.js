import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.STOCKTRADERS_DB_DIR || path.join(__dirname, ".stocktraders-db");
const DB_PATH = process.env.STOCKTRADERS_DB_PATH || path.join(DB_DIR, "stocktraders.sqlite");
const DB_SCHEMA_VERSION = 1;
const MARKET_SLOT_ORDER = {
  close: 50,
  current: 45,
  "1430": 40,
  "1400": 35,
  "1000": 30,
  "0915": 20,
  pre0915: 10,
  latest: 5,
};

if (typeof DatabaseSync.prototype.transaction !== "function") {
  DatabaseSync.prototype.transaction = function transaction(callback) {
    return (...args) => {
      this.exec("BEGIN");
      try {
        const result = callback(...args);
        this.exec("COMMIT");
        return result;
      } catch (error) {
        this.exec("ROLLBACK");
        throw error;
      }
    };
  };
}
let db = null;
let initPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function jsonString(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function hashValue(value) {
  return createHash("sha256").update(jsonString(value)).digest("hex");
}

function normalizeDateKey(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return "";
}

function getRawDate(row) {
  return normalizeDateKey(row?.date || row?.tradingDate || row?.ngay || row?.tradeDate);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getWaveRows(payload) {
  const root = payload?.StockWaveRequest ?? payload;
  const waves = root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
  const rows = payload?.allRows ?? waves?.waveDatas ?? waves?.waveData ?? waves?.rows ?? waves?.history ?? waves?.stockWaves?.waveDatas ?? waves;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === "object" && (rows.date || rows.tradingDate || rows.ngay || rows.buy !== undefined)) return [rows];
  return [];
}

function getCacheDate(cacheKey) {
  return normalizeDateKey(cacheKey);
}

function getSlotFromCacheKey(cacheKey, fallback = "latest") {
  const text = String(cacheKey || "");
  const date = getCacheDate(text);
  if (date && text.startsWith(`${date}-`)) return text.slice(date.length + 1) || fallback;
  return fallback;
}

function getSlotRank(slot) {
  return MARKET_SLOT_ORDER[slot] ?? 0;
}

function rowFromWaveRecord(record) {
  return parseJson(record?.row_json, null);
}

function sortAndDedupeWaveRows(records) {
  const byDate = new Map();
  records.forEach((record) => {
    const current = byDate.get(record.trading_date);
    if (!current) {
      byDate.set(record.trading_date, record);
      return;
    }

    const recordRank = getSlotRank(record.slot);
    const currentRank = getSlotRank(current.slot);
    if (
      recordRank > currentRank ||
      (recordRank === currentRank && String(record.updated_at || "").localeCompare(String(current.updated_at || "")) > 0)
    ) {
      byDate.set(record.trading_date, record);
    }
  });

  return [...byDate.values()]
    .sort((a, b) => String(b.trading_date).localeCompare(String(a.trading_date)))
    .map(rowFromWaveRecord)
    .filter(Boolean);
}

export async function initStockDataDb() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = mkdir(DB_DIR, { recursive: true }).then(() => {
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA user_version = ${DB_SCHEMA_VERSION};

      CREATE TABLE IF NOT EXISTS raw_socket_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        payload_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        processed_at TEXT,
        process_status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS stock_wave_daily (
        trading_date TEXT NOT NULL,
        slot TEXT NOT NULL,
        cache_key TEXT,
        source TEXT NOT NULL,
        buy_count INTEGER NOT NULL DEFAULT 0,
        wait_buy_count INTEGER NOT NULL DEFAULT 0,
        sell_count INTEGER NOT NULL DEFAULT 0,
        wait_sell_count INTEGER NOT NULL DEFAULT 0,
        total_count INTEGER NOT NULL DEFAULT 0,
        reliability REAL,
        row_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (trading_date, slot)
      );

      CREATE INDEX IF NOT EXISTS idx_stock_wave_daily_date ON stock_wave_daily (trading_date DESC);
      CREATE INDEX IF NOT EXISTS idx_stock_wave_daily_cache ON stock_wave_daily (cache_key);

      CREATE TABLE IF NOT EXISTS stock_wave_current (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        trading_date TEXT,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        row_json TEXT,
        received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wave_bottom_confirm_pairs (
        cache_key TEXT NOT NULL,
        pair_key TEXT NOT NULL,
        row_index INTEGER NOT NULL DEFAULT 0,
        confirm_wave_date TEXT,
        prepare_bottom_date TEXT,
        zigzag_bottom_date TEXT,
        zigzag_peak_date TEXT,
        vnindex REAL,
        vnindex_date TEXT,
        increase_points REAL,
        zigzag_bottom_price REAL,
        zigzag_peak_price REAL,
        duration_sessions INTEGER,
        reliability REAL,
        row_json TEXT NOT NULL,
        source TEXT NOT NULL,
        calc_version TEXT NOT NULL DEFAULT 'current',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (cache_key, pair_key)
      );

      CREATE INDEX IF NOT EXISTS idx_wave_bottom_cache ON wave_bottom_confirm_pairs (cache_key);
      CREATE INDEX IF NOT EXISTS idx_wave_bottom_confirm_date ON wave_bottom_confirm_pairs (confirm_wave_date DESC);

      CREATE TABLE IF NOT EXISTS stock_notifications (
        notification_hash TEXT PRIMARY KEY,
        trading_date TEXT NOT NULL,
        published_at TEXT,
        title TEXT,
        content TEXT NOT NULL,
        type TEXT,
        source TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stock_notifications_date ON stock_notifications (trading_date DESC, published_at DESC);

      CREATE TABLE IF NOT EXISTS ingestion_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        target_date TEXT,
        slot TEXT,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recommendation_templates (
        state TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        title_template TEXT NOT NULL,
        body_template TEXT NOT NULL,
        action_template TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'system',
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (state, prompt_version)
      );

      CREATE TABLE IF NOT EXISTS recommendation_daily (
        date_key TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        raw_state TEXT,
        effective_state TEXT NOT NULL,
        pha TEXT,
        override_reason TEXT,
        cho_mua INTEGER NOT NULL DEFAULT 0,
        mua INTEGER NOT NULL DEFAULT 0,
        cho_ban INTEGER NOT NULL DEFAULT 0,
        ban INTEGER NOT NULL DEFAULT 0,
        tc REAL,
        total INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        action TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        source_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (date_key, prompt_version)
      );

      CREATE INDEX IF NOT EXISTS idx_recommendation_daily_state ON recommendation_daily (effective_state, date_key DESC);
    `);
    return db;
  });

  return initPromise;
}

export async function insertRawSocketEvent(channel, payload, processStatus = "success", errorMessage = "") {
  const database = await initStockDataDb();
  const timestamp = nowIso();
  const eventHash = hashValue({ channel, payload });
  database.prepare(`
    INSERT OR IGNORE INTO raw_socket_events (
      channel, event_hash, payload_json, received_at, processed_at, process_status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(channel, eventHash, jsonString(payload), timestamp, timestamp, processStatus, errorMessage || null);
  return eventHash;
}

export async function upsertStockWaveRows(rows, { cacheKey = "", slot = "", source = "api", cachedAt = nowIso() } = {}) {
  const database = await initStockDataDb();
  const resolvedSlot = slot || getSlotFromCacheKey(cacheKey);
  const statement = database.prepare(`
    INSERT INTO stock_wave_daily (
      trading_date, slot, cache_key, source, buy_count, wait_buy_count, sell_count, wait_sell_count,
      total_count, reliability, row_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trading_date, slot) DO UPDATE SET
      cache_key = excluded.cache_key,
      source = excluded.source,
      buy_count = excluded.buy_count,
      wait_buy_count = excluded.wait_buy_count,
      sell_count = excluded.sell_count,
      wait_sell_count = excluded.wait_sell_count,
      total_count = excluded.total_count,
      reliability = excluded.reliability,
      row_json = excluded.row_json,
      updated_at = excluded.updated_at
  `);

  let count = 0;
  const insertMany = database.transaction((items) => {
    items.forEach((row) => {
      const tradingDate = getRawDate(row);
      if (!tradingDate) return;
      const waitBuy = toNumber(row.waitbuy ?? row.waitBuy ?? row.wait_buy);
      const buy = toNumber(row.buy);
      const waitSell = toNumber(row.waitsell ?? row.waitSell ?? row.wait_sell);
      const sell = toNumber(row.sell);
      const total = toNumber(row.total) || waitBuy + buy + waitSell + sell;
      const reliability = row.reliability === undefined || row.reliability === null ? null : toNumber(row.reliability);
      statement.run(
        tradingDate,
        resolvedSlot,
        cacheKey || null,
        source,
        buy,
        waitBuy,
        sell,
        waitSell,
        total,
        reliability,
        jsonString(row),
        cachedAt,
        cachedAt,
      );
      count += 1;
    });
  });

  insertMany(Array.isArray(rows) ? rows : []);
  return count;
}

export async function upsertStockWavePayload(payload, options = {}) {
  return upsertStockWaveRows(getWaveRows(payload), options);
}

export async function upsertStockWaveCurrent(payload, { source = "socket" } = {}) {
  const database = await initStockDataDb();
  const timestamp = nowIso();
  const rows = getWaveRows(payload);
  const row = rows[0] || null;
  const tradingDate = row ? getRawDate(row) : "";

  database.prepare(`
    INSERT INTO stock_wave_current (id, trading_date, source, payload_json, row_json, received_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      trading_date = excluded.trading_date,
      source = excluded.source,
      payload_json = excluded.payload_json,
      row_json = excluded.row_json,
      received_at = excluded.received_at,
      updated_at = excluded.updated_at
  `).run(tradingDate || null, source, jsonString(payload), row ? jsonString(row) : null, timestamp, timestamp);

  if (rows.length) {
    await upsertStockWaveRows(rows, { slot: "current", source, cachedAt: timestamp });
  }
}

export async function getStockWaveCurrentFromDb() {
  const database = await initStockDataDb();
  const current = database.prepare("SELECT row_json, payload_json FROM stock_wave_current WHERE id = 1").get();
  if (current?.row_json) return rowFromWaveRecord(current);
  if (current?.payload_json) return parseJson(current.payload_json, null);

  const latest = await getLatestStockWaveRowFromDb();
  return latest || null;
}

export async function getLatestStockWaveRowFromDb() {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT * FROM stock_wave_daily
    ORDER BY trading_date DESC, updated_at DESC
    LIMIT 20
  `).all();
  return sortAndDedupeWaveRows(records)[0] || null;
}

export async function getStockWaveHistoryFromDb(before = "") {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT * FROM stock_wave_daily
    WHERE (? = '' OR trading_date < ?)
    ORDER BY trading_date DESC, updated_at DESC
  `).all(before || "", before || "");
  return sortAndDedupeWaveRows(records);
}

export async function getAllStockWaveRowsFromDb() {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT * FROM stock_wave_daily
    ORDER BY trading_date DESC, updated_at DESC
  `).all();
  return sortAndDedupeWaveRows(records);
}

export async function getAllStockWaveSummaryRowsFromDb() {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT trading_date, slot, source, buy_count, wait_buy_count, sell_count, wait_sell_count,
      total_count, reliability, updated_at
    FROM stock_wave_daily
    ORDER BY trading_date DESC, updated_at DESC
  `).all();

  const byDate = new Map();
  records.forEach((record) => {
    const current = byDate.get(record.trading_date);
    if (!current) {
      byDate.set(record.trading_date, record);
      return;
    }
    const recordRank = getSlotRank(record.slot);
    const currentRank = getSlotRank(current.slot);
    if (
      recordRank > currentRank ||
      (recordRank === currentRank && String(record.updated_at || "").localeCompare(String(current.updated_at || "")) > 0)
    ) {
      byDate.set(record.trading_date, record);
    }
  });

  return [...byDate.values()]
    .sort((a, b) => String(b.trading_date).localeCompare(String(a.trading_date)))
    .map((record) => ({
      date: record.trading_date,
      waitbuy: toNumber(record.wait_buy_count),
      buy: toNumber(record.buy_count),
      waitsell: toNumber(record.wait_sell_count),
      sell: toNumber(record.sell_count),
      total: toNumber(record.total_count),
      reliability: record.reliability === undefined || record.reliability === null ? undefined : toNumber(record.reliability),
      source: record.source,
    }));
}

export async function getStockWaveRowForDateFromDb(date = "") {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT * FROM stock_wave_daily
    WHERE (? = '' OR trading_date <= ?)
    ORDER BY trading_date DESC, updated_at DESC
    LIMIT 40
  `).all(date || "", date || "");
  return sortAndDedupeWaveRows(records)[0] || null;
}

export async function upsertWaveBottomRows(rows, { cacheKey = "latest", source = "api", calcVersion = "current" } = {}) {
  const database = await initStockDataDb();
  const timestamp = nowIso();
  const statement = database.prepare(`
    INSERT INTO wave_bottom_confirm_pairs (
      cache_key, pair_key, row_index, confirm_wave_date, prepare_bottom_date, zigzag_bottom_date,
      zigzag_peak_date, vnindex, vnindex_date, increase_points, zigzag_bottom_price,
      zigzag_peak_price, duration_sessions, reliability, row_json, source, calc_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key, pair_key) DO UPDATE SET
      row_index = excluded.row_index,
      confirm_wave_date = excluded.confirm_wave_date,
      prepare_bottom_date = excluded.prepare_bottom_date,
      zigzag_bottom_date = excluded.zigzag_bottom_date,
      zigzag_peak_date = excluded.zigzag_peak_date,
      vnindex = excluded.vnindex,
      vnindex_date = excluded.vnindex_date,
      increase_points = excluded.increase_points,
      zigzag_bottom_price = excluded.zigzag_bottom_price,
      zigzag_peak_price = excluded.zigzag_peak_price,
      duration_sessions = excluded.duration_sessions,
      reliability = excluded.reliability,
      row_json = excluded.row_json,
      source = excluded.source,
      calc_version = excluded.calc_version,
      updated_at = excluded.updated_at
  `);

  const insertMany = database.transaction((items) => {
    items.forEach((row, index) => {
      const pairKey = hashValue({
        confirm_wave_date: row?.confirm_wave_date || "",
        prepare_bottom_date: row?.prepare_bottom_date || "",
      });
      statement.run(
        cacheKey,
        pairKey,
        index,
        normalizeDateKey(row?.confirm_wave_date),
        normalizeDateKey(row?.prepare_bottom_date),
        normalizeDateKey(row?.zigzag_bottom_date),
        normalizeDateKey(row?.zigzag_peak_date),
        toNumber(row?.vnindex),
        normalizeDateKey(row?.vnindex_date),
        toNumber(row?.increase_points),
        toNumber(row?.zigzag_bottom_price),
        toNumber(row?.zigzag_peak_price),
        toNumber(row?.duration_sessions),
        row?.reliability === undefined || row?.reliability === null ? null : toNumber(row.reliability),
        jsonString(row),
        source,
        calcVersion,
        timestamp,
        timestamp,
      );
    });
  });

  insertMany(Array.isArray(rows) ? rows : []);
  return rows;
}

export async function getWaveBottomRowsFromDb(cacheKey = "") {
  const database = await initStockDataDb();
  let resolvedCacheKey = cacheKey;
  if (!resolvedCacheKey) {
    const latest = database.prepare(`
      SELECT cache_key FROM wave_bottom_confirm_pairs
      GROUP BY cache_key
      ORDER BY MAX(updated_at) DESC
      LIMIT 1
    `).get();
    resolvedCacheKey = latest?.cache_key || "";
  }

  if (!resolvedCacheKey) return null;

  const records = database.prepare(`
    SELECT row_json FROM wave_bottom_confirm_pairs
    WHERE cache_key = ?
    ORDER BY row_index ASC, confirm_wave_date ASC
  `).all(resolvedCacheKey);

  if (!records.length) return null;
  return records.map((record) => parseJson(record.row_json, null)).filter(Boolean);
}

export async function upsertStockNotifications(rows, { source = "api" } = {}) {
  const database = await initStockDataDb();
  const timestamp = nowIso();
  const statement = database.prepare(`
    INSERT INTO stock_notifications (
      notification_hash, trading_date, published_at, title, content, type, source, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notification_hash) DO UPDATE SET
      trading_date = excluded.trading_date,
      published_at = excluded.published_at,
      title = excluded.title,
      content = excluded.content,
      type = excluded.type,
      source = excluded.source,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);

  const normalizedRows = Array.isArray(rows) ? rows : [];
  const insertMany = database.transaction((items) => {
    items.forEach((row) => {
      const tradingDate = normalizeDateKey(row?.date || row?.rawDate || row?.published_at || row?.publishedAt);
      const content = String(row?.content || row?.x || "").trim();
      if (!tradingDate || !content) return;
      const title = String(row?.title || "").trim();
      const type = String(row?.type || row?.cap || "").trim();
      const publishedAt = String(row?.date || row?.published_at || row?.publishedAt || tradingDate).trim();
      const notificationHash = hashValue({ tradingDate, publishedAt, title, type, content });
      statement.run(
        notificationHash,
        tradingDate,
        publishedAt,
        title,
        content,
        type,
        source,
        jsonString(row),
        timestamp,
        timestamp,
      );
    });
  });

  insertMany(normalizedRows);
  return normalizedRows;
}

export async function getStockNotificationsForDateFromDb(dateKey) {
  const database = await initStockDataDb();
  const latest = database.prepare(`
    SELECT trading_date FROM stock_notifications
    WHERE trading_date <= ?
    GROUP BY trading_date
    ORDER BY trading_date DESC
    LIMIT 1
  `).get(dateKey);

  if (!latest?.trading_date) return [];

  const records = database.prepare(`
    SELECT raw_json FROM stock_notifications
    WHERE trading_date = ?
    ORDER BY published_at DESC, updated_at DESC
  `).all(latest.trading_date);

  return records.map((record) => parseJson(record.raw_json, null)).filter(Boolean);
}


export async function upsertRecommendationTemplate({ state, promptVersion, titleTemplate, bodyTemplate, actionTemplate, source = "system", raw = null }) {
  const database = await initStockDataDb();
  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO recommendation_templates (
      state, prompt_version, title_template, body_template, action_template, source, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(state, prompt_version) DO UPDATE SET
      title_template = excluded.title_template,
      body_template = excluded.body_template,
      action_template = excluded.action_template,
      source = excluded.source,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).run(
    String(state || "").trim().toUpperCase(),
    String(promptVersion || "").trim(),
    String(titleTemplate || "").trim(),
    String(bodyTemplate || "").trim(),
    String(actionTemplate || "").trim(),
    String(source || "system").trim(),
    raw === undefined ? null : jsonString(raw),
    timestamp,
    timestamp,
  );
}

export async function getRecommendationTemplateFromDb(state, promptVersion) {
  const database = await initStockDataDb();
  const record = database.prepare(`
    SELECT * FROM recommendation_templates
    WHERE state = ? AND prompt_version = ?
  `).get(String(state || "").trim().toUpperCase(), String(promptVersion || "").trim());
  if (!record) return null;
  return {
    state: record.state,
    promptVersion: record.prompt_version,
    titleTemplate: record.title_template,
    bodyTemplate: record.body_template,
    actionTemplate: record.action_template,
    source: record.source,
    raw: parseJson(record.raw_json, null),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function getRecommendationTemplatesFromDb(promptVersion) {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT * FROM recommendation_templates
    WHERE prompt_version = ?
    ORDER BY state ASC
  `).all(String(promptVersion || "").trim());
  return records.map((record) => ({
    state: record.state,
    promptVersion: record.prompt_version,
    titleTemplate: record.title_template,
    bodyTemplate: record.body_template,
    actionTemplate: record.action_template,
    source: record.source,
    raw: parseJson(record.raw_json, null),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }));
}

export async function upsertRecommendationDaily(row) {
  const database = await initStockDataDb();
  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO recommendation_daily (
      date_key, prompt_version, raw_state, effective_state, pha, override_reason,
      cho_mua, mua, cho_ban, ban, tc, total, title, body, action,
      source_hash, source_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date_key, prompt_version) DO UPDATE SET
      raw_state = excluded.raw_state,
      effective_state = excluded.effective_state,
      pha = excluded.pha,
      override_reason = excluded.override_reason,
      cho_mua = excluded.cho_mua,
      mua = excluded.mua,
      cho_ban = excluded.cho_ban,
      ban = excluded.ban,
      tc = excluded.tc,
      total = excluded.total,
      title = excluded.title,
      body = excluded.body,
      action = excluded.action,
      source_hash = excluded.source_hash,
      source_json = excluded.source_json,
      updated_at = excluded.updated_at
  `).run(
    normalizeDateKey(row?.dateKey),
    String(row?.promptVersion || "").trim(),
    row?.rawState || null,
    String(row?.effectiveState || "").trim().toUpperCase(),
    row?.pha || null,
    row?.overrideReason || null,
    toNumber(row?.choMua),
    toNumber(row?.mua),
    toNumber(row?.choBan),
    toNumber(row?.ban),
    row?.tc === undefined || row?.tc === null ? null : toNumber(row.tc),
    toNumber(row?.total),
    String(row?.title || "").trim(),
    String(row?.body || "").trim(),
    String(row?.action || "").trim(),
    row?.sourceHash || hashValue(row?.source || row),
    jsonString(row?.source || null),
    timestamp,
    timestamp,
  );
}

export async function getRecommendationDailyFromDb(dateKey, promptVersion) {
  const database = await initStockDataDb();
  const record = database.prepare(`
    SELECT * FROM recommendation_daily
    WHERE date_key = ? AND prompt_version = ?
  `).get(normalizeDateKey(dateKey), String(promptVersion || "").trim());
  if (!record) return null;
  return {
    ok: true,
    date_key: record.date_key,
    prompt_version: record.prompt_version,
    raw_state: record.raw_state,
    effective_state: record.effective_state,
    pha: record.pha,
    override_reason: record.override_reason,
    cho_mua: record.cho_mua,
    mua: record.mua,
    cho_ban: record.cho_ban,
    ban: record.ban,
    tc: record.tc,
    total: record.total,
    title: record.title,
    response: record.body,
    recommendation: record.action,
    source_hash: record.source_hash,
    source: parseJson(record.source_json, null),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export async function getRecommendationDailyRangeFromDb({ from = "", to = "", promptVersion = "" } = {}) {
  const database = await initStockDataDb();
  const records = database.prepare(`
    SELECT * FROM recommendation_daily
    WHERE (? = '' OR date_key >= ?)
      AND (? = '' OR date_key <= ?)
      AND (? = '' OR prompt_version = ?)
    ORDER BY date_key DESC
  `).all(from || "", from || "", to || "", to || "", promptVersion || "", promptVersion || "");
  return records.map((record) => ({
    date_key: record.date_key,
    prompt_version: record.prompt_version,
    raw_state: record.raw_state,
    effective_state: record.effective_state,
    pha: record.pha,
    title: record.title,
    response: record.body,
    recommendation: record.action,
  }));
}

export function hashStockDataValue(value) {
  return hashValue(value);
}


export { DB_PATH };
