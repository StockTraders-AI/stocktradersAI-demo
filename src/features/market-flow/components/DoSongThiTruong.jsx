import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../../theme";
import branchLookup from "../data/branchLookup.json";
import VongTronDoSong from "./VongTronDoSong.jsx";
import DateTimeTravel from "./DateTimeTravel.jsx";
import LichSuDoSong from "./LichSuDoSong.jsx";
import KhuyenNghiTuVanAI from "./KhuyenNghiTuVanAI.jsx";
import TuVanAiCard from "./TuVanAiCard.jsx";
import NhatKyTinHieu from "./NhatKyTinHieu/index.jsx";
import {
  fetchStockNoti,
  mergeStockNotiRows,
  normalizeStockNotiRows,
  pickStockNotiRowsForDate,
} from "./NhatKyTinHieu/helpers.js";
import { danhGiaDoSong } from "../utils/doSongEngine.js";
// ─────────────────────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────────────────────
const DARK_T = {
  bg: "#0A0D14",
  surf: "#111520",
  elev: "#171D2E",
  bdr: "#242E42",
  bdrs: "#1C2538",
  t1: "#F0F4FF",
  t2: "#A8B8D0",
  t3: "#5C7090",
  t4: "#3A4A60",
  G: "#3DD68C",
  Gs: "rgba(61,214,140,.13)",
  Gb: "rgba(61,214,140,.32)",
  MU: "#1A8A4A",
  MUs: "rgba(26,138,74,.15)",
  MUb: "rgba(26,138,74,.35)",
  B: "#7C3AED",
  Bs: "rgba(124,58,237,.13)",
  Bb: "rgba(124,58,237,.30)",
  A: "#FF9F0A",
  As: "rgba(255,159,10,.12)",
  Ab: "rgba(255,159,10,.30)",
  R: "#FF2D55",
  Rs: "rgba(255,45,85,.10)",
  Rb: "rgba(255,45,85,.26)",
  P: "#C084FC",
  Ps: "rgba(192,132,252,.10)",
  Pb: "rgba(192,132,252,.28)",
};

const LIGHT_T = {
  bg: "#F0EFF5",
  surf: "#FFFFFF",
  elev: "#F7F6FC",
  bdr: "#E0DEEA",
  bdrs: "#ECEAF4",
  t1: "#0A0A0A",
  t2: "#3A4250",
  t3: "#6B737F",
  t4: "#9FA5AE",
  G: "#16A34A",
  Gs: "rgba(22,163,74,.10)",
  Gb: "rgba(22,163,74,.28)",
  MU: "#15803D",
  MUs: "rgba(21,128,61,.12)",
  MUb: "rgba(21,128,61,.28)",
  B: "#6D28D9",
  Bs: "rgba(109,40,217,.10)",
  Bb: "rgba(109,40,217,.25)",
  A: "#D97706",
  As: "rgba(217,119,6,.10)",
  Ab: "rgba(217,119,6,.28)",
  R: "#E11D48",
  Rs: "rgba(225,29,72,.10)",
  Rb: "rgba(225,29,72,.25)",
  P: "#7C3AED",
  Ps: "rgba(124,58,237,.10)",
  Pb: "rgba(124,58,237,.24)",
};

let T = DARK_T;

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────
const STOCK_WAVE_CURRENT_URL =
  import.meta.env.VITE_STOCK_WAVE_CURRENT_URL ||
  "/thi-truong/api/stock-wave-current";
const STOCK_WAVE_HISTORY_URL =
  import.meta.env.VITE_STOCK_WAVE_HISTORY_URL ||
  "/thi-truong/api/stock-wave-history";
const STOCK_WAVE_TICKERS_URL =
  import.meta.env.VITE_STOCK_WAVE_TICKERS_URL ||
  "/thi-truong/api/stock-wave-tickers";
const WAVE_BOTTOM_CONFIRM_PAIRS_URL =
  import.meta.env.VITE_WAVE_BOTTOM_CONFIRM_PAIRS_URL ||
  "/thi-truong/api/wave-bottom-confirm-pairs";
const STOCK_NOTI_STREAM_URL =
  import.meta.env.VITE_STOCK_NOTI_STREAM_URL ||
  "/thi-truong/api/stock-noti/stream";
const STOCK_WAVE_CURRENT_STREAM_URL =
  import.meta.env.VITE_STOCK_WAVE_CURRENT_STREAM_URL ||
  "/thi-truong/api/stock-wave-current/stream";
const WAVE_BOTTOM_CONFIRM_PAIRS_STREAM_URL =
  import.meta.env.VITE_WAVE_BOTTOM_CONFIRM_PAIRS_STREAM_URL ||
  "/thi-truong/api/wave-bottom-confirm-pairs/stream";
const WAVE_CHANNEL = "wave";
const STOCK_NOTI_CHANNEL = "stock-noti";
const EMPTY_WAVE = {
  rawDate: "",
  date: "--/--/----",
  dow: "",
  cm: 0,
  mu: 0,
  cb: 0,
  ba: 0,
  total: 0,
  tc: 0,
  today: false,
  tickerB: [],
  tickerS: [],
  tickerWB: [],
  tickerWS: [],
};

function getTabCfg() {
  return {
    cm: {
      label: "Chờ mua",
      countKey: "cm",
      rowsKey: "tickerWB",
      bg: T.Gs,
      border: T.Gb,
      color: T.G,
    },
    mu: {
      label: "Mua",
      countKey: "mu",
      rowsKey: "tickerB",
      bg: T.MUs,
      border: T.MUb,
      color: T.MU,
    },
    cb: {
      label: "Chờ bán",
      countKey: "cb",
      rowsKey: "tickerWS",
      bg: T.As,
      border: T.Ab,
      color: T.A,
    },
    ba: {
      label: "Bán",
      countKey: "ba",
      rowsKey: "tickerS",
      bg: T.Rs,
      border: T.Rb,
      color: T.R,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWaveDate(value) {
  const date = toDate(value);
  if (!date) return "--/--/----";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatWaveDow(value) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(date);
}

function isToday(value) {
  const date = toDate(value);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function normalizeWaveRow(row) {
  if (!row || typeof row !== "object") return null;
  const cm = toNumber(row.waitbuy ?? row.waitBuy ?? row.wait_buy);
  const mu = toNumber(row.buy);
  const cb = toNumber(row.waitsell ?? row.waitSell ?? row.wait_sell);
  const ba = toNumber(row.sell);
  const total = toNumber(row.total) || cm + mu + cb + ba;
  const rawDate = String(row.date || row.tradingDate || row.ngay || "");

  return {
    rawDate,
    date: formatWaveDate(rawDate),
    dow: formatWaveDow(rawDate),
    cm,
    mu,
    cb,
    ba,
    total,
    tc: Math.max(0, Math.min(100, toNumber(row.reliability ?? row.tc))),
    hasReliability: row.reliability !== undefined || row.tc !== undefined,
    today: isToday(rawDate),
    tickerB: Array.isArray(row.tickerB) ? row.tickerB : [],
    tickerS: Array.isArray(row.tickerS) ? row.tickerS : [],
    tickerWB: Array.isArray(row.tickerWB) ? row.tickerWB : [],
    tickerWS: Array.isArray(row.tickerwWS)
      ? row.tickerwWS
      : Array.isArray(row.tickerWS)
        ? row.tickerWS
        : Array.isArray(row.tickerWWS)
          ? row.tickerWWS
          : [],
  };
}

function toDoSongInput(row) {
  if (!row?.rawDate) return null;
  const choMua = Number(row.cm) || 0;
  const mua = Number(row.mu) || 0;
  const choBan = Number(row.cb) || 0;
  const ban = Number(row.ba) || 0;
  return {
    date: row.rawDate,
    choMua,
    mua,
    choBan,
    ban,
    tinCay: Number(row.tc) || 0,
    tong: Number(row.total) || choMua + mua + choBan + ban,
  };
}

const DISABLED_DOSONG_STATES = new Set(["s2", "s3"]);

function effectiveDoSongEngine(engine, fallbackEngine) {
  const state = String(engine?.maTrangThai || "").toLowerCase();
  if (DISABLED_DOSONG_STATES.has(state) && fallbackEngine) {
    return {
      ...fallbackEngine,
      overriddenFrom: engine,
      overrideReason: `disabled_${state}_use_nearest_previous_state`,
    };
  }
  return engine;
}

function doSongSignalKeys(engine) {
  const keys = [];
  const state = String(engine?.maTrangThai || "").toLowerCase();
  if (DISABLED_DOSONG_STATES.has(state)) return ["do_song_engine"];
  if (state) keys.push(`do_song_state_${state}`);

  const phaseKey = {
    "\u0110i\u1ec1u ch\u1ec9nh": "dieu_chinh",
    "T\u00edch l\u0169y": "tich_luy",
    "Ch\u00e2n s\u00f3ng": "chan_song",
    "S\u00f3ng t\u0103ng": "song_tang",
    "Ph\u00e2n ph\u1ed1i": "phan_phoi",
  }[engine?.pha];
  if (phaseKey) keys.push(`do_song_phase_${phaseKey}`);
  keys.push("do_song_engine");
  return [...new Set(keys)];
}

function buildDoSongAdvice(rows, selectedDate) {
  const targetDate = String(selectedDate || "");
  if (!targetDate) return null;

  const byDate = new Map();
  rows.forEach((row) => {
    if (!row?.rawDate || row.rawDate > targetDate) return;
    byDate.set(row.rawDate, row);
  });

  const sortedRows = [...byDate.values()].sort((a, b) =>
    String(a.rawDate).localeCompare(String(b.rawDate)),
  );
  let phienTruoc = null;
  let phaTruoc = null;
  let nearestEnabledEngine = null;
  let nearestEnabledDate = "";
  let selectedAdvice = null;

  sortedRows.forEach((row) => {
    const hienTai = toDoSongInput(row);
    if (!hienTai) return;
    const hasPreviousSession = Boolean(phienTruoc);
    const engine = danhGiaDoSong({ hienTai, phienTruoc, phaTruoc });
    if (row.rawDate === targetDate && hasPreviousSession) {
      const usedEngine = effectiveDoSongEngine(engine, nearestEnabledEngine);
      selectedAdvice = {
        check_date: row.rawDate,
        signal_keys: doSongSignalKeys(usedEngine),
        source_dates: sortedRows.map((item) => item.rawDate),
        previous_date: phienTruoc?.date || "",
        nearest_enabled_date: nearestEnabledDate,
        wave: hienTai,
        engine: usedEngine,
        raw_engine: engine,
        nearest_engine: nearestEnabledEngine,
      };
      const debugState = {
        date: row.rawDate,
        previous_date: phienTruoc?.date || "",
        nearest_enabled_date: nearestEnabledDate,
        session_count: sortedRows.length,
        raw_maTrangThai: engine.maTrangThai,
        raw_pha: engine.pha,
        maTrangThai: usedEngine?.maTrangThai,
        pha: usedEngine?.pha,
        overrideReason: usedEngine?.overrideReason || "",
        signal_keys: selectedAdvice.signal_keys,
        wave: hienTai,
        engine: usedEngine,
        raw_engine: engine,
        nearest_engine: nearestEnabledEngine,
      };
      window.__DOSONG_DEBUG__ = debugState;
    }
    if (
      !DISABLED_DOSONG_STATES.has(
        String(engine.maTrangThai || "").toLowerCase(),
      )
    ) {
      nearestEnabledEngine = engine;
      nearestEnabledDate = row.rawDate;
    }
    phienTruoc = hienTai;
    phaTruoc = engine.pha;
  });

  return selectedAdvice;
}

function formatTickerNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(
    number,
  );
}

function formatTickerVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
    number,
  );
}

function formatVnindex(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "-";
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function formatSessions(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return `${number} phiên`;
}

function getTickerBranch(item) {
  const ticker = String(item?.ticker || item?.ma || "").toUpperCase();
  return item?.branch || item?.nganh || branchLookup[ticker] || "Khác";
}

function normalizeTickerRows(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const rawVolume = toNumber(item.vol ?? item.volume);
      return {
        ma: item.ticker || item.ma || "-",
        nganh: getTickerBranch(item),
        gia: formatTickerNumber(item.close ?? item.gia ?? item.price),
        vol: formatTickerVolume(rawVolume),
        volRaw: rawVolume,
        tc: Math.max(0, Math.min(100, toNumber(item.reliability ?? item.tc))),
      };
    })
    .sort((a, b) => b.volRaw - a.volRaw);
}

function getWaveRows(payload) {
  const root = payload?.StockWaveRequest ?? payload;
  const waves =
    root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
  const rows =
    payload?.allRows ??
    waves?.waveDatas ??
    waves?.waveData ??
    waves?.rows ??
    waves?.history ??
    waves?.stockWaves?.waveDatas ??
    waves;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === "object" && (rows.date || rows.buy !== undefined))
    return [rows];
  return [];
}

function getPayloadReliability(payload) {
  const root = payload?.StockWaveRequest ?? payload;
  const waves =
    root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
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
    .sort((a, b) => String(b.rawDate).localeCompare(String(a.rawDate)))
    .map((item, index) => ({
      ...item,
      today: index === 0 ? item.today : false,
    }));
}

function getPreviousWaveSessions(rows, referenceDate) {
  return rows
    .filter((item) => item.rawDate && item.rawDate < referenceDate)
    .slice(0, 3)
    .map((item) => ({ ...item, today: false }));
}

function getFirstDateField(row, keys) {
  for (const key of keys) {
    const value = String(row?.[key] || "")
      .trim()
      .slice(0, 10);
    if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) return value;
  }
  return "";
}

function getSelectedAdviceMode({ selectedDate, chanSongRows, waveDates }) {
  if (!selectedDate) return "engine";
  const rows = Array.isArray(chanSongRows) ? chanSongRows : [];
  const confirmRows = rows
    .map((row) => ({
      row,
      confirmDate: getFirstDateField(row, [
        "confirm_wave_date",
        "confirmDate",
        "date",
      ]),
    }))
    .filter((item) => item.confirmDate);

  if (confirmRows.some((item) => item.confirmDate === selectedDate))
    return "buy";

  const explicitProbeKeys = [
    "probe_wave_date",
    "waitbuy_wave_date",
    "prepare_wave_date",
    "bottom_wave_date",
    "detect_wave_date",
    "scan_wave_date",
    "early_wave_date",
    "pre_confirm_wave_date",
  ];
  if (
    confirmRows.some(
      (item) => getFirstDateField(item.row, explicitProbeKeys) === selectedDate,
    )
  ) {
    return "waitbuy";
  }

  const sortedWaveDates = [
    ...new Set((waveDates || []).filter(Boolean)),
  ].sort();
  const selectedIsPreviousConfirmSession = confirmRows.some((item) => {
    const previousDate =
      sortedWaveDates.filter((date) => date < item.confirmDate).pop() || "";
    return previousDate === selectedDate;
  });

  return selectedIsPreviousConfirmSession ? "waitbuy" : "engine";
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

function getSocketStockNotiData(payload) {
  const channel = String(payload?.channel || payload?.data?.channel || "");
  if (channel && channel !== STOCK_NOTI_CHANNEL) return null;
  return (
    payload?.data?.data ??
    payload?.data?.payload ??
    payload?.data ??
    payload?.payload ??
    payload
  );
}

function fetchStockWaveCurrent() {
  return fetch(STOCK_WAVE_CURRENT_URL)
    .then((response) => {
      if (!response.ok) return null;
      return response.json();
    })
    .then((payload) => {
      if (!payload) return null;
      return {
        row: normalizeWavePayload(payload.data ?? payload)[0] || null,
        allRows: normalizeWavePayload(payload.allRows ?? []),
      };
    });
}

const stockWaveHistoryRequests = new Map();
const stockWaveTickerRequests = new Map();
let waveBottomConfirmPairsRequest = null;

function getHistoryUrl(referenceDate, force = false) {
  const url = new URL(STOCK_WAVE_HISTORY_URL, window.location.origin);
  url.searchParams.set("before", referenceDate);
  if (force) url.searchParams.set("refresh", "1");
  return url.toString();
}

function fetchStockWaveHistory(referenceDate, force = false) {
  if (force) stockWaveHistoryRequests.delete(referenceDate);
  if (!stockWaveHistoryRequests.has(referenceDate)) {
    const request = fetch(getHistoryUrl(referenceDate, force), {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Stock wave history failed: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const allRows = normalizeWavePayload(payload.allRows ?? payload);
        return {
          rows: getPreviousWaveSessions(allRows, referenceDate),
          allRows,
        };
      })
      .catch((error) => {
        stockWaveHistoryRequests.delete(referenceDate);
        throw error;
      });

    stockWaveHistoryRequests.set(referenceDate, request);
  }

  return stockWaveHistoryRequests.get(referenceDate);
}

function getTickersUrl(dateKey = "") {
  const url = new URL(STOCK_WAVE_TICKERS_URL, window.location.origin);
  if (dateKey && dateKey !== "latest") url.searchParams.set("date", dateKey);
  return url.toString();
}

function fetchStockWaveTickers(cacheKey = "latest") {
  if (!stockWaveTickerRequests.has(cacheKey)) {
    const request = fetch(getTickersUrl(cacheKey))
      .then((response) => {
        if (!response.ok)
          throw new Error(`Stock wave tickers failed: ${response.status}`);
        return response.json();
      })
      .then((payload) => normalizeWavePayload(payload)[0] || null)
      .catch((error) => {
        stockWaveTickerRequests.delete(cacheKey);
        throw error;
      });

    stockWaveTickerRequests.set(cacheKey, request);
  }

  return stockWaveTickerRequests.get(cacheKey);
}
function fetchWaveBottomConfirmPairs(force = false) {
  if (force) waveBottomConfirmPairsRequest = null;
  if (!waveBottomConfirmPairsRequest) {
    const url = new URL(WAVE_BOTTOM_CONFIRM_PAIRS_URL, window.location.origin);
    if (force) url.searchParams.set("refresh", "1");
    waveBottomConfirmPairsRequest = fetch(url.toString(), {
      method: "POST",
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            `Wave bottom confirm pairs failed: ${response.status}`,
          );
        return response.json();
      })
      .then((payload) => (Array.isArray(payload?.rows) ? payload.rows : []))
      .catch((error) => {
        waveBottomConfirmPairsRequest = null;
        throw error;
      });
  }

  return waveBottomConfirmPairsRequest;
}

// ─────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div
      style={{
        background: T.surf,
        border: `0.5px solid ${T.bdr}`,
        borderRadius: 12,
        padding: "14px 15px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ icon, title, meta, right, mb = 12 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: mb,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontFamily: "'Be Vietnam Pro', Inter, sans-serif",
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.3,
          letterSpacing: 0,
          color: T.t1,
          margin: 0,
        }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: T.t3 }} />
        {title}
        {meta && (
          <span style={{ fontSize: 10, color: T.t4, fontWeight: 400 }}>
            {meta}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

function Clink({ children, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{ fontSize: 12, color: T.B, cursor: "pointer", fontWeight: 600 }}
    >
      {children}
    </span>
  );
}

const tableScrollStyle = {
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const noWrapTableStyle = {
  width: "max-content",
  minWidth: "100%",
  borderCollapse: "collapse",
  tableLayout: "auto",
  whiteSpace: "nowrap",
};

const noWrapCellStyle = {
  whiteSpace: "nowrap",
  overflowWrap: "normal",
  wordBreak: "keep-all",
};

// ─────────────────────────────────────────────────────────────
// MAIN DONUT
// ─────────────────────────────────────────────────────────────
function formatSampleDate(value) {
  const date = toDate(value);
  if (!date) return "--/--";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatSampleWeek(value) {
  const date = toDate(value);
  if (!date) return "";
  const day = date.getDay();
  if (day === 0) return "CN";
  return `T.${day + 1}`;
}

function MainDonut({ d = EMPTY_WAVE, theme = "dark", dateControl = null }) {
  const data = { cm: d.cm, mu: d.mu, cb: d.cb, ba: d.ba };
  const total = d.total || d.cm + d.mu + d.cb + d.ba;
  return (
    <VongTronDoSong
      data={data}
      total={total}
      trust={Math.max(0, Math.min(100, toNumber(d.tc)))}
      date={d.rawDate ? formatWaveDate(d.rawDate) : d.date}
      dateControl={dateControl}
      theme={theme}
    />
  );
}

function toHistorySampleDay(row) {
  return {
    date: formatSampleDate(row.rawDate),
    week: formatSampleWeek(row.rawDate),
    today: isToday(row.rawDate),
    total: row.total || row.cm + row.mu + row.cb + row.ba,
    trust: Math.max(0, Math.min(100, toNumber(row.tc))),
    data: { cm: row.cm, mu: row.mu, cb: row.cb, ba: row.ba },
  };
}

function HistNavigator({
  data,
  totalDays: apiTotalDays,
  theme = "dark",
  loading = false,
  onRefresh = null,
}) {
  const [page, setPage] = useState(1);
  const perPage = 3;
  const totalDays = apiTotalDays || data.length;
  const pageCount = Math.max(1, Math.ceil(totalDays / perPage));
  const safePage = Math.min(page, pageCount);
  const days = data
    .slice((safePage - 1) * perPage, safePage * perPage)
    .map((row) => toHistorySampleDay(row));

  useEffect(() => {
    setPage(1);
  }, [data]);

  return (
    <LichSuDoSong
      days={days}
      page={safePage}
      totalDays={totalDays || days.length}
      pageCount={pageCount}
      onPage={setPage}
      theme={theme}
      loading={loading}
      onTitleRefresh={onRefresh}
    />
  );
}
function DanhMucDoSong({ wave = EMPTY_WAVE, countWave = wave }) {
  const [tab, setTab] = useState("cm");
  const [showAll, setShowAll] = useState(false);
  const tabCfg = getTabCfg();
  const cfg = tabCfg[tab];
  const rows = normalizeTickerRows(wave[cfg.rowsKey]);
  const count = countWave?.[cfg.countKey] ?? rows.length;
  const visibleRows = showAll ? rows : rows.slice(0, 5);
  const showReliability = tab === "mu";

  useEffect(() => {
    setShowAll(false);
  }, [tab]);

  const tdStyle = {
    padding: "8px 5px",
    borderBottom: `0.5px solid ${T.bdrs}`,
    ...noWrapCellStyle,
  };

  return (
    <Card style={{ padding: "16px 17px" }}>
      <CardHeader
        icon="ti-list"
        title="Danh mục dò sóng"
        right={
          <Clink onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Thu gọn" : "Xem tất cả →"}
          </Clink>
        }
      />
      {/* Tab buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {Object.entries(tabCfg).map(([key, c]) => {
          const active = key === tab;
          const tabCount =
            countWave?.[c.countKey] ??
            normalizeTickerRows(wave[c.rowsKey]).length;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                textAlign: "center",
                padding: "8px 4px",
                borderRadius: 8,
                cursor: "pointer",
                background: active ? c.bg : T.elev,
                border: `0.5px solid ${active ? c.border : T.bdr}`,
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? c.color : T.t2,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: active ? c.color : T.t4,
                  opacity: active ? 0.8 : 1,
                }}
              >
                ({tabCount})
              </div>
            </button>
          );
        })}
      </div>
      {/* Table */}
      <div
        style={{
          ...tableScrollStyle,
          maxHeight: showAll ? 260 : "none",
          overflowY: showAll ? "auto" : "visible",
        }}
      >
        <table
          style={{
            ...noWrapTableStyle,
            width: "100%",
            minWidth: "100%",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: 44 }} />
            <col />
            <col style={{ width: 52 }} />
            <col style={{ width: 88 }} />
            {showReliability && <col style={{ width: 94 }} />}
          </colgroup>
          <thead>
            <tr>
              {[
                "Mã",
                "Ngành",
                "Giá",
                "Khối lượng",
                ...(showReliability ? ["Độ tin cậy"] : []),
              ].map((h, i) => (
                <th
                  key={h}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: T.t4,
                    textTransform: "uppercase",
                    letterSpacing: ".07em",
                    padding: "7px 5px",
                    borderBottom: `0.5px solid ${T.bdr}`,
                    textAlign: i >= 2 ? "right" : "left",
                    background: T.elev,
                    ...noWrapCellStyle,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, idx) => {
              const isLast = idx === visibleRows.length - 1;
              const barColor = r.tc >= 70 ? T.G : r.tc >= 55 ? T.A : T.R;
              return (
                <tr
                  key={`${r.ma}-${idx}`}
                  style={{
                    borderBottom: isLast ? "none" : `0.5px solid ${T.bdrs}`,
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 700,
                      color: T.B,
                      fontSize: 13,
                    }}
                  >
                    {r.ma}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontSize: 11,
                      color: T.t3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.nganh}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: 700,
                      color: T.t1,
                    }}
                  >
                    {r.gia}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: 600,
                      color: T.t2,
                    }}
                  >
                    {r.vol}
                  </td>
                  {showReliability && (
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <span style={{ fontWeight: 700, color: barColor }}>
                        {r.tc}%
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          width: 40,
                          height: 3,
                          background: T.bdr,
                          borderRadius: 2,
                          overflow: "hidden",
                          verticalAlign: "middle",
                          marginLeft: 6,
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            height: "100%",
                            width: `${r.tc}%`,
                            background: barColor,
                            borderRadius: 2,
                          }}
                        />
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td
                  colSpan={showReliability ? 5 : 4}
                  style={{
                    padding: "18px 8px",
                    textAlign: "center",
                    color: T.t3,
                    fontSize: 12,
                  }}
                >
                  Chưa có danh sách mã cho nhóm {cfg.label.toLowerCase()}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        onClick={() => setShowAll((value) => !value)}
        style={{
          marginTop: 10,
          fontSize: 12,
          color: T.B,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {showAll
          ? "Thu gọn"
          : `Xem tất cả ${count} mã ${cfg.label.toLowerCase()} →`}
      </div>
    </Card>
  );
}

// -------------------------------------------------------------
// LỊCH SỬ CHÂN SÓNG
// -------------------------------------------------------------
function ChanSong({ data = [], onRefresh = null }) {
  const [showAll, setShowAll] = useState(false);
  const [selectedYear, setSelectedYear] = useState("");

  const sortedRows = [...data].sort((a, b) =>
    String(b.confirm_wave_date || "").localeCompare(
      String(a.confirm_wave_date || ""),
    ),
  );
  const yearOptions = useMemo(() => {
    return [
      ...new Set(
        sortedRows
          .map((row) => String(row.confirm_wave_date || "").slice(0, 4))
          .filter((year) => /^\d{4}$/.test(year)),
      ),
    ];
  }, [sortedRows]);
  const activeYear =
    selectedYear || yearOptions[0] || String(new Date().getFullYear());
  const filteredRows = sortedRows.filter((row) =>
    String(row.confirm_wave_date || "").startsWith(activeYear),
  );
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 5);
  const canToggle = filteredRows.length > 5;

  useEffect(() => {
    if (selectedYear && !yearOptions.includes(selectedYear)) {
      setSelectedYear("");
    }
  }, [selectedYear, yearOptions]);

  function formatIncreasePoints(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "-";

    const formatted = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(number));

    return `${number >= 0 ? "+" : "-"}${formatted} điểm`;
  }

  function getWaveType(row) {
    const rawType = String(
      row.wave_type ?? row.type ?? row.waveType ?? "",
    ).toLowerCase();

    if (
      rawType === "lon" ||
      rawType === "large" ||
      rawType === "song_lon" ||
      rawType === "sóng lớn"
    ) {
      return "lon";
    }

    if (
      rawType === "hoi" ||
      rawType === "recovery" ||
      rawType === "song_hoi" ||
      rawType === "sóng hồi"
    ) {
      return "hoi";
    }

    /*
     * Fallback khi API chưa trả loại sóng.
     * Có thể đổi điều kiện này theo quy tắc nghiệp vụ thực tế.
     */
    return toNumber(row.reliability) >= 75 ? "lon" : "hoi";
  }

  const tdStyle = {
    padding: "9px",
    borderBottom: `0.5px solid ${T.bdrs}`,
    fontSize: 12.5,
    whiteSpace: "nowrap",
    overflowWrap: "normal",
    wordBreak: "keep-all",
  };

  const yearFilterControls = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        marginLeft: 18,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 68,
          height: 32,
          borderRadius: 10,
          border: `0.5px solid ${T.Bb}`,
          background: T.surf,
          boxShadow: T === LIGHT_T ? "0 6px 18px rgba(15,23,42,.06)" : "none",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 13,
            top: "50%",
            transform: "translateY(-50%)",
            color: T.t1,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          {activeYear}
        </span>
        <select
          value={activeYear}
          onChange={(event) => {
            if (!event.target.value) return;
            setSelectedYear(event.target.value);
            setShowAll(false);
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            opacity: 0,
            cursor: "pointer",
          }}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <span
          style={{
            position: "absolute",
            right: 7,
            top: "50%",
            width: 12,
            height: 12,
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.t3,
            pointerEvents: "none",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 10l5 5 5-5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );

  return (
    <Card style={{ padding: "16px 17px" }}>
      {/* Header giống HTML mẫu */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: "'Be Vietnam Pro', Inter, sans-serif",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: 0,
            color: T.t1,
            margin: 0,
          }}
        >
          <span>
            <span
              onClick={onRefresh || undefined}
              title="Tất cả lịch sử chân sóng"
              style={{ cursor: onRefresh ? "pointer" : "inherit" }}
            >
              Lịch
            </span>{" "}
            sử chân sóng
          </span>
          {yearFilterControls}
        </div>

        <span
          onClick={() => {
            if (canToggle) setShowAll((value) => !value);
          }}
          style={{
            fontSize: 12,
            color: T.B,
            fontWeight: 700,
            cursor: canToggle ? "pointer" : "default",
          }}
        >
          {showAll ? "Thu gọn" : "Xem tất cả →"}
        </span>
      </div>

      <div
        className="chan-song-table-wrap"
        style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <table
          className="chan-song-table"
          style={{
            width: "max-content",
            minWidth: "max(100%, 500px)",
            borderCollapse: "collapse",
            tableLayout: "auto",
            whiteSpace: "nowrap",
          }}
        >
          <thead>
            <tr>
              {[
                "Ngày tạo đáy",
                "VNIndex đáy",
                "Độ tin cậy",
                "Tăng điểm",
                "Độ dài",
                "Loại sóng",
              ].map((heading, index) => {
                let textAlign = "left";

                if (index === 1 || index === 4 || index === 5) {
                  textAlign = "right";
                }

                if (index === 2 || index === 3) {
                  textAlign = "center";
                }

                return (
                  <th
                    key={heading}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.t4,
                      textTransform: "uppercase",
                      letterSpacing: ".07em",
                      padding: "7px 9px",
                      borderBottom: `0.5px solid ${T.bdr}`,
                      background: T.elev,
                      textAlign,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {heading}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row, index) => {
              const reliability = toNumber(row.reliability);
              const waveType = getWaveType(row);
              const isLargeWave = waveType === "lon";
              const isLast = index === visibleRows.length - 1;

              const rowBottomBorder = isLast ? "none" : `0.5px solid ${T.bdrs}`;

              return (
                <tr key={`${row.confirm_wave_date}-${index}`}>
                  {/* Ngày tạo đáy */}
                  <td
                    style={{
                      ...tdStyle,
                      borderBottom: rowBottomBorder,
                      fontWeight: 700,
                      color: T.t1,
                    }}
                  >
                    {formatWaveDate(row.confirm_wave_date)}
                  </td>

                  {/* VNIndex đáy */}
                  <td
                    style={{
                      ...tdStyle,
                      borderBottom: rowBottomBorder,
                      textAlign: "right",
                      fontWeight: 700,
                      color: T.t1,
                      fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    }}
                  >
                    {formatVnindex(row.vnindex)}
                  </td>

                  {/* Độ tin cậy */}
                  <td
                    style={{
                      ...tdStyle,
                      borderBottom: rowBottomBorder,
                      textAlign: "center",
                      fontWeight: 700,
                      color: T.G,
                    }}
                  >
                    {reliability}%
                  </td>

                  {/* Tăng điểm */}
                  <td
                    style={{
                      ...tdStyle,
                      borderBottom: rowBottomBorder,
                      textAlign: "center",
                      fontWeight: 700,
                      color: T.G,
                    }}
                  >
                    {formatIncreasePoints(row.increase_points)}
                  </td>

                  {/* Độ dài */}
                  <td
                    style={{
                      ...tdStyle,
                      borderBottom: rowBottomBorder,
                      textAlign: "right",
                      color: T.t3,
                    }}
                  >
                    {formatSessions(row.duration_sessions)}
                  </td>

                  {/* Loại sóng */}
                  <td
                    style={{
                      ...tdStyle,
                      borderBottom: rowBottomBorder,
                      textAlign: "right",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        borderRadius: 8,
                        padding: "4px 11px",
                        fontSize: 11.5,
                        fontWeight: 700,

                        background: isLargeWave ? T.Gs : T.Bs,
                        border: `1px solid ${isLargeWave ? T.Gb : T.Bb}`,
                        color: isLargeWave ? T.G : T.B,
                      }}
                    >
                      {isLargeWave ? "Sóng lớn" : "Sóng hồi"}
                    </span>
                  </td>
                </tr>
              );
            })}

            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "18px 8px",
                    textAlign: "center",
                    color: T.t3,
                    fontSize: 12,
                  }}
                >
                  Đang chờ dữ liệu chân sóng...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        onClick={() => {
          if (canToggle) setShowAll((value) => !value);
        }}
        style={{
          marginTop: 10,
          fontSize: 12,
          color: T.B,
          fontWeight: 700,
          cursor: canToggle ? "pointer" : "default",
        }}
      >
        {showAll ? "Thu gọn" : "Xem tất cả lịch sử chân sóng"}
      </div>
    </Card>
  );
}

export default function DoSongThiTruong() {
  const { dark } = useTheme();
  const theme = dark ? "dark" : "light";
  T = theme === "light" ? LIGHT_T : DARK_T;
  const [selectedWaveDate, setSelectedWaveDate] = useState("");
  const [latestWave, setLatestWave] = useState(EMPTY_WAVE);
  const [historyWaves, setHistoryWaves] = useState([]);
  const [historyAllWaves, setHistoryAllWaves] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [chanSongRows, setChanSongRows] = useState([]);
  const [tickerWave, setTickerWave] = useState(EMPTY_WAVE);
  const [signalRefreshKey, setSignalRefreshKey] = useState(0);
  const [stockNotiRows, setStockNotiRows] = useState([]);
  const stockNotiDateRef = useRef("");
  const selectedWaveDateRef = useRef("");
  const stockNotiRequestSeq = useRef(0);
  const tickerRequestSeq = useRef(0);
  const tickerRequestKey = selectedWaveDate || latestWave.rawDate || "latest";
  const historySource = historyAllWaves.length ? historyAllWaves : historyWaves;
  const historyDisplayWaves = historySource.filter(
    (item) => !latestWave.rawDate || item.rawDate < latestWave.rawDate,
  );
  const matchingHistoryWave = historySource.find(
    (item) => item.rawDate === latestWave.rawDate,
  );
  const realtimeDisplayWave =
    latestWave.hasReliability || !matchingHistoryWave
      ? latestWave
      : { ...latestWave, tc: matchingHistoryWave.tc, hasReliability: true };
  const mainDonutDisplayWave = realtimeDisplayWave;
  const dateTravelWaves = [mainDonutDisplayWave, ...historyDisplayWaves].filter(
    (item, index, rows) =>
      item.rawDate &&
      rows.findIndex((row) => row.rawDate === item.rawDate) === index,
  );
  const sortedDateTravelWaves = [...dateTravelWaves].sort((a, b) =>
    String(b.rawDate).localeCompare(String(a.rawDate)),
  );
  const selectedMainDonutWave = selectedWaveDate
    ? dateTravelWaves.find((item) => item.rawDate === selectedWaveDate) ||
      mainDonutDisplayWave
    : mainDonutDisplayWave;
  const selectedHistoryDisplayWaves = historySource.filter(
    (item) =>
      !selectedMainDonutWave.rawDate ||
      item.rawDate < selectedMainDonutWave.rawDate,
  );
  const selectedChanSongRows = chanSongRows.filter((row) => {
    const rowDate = String(row?.confirm_wave_date || "");
    return (
      !selectedMainDonutWave.rawDate ||
      !rowDate ||
      rowDate <= selectedMainDonutWave.rawDate
    );
  });
  const selectedAdviceMode = getSelectedAdviceMode({
    selectedDate: selectedMainDonutWave.rawDate,
    chanSongRows,
    waveDates: dateTravelWaves.map((item) => item.rawDate),
  });
  const dateTravelValue = toDate(selectedMainDonutWave.rawDate) || new Date();
  const dateTravelMinDate =
    toDate(sortedDateTravelWaves[sortedDateTravelWaves.length - 1]?.rawDate) ||
    dateTravelValue;
  const dateTravelMaxDate =
    toDate(sortedDateTravelWaves[0]?.rawDate) || dateTravelValue;
  const stockNotiDate =
    selectedMainDonutWave.rawDate || formatDateKey(new Date());
  const danhMucWave = tickerWave.rawDate
    ? { ...selectedMainDonutWave, ...tickerWave }
    : selectedMainDonutWave;
  const displayStockNotiRows = useMemo(() => {
    if (!stockNotiDate) return stockNotiRows;
    return pickStockNotiRowsForDate(stockNotiRows, stockNotiDate);
  }, [stockNotiRows, stockNotiDate]);
  useEffect(() => {
    stockNotiDateRef.current = stockNotiDate;
    selectedWaveDateRef.current = selectedWaveDate;
  }, [stockNotiDate, selectedWaveDate]);

  const selectedDoSongAdvice = useMemo(
    () =>
      buildDoSongAdvice(
        [...historySource, mainDonutDisplayWave],
        selectedMainDonutWave.rawDate,
      ),
    [historySource, mainDonutDisplayWave, selectedMainDonutWave.rawDate],
  );
  function refreshHistoryFromTitle() {
    if (!latestWave.rawDate) return;
    if (!historyAllWaves.length) setHistoryLoading(true);
    fetchStockWaveHistory(latestWave.rawDate, true)
      .then(({ rows, allRows }) => {
        setHistoryWaves(rows);
        setHistoryAllWaves(allRows?.length ? allRows : rows);
      })
      .catch((error) => {
        console.error("Reload stock wave history failed", error);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }

  function refreshChanSongFromTitle() {
    fetchWaveBottomConfirmPairs(true)
      .then((rows) => {
        setChanSongRows(rows);
      })
      .catch((error) => {
        console.error("Reload wave bottom confirm pairs failed", error);
      });
  }

  useEffect(() => {
    let active = true;

    fetchStockWaveCurrent()
      .then((snapshot) => {
        const row = snapshot?.row;
        if (!active || !row) return;
        if (snapshot.allRows?.length) {
          setHistoryAllWaves(snapshot.allRows);
          setHistoryWaves(
            getPreviousWaveSessions(snapshot.allRows, row.rawDate),
          );
          setHistoryLoading(false);
        }
        setLatestWave(row);
        setSignalRefreshKey((key) => key + 1);
      })
      .catch((error) => {
        console.error("Load stock wave current cache failed", error);
      });

    const applyStockNotiPayload = (payload) => {
      if (!active) return false;

      const notiData = getSocketStockNotiData(payload);
      if (!notiData) return false;
      const notiRows = normalizeStockNotiRows(notiData);
      if (!notiRows.length) return false;

      const activeDate = stockNotiDateRef.current || formatDateKey(new Date());
      const matchingRows = notiRows.filter(
        (row) => !row.rawDate || row.rawDate === activeDate,
      );
      if (selectedWaveDateRef.current && !matchingRows.length) return true;
      const rowsToMerge = matchingRows.length ? matchingRows : notiRows;
      setStockNotiRows((current) => mergeStockNotiRows(current, rowsToMerge));

      return true;
    };

    const stockWaveCurrentStream =
      typeof EventSource !== "undefined"
        ? new EventSource(STOCK_WAVE_CURRENT_STREAM_URL)
        : null;

    stockWaveCurrentStream?.addEventListener("stock-wave-current", (event) => {
      if (!active) return;
      try {
        const payload = JSON.parse(event.data);
        const data = getSocketWaveData(payload);
        if (!data) return;

        const rows = normalizeWavePayload(data);
        if (!rows.length) return;

        setLatestWave(rows[0]);
        setSignalRefreshKey((key) => key + 1);
      } catch (error) {
        console.error("Parse stock-wave-current stream failed", error);
      }
    });

    const stockNotiStream =
      typeof EventSource !== "undefined"
        ? new EventSource(STOCK_NOTI_STREAM_URL)
        : null;

    stockNotiStream?.addEventListener("stock-noti", (event) => {
      if (!active) return;
      try {
        const payload = JSON.parse(event.data);
        applyStockNotiPayload({ channel: STOCK_NOTI_CHANNEL, data: payload });
      } catch (error) {
        console.error("Parse stock-noti stream failed", error);
      }
    });

    stockWaveCurrentStream?.addEventListener("error", (error) => {
      if (active) console.error("Stock wave current stream failed", error);
    });

    return () => {
      active = false;
      stockWaveCurrentStream?.close();
      stockNotiStream?.close();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const requestDate = stockNotiDate;
    const requestId = stockNotiRequestSeq.current + 1;
    stockNotiRequestSeq.current = requestId;
    setStockNotiRows([]);

    fetchStockNoti(requestDate)
      .then((rows) => {
        if (
          !active ||
          stockNotiRequestSeq.current !== requestId ||
          stockNotiDateRef.current !== requestDate
        )
          return;
        const nextRows = selectedWaveDate
          ? pickStockNotiRowsForDate(rows, requestDate)
          : rows;
        setStockNotiRows(nextRows);
      })
      .catch((error) => {
        if (active && stockNotiRequestSeq.current === requestId)
          console.error("Load stock notifications failed", error);
      });

    return () => {
      active = false;
    };
  }, [stockNotiDate, selectedWaveDate]);
  useEffect(() => {
    let active = true;

    fetchWaveBottomConfirmPairs()
      .then((rows) => {
        if (active) setChanSongRows(rows);
      })
      .catch((error) => {
        console.error("Load wave bottom confirm pairs failed", error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const stream = new EventSource(WAVE_BOTTOM_CONFIRM_PAIRS_STREAM_URL);

    stream.addEventListener("wave-bottom-updated", (event) => {
      try {
        const payload = JSON.parse(event.data);

        const updates = Array.isArray(payload?.rows) ? payload.rows : [];

        if (!updates.length) return;

        setChanSongRows((currentRows) => {
          return currentRows.map((oldRow) => {
            const updatedRow = updates.find((newRow) => {
              return (
                String(newRow.confirm_wave_date || "") ===
                  String(oldRow.confirm_wave_date || "") &&
                String(newRow.prepare_bottom_date || "") ===
                  String(oldRow.prepare_bottom_date || "")
              );
            });

            if (!updatedRow) {
              return oldRow;
            }

            return {
              ...oldRow,
              ...updatedRow,
            };
          });
        });
      } catch (error) {
        console.error("Parse wave bottom realtime update failed", error);
      }
    });

    stream.addEventListener("error", (error) => {
      console.error("Wave bottom realtime stream failed", error);
    });

    return () => {
      stream.close();
    };
  }, []);

  useEffect(() => {
    if (!latestWave.rawDate) return;
    if (historyAllWaves.length) {
      setHistoryLoading(false);
      return;
    }

    let active = true;
    setHistoryLoading(true);

    fetchStockWaveHistory(latestWave.rawDate)
      .then(({ rows, allRows }) => {
        if (!active) return;
        const nextAllRows = allRows?.length ? allRows : rows;
        setHistoryWaves(rows);
        setHistoryAllWaves(nextAllRows);
        setHistoryLoading(false);
      })
      .catch((error) => {
        if (active) setHistoryLoading(false);
        console.error("Load stock wave history failed", error);
      });

    return () => {
      active = false;
    };
  }, [latestWave.rawDate, historyAllWaves.length]);

  useEffect(() => {
    let active = true;
    const requestKey = tickerRequestKey;
    const requestId = tickerRequestSeq.current + 1;
    tickerRequestSeq.current = requestId;
    setTickerWave(EMPTY_WAVE);

    fetchStockWaveTickers(requestKey)
      .then((row) => {
        if (!active || tickerRequestSeq.current !== requestId) return;
        const exactRow = row && row.rawDate === requestKey ? row : null;
        setTickerWave(exactRow || EMPTY_WAVE);
      })
      .catch((error) => {
        if (active && tickerRequestSeq.current === requestId)
          console.error("Load stock wave ticker list failed", error);
      });

    return () => {
      active = false;
    };
  }, [tickerRequestKey]);

  return (
    <>
      <style>{`
        @import url('https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.19.0/iconfont/tabler-icons.min.css');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
        body{background:${T.bg};color:${T.t1};font-family:-apple-system,"Inter","Segoe UI",sans-serif;font-size:13px}
        button{font-family:inherit}
        ::-webkit-scrollbar{width:5px;height:4px}
        ::-webkit-scrollbar-thumb{background:${T.bdr};border-radius:3px}
        @media (max-width: 768px){
          body{overflow-x:hidden}
          .dosong-shell{display:block !important; width:100%; overflow-x:hidden}
          .dosong-main{width:100% !important; padding:0 !important; max-width:480px; margin:0 auto}
          .dosong-layout{display:grid !important; grid-template-columns:minmax(0,1fr) !important; gap:14px !important}
          .dosong-left,.dosong-right{min-width:0 !important; display:contents !important}
          .dosong-mobile-item{min-width:0}
          .dosong-order-main{order:1}
          .dosong-order-ai{order:2}
          .dosong-order-history{order:3}
          .dosong-order-chan{order:4}
          .dosong-order-chat{order:5}
          .dosong-order-list{order:6}
          .dosong-order-log{order:7}
          .dosong-layout table{font-size:12px}
          .dosong-layout th,.dosong-layout td{padding-left:7px !important; padding-right:7px !important}
          .chan-song-table-wrap{overflow-x:auto !important}
          .chan-song-table{width:100% !important; min-width:500px !important; table-layout:fixed !important}
          .chan-song-table th,.chan-song-table td{width:16.6667% !important; min-width:0 !important; padding-left:3px !important; padding-right:3px !important; text-align:center !important; overflow:visible !important; text-overflow:clip !important}
          .chan-song-table th:first-child,.chan-song-table td:first-child{text-align:left !important}
          .chan-song-table th:last-child,.chan-song-table td:last-child{text-align:right !important}
          .vtds-card{padding:16px 17px !important; max-width:none !important}
          .vtds-header{align-items:flex-start !important; gap:10px !important; margin-bottom:14px !important; flex-wrap:wrap !important}
          .vtds-title{white-space:normal !important; flex-wrap:wrap !important; font-size:16px !important; min-width:0 !important}
          .vtds-trust{padding:7px 13px !important; font-size:13px !important}
          .vtds-body{flex-direction:column !important; align-items:center !important; gap:16px !important; overflow:visible !important}
          .vtds-svg{width:170px !important; height:170px !important}
          .vtds-boxes{width:100% !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:10px !important}
          .vtds-box{border-radius:14px !important; padding:14px 16px !important; min-height:auto !important}
          .lsds-card{padding:16px 17px !important}
          .lsds-days-scroll{overflow-x:visible !important; overflow-y:visible !important; padding-bottom:0}
          .lsds-days-grid{grid-template-columns:repeat(3,minmax(0,1fr)) !important; min-width:0 !important; gap:7px !important}
          .lsds-day{padding:10px 6px !important; border-radius:12px !important}
          .lsds-donut{width:88px !important; height:88px !important; margin:6px auto 3px !important}
          .lsds-metric-grid{gap:4px !important; margin:5px 0 7px !important}
          .lsds-metric{gap:4px !important; border-radius:7px !important; padding:5px 4px !important; min-width:0 !important}
          .lsds-metric-value{font-size:12px !important}
          .lsds-loading-card{padding:10px 6px !important; border-radius:12px !important}
          .lsds-loading-donut-wrap{width:88px !important; height:88px !important; margin:6px auto 3px !important}
          .lsds-loading-donut{width:88px !important; height:88px !important}
          .lsds-loading-metric-grid{gap:4px !important; margin:5px 0 7px !important}
          .lsds-loading-metric{border-radius:7px !important; padding:6px 4px !important; min-width:0 !important}
        }
        @media (max-width: 560px){
          .dosong-main{padding-left:0 !important; padding-right:0 !important}
          .dosong-layout{gap:12px !important}
        }
      `}</style>

      <div
        className="dosong-shell"
        data-theme={theme}
        style={{
          "--bg": T.bg,
          "--surf": T.surf,
          "--elev": T.elev,
          "--bdr": T.bdr,
          "--bdrs": T.bdrs,
          "--t1": T.t1,
          "--t2": T.t2,
          "--t3": T.t3,
          "--t4": T.t4,
          "--G": T.G,
          "--Gs": T.Gs,
          "--Gb": T.Gb,
          "--MU": T.MU,
          "--MUs": T.MUs,
          "--MUb": T.MUb,
          "--B": T.B,
          "--Bs": T.Bs,
          "--Bb": T.Bb,
          "--A": T.A,
          "--As": T.As,
          "--Ab": T.Ab,
          "--R": T.R,
          "--Rs": T.Rs,
          "--Rb": T.Rb,
          "--P": T.P,
          "--Ps": T.Ps,
          "--Pb": T.Pb,
          "--premium-bg":
            theme === "light"
              ? "linear-gradient(135deg,#F4EDFF,#FFFFFF)"
              : "linear-gradient(135deg,#2D1B69,#1A0E40)",
          "--premium-border": theme === "light" ? "rgba(109,40,217,.18)" : T.Bb,
          "--premium-copy": theme === "light" ? T.t3 : T.t2,
          background: T.bg,
          color: T.t1,
          fontFamily: '-apple-system,"Inter","Segoe UI",sans-serif',
          fontSize: 13,
          display: "flex",
          minHeight: "100vh",
        }}
      >
        <main
          className="dosong-main"
          style={{ flex: 1, minWidth: 0, padding: 0 }}
        >
          {/* 60/40 content layout */}
          <div
            className="dosong-layout"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
              gap: 14,
            }}
          >
            {/* CỘT TRÁI */}
            <div
              className="dosong-left"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {/* Vòng tròn dò sóng */}
              <div className="dosong-mobile-item dosong-order-main">
                <MainDonut
                  d={selectedMainDonutWave}
                  theme={theme}
                  dateControl={
                    <DateTimeTravel
                      value={dateTravelValue}
                      minDate={dateTravelMinDate}
                      maxDate={dateTravelMaxDate}
                      onChange={(date) => {
                        const key = formatDateKey(date);
                        const matched = dateTravelWaves.find(
                          (item) => item.rawDate === key,
                        );
                        if (matched) {
                          setSelectedWaveDate(matched.rawDate);
                          setSignalRefreshKey((value) => value + 1);
                        }
                      }}
                    />
                  }
                />
              </div>

              {/* Lịch sử dò sóng */}
              <div className="dosong-mobile-item dosong-order-history">
                <HistNavigator
                  data={selectedHistoryDisplayWaves}
                  totalDays={selectedHistoryDisplayWaves.length}
                  theme={theme}
                  loading={
                    historyLoading && !selectedHistoryDisplayWaves.length
                  }
                  onRefresh={refreshHistoryFromTitle}
                />
              </div>

              {/* Lịch sử chân sóng */}
              <div className="dosong-mobile-item dosong-order-chan">
                <ChanSong
                  data={selectedChanSongRows}
                  onRefresh={refreshChanSongFromTitle}
                />
              </div>
            </div>

            {/* CỘT PHẢI */}
            <div
              className="dosong-right"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                minWidth: 0,
              }}
            >
              <div className="dosong-mobile-item dosong-order-ai">
                <KhuyenNghiTuVanAI
                  waitbuy={selectedMainDonutWave.cm}
                  buy={selectedMainDonutWave.mu}
                  refreshKey={signalRefreshKey}
                  checkDate={selectedMainDonutWave.rawDate}
                  realtime={
                    selectedMainDonutWave.rawDate === latestWave.rawDate
                  }
                  doSongAdvice={selectedDoSongAdvice}
                  adviceMode={selectedAdviceMode}
                  theme={theme}
                />
              </div>
              <div className="dosong-mobile-item dosong-order-chat">
                <TuVanAiCard />
              </div>
              <div className="dosong-mobile-item dosong-order-list">
                <DanhMucDoSong
                  wave={danhMucWave}
                  countWave={selectedMainDonutWave}
                />
              </div>
              <div className="dosong-mobile-item dosong-order-log">
                <NhatKyTinHieu
                  rows={displayStockNotiRows}
                  theme={theme}
                  dateKey={stockNotiDate}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
