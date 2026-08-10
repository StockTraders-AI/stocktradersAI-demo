import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { fetchDataPostWithClientCache } from "./requestCache";
import { REALTIME_RECONNECT_EVENT, emitRealtimeReconnected, resolveRealtimeUrl, shouldRunClientRefresh } from "./realtimeUrl";
import { formatTimeOfDay, pickTimeField, toDateInputValue } from "../app/dateUtils";

const API_URL = "/api/stock-noti";
const REPLY_KEYS = ["StockNotiReply", "StockNotiRequest"];
const CHANNELS = ["stock-noti"];

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return data || {};
}

function firstString(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function foldText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function normalizeCap(value) {
  const raw = foldText(value);
  if (!raw) return "";
  const compact = raw.replace(/[\s_-]+/g, "");
  if (["thitruong", "market", "tt"].includes(compact) || raw.includes("market")) return "thi_truong";
  if (["nganh", "industry", "branch"].includes(compact) || raw.includes("industry") || raw.includes("branch")) return "nganh";
  if (["ma", "cophieu", "stock", "ticker", "symbol"].includes(compact) || raw.includes("ticker") || raw.includes("stock") || raw.includes("symbol")) return "ma";
  return "";
}

function capFromPath(path) {
  return normalizeCap(path.join("_"));
}

function capTagFor(cap, item) {
  const raw = firstString(item?.type, item?.capTag, item?.tag, item?.groupName, item?.group);
  if (raw) return raw;
  if (cap === "thi_truong") return "Thị trường";
  if (cap === "nganh") return "Ngành";
  return "Cổ phiếu";
}

function toneFor(item, cap) {
  const raw = String(firstString(item?.tone, item?.toneKey, item?.signal, item?.sig, item?.action, item?.title, item?.content)).toLowerCase();
  if (raw === "1") return "up";
  if (raw === "2") return "down";
  if (raw.includes("ban") || raw.includes("bán") || raw.includes("sell") || raw.includes("thoát ra") || raw === "st" || raw === "down") return "down";
  if (raw.includes("warn") || raw.includes("canh") || raw.includes("cảnh") || raw === "so") return raw.includes("mua") || raw.includes("đổ vào") ? "up" : "warn";
  if (raw.includes("smdt")) return "smdt";
  if (raw.includes("mua") || raw.includes("buy") || raw.includes("đổ vào")) return "up";
  if (cap === "thi_truong" || raw.includes("wave") || raw.includes("song") || raw.includes("sóng")) return "wave";
  return "up";
}

function extractRows(data) {
  const reply = getReply(data);
  if (Array.isArray(reply?.stockNotifications)) {
    return reply.stockNotifications.map((item) => ({ item, capHint: item?.type || "" }));
  }

  const rows = [
    ...collectRows(reply, []),
    ...(reply === data ? [] : collectRows(data, [])),
  ];
  if (rows.length) return rows;
  if (reply && typeof reply === "object" && !reply.codeReply) return [reply];
  return [];
}

function collectRows(value, path = [], depth = 0) {
  if (!value || depth > 5) return [];
  if (Array.isArray(value)) {
    const objectItems = value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (objectItems.length && looksLikeNotificationArray(objectItems, path)) {
      const capHint = capFromPath(path);
      return objectItems.map((item) => ({ item, capHint }));
    }
    return value.flatMap((item, index) => collectRows(item, [...path, String(index)], depth + 1));
  }
  if (typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (key === "codeReply") return [];
    return collectRows(child, [...path, key], depth + 1);
  });
}

function looksLikeNotificationArray(items, path) {
  const pathText = path.join("_").toLowerCase();
  if (pathText.includes("noti") || pathText.includes("notification") || pathText.includes("alert")) return true;
  return items.some((item) => (
    item?.content != null ||
    item?.noiDung != null ||
    item?.message != null ||
    item?.description != null ||
    item?.title != null ||
    item?.tieuDe != null ||
    item?.notiContent != null ||
    item?.contentNoti != null
  ));
}

function normalizeItem(record, index, fallbackDate) {
  const item = record?.item || record;
  const capHint = record?.capHint || "";
  const cap = normalizeCap(item?.type || item?.cap || item?.level || item?.levelName || item?.category || item?.typeGroup || item?.groupType || item?.notiType || capHint)
    || (item?.industry || item?.branch || item?.branchName || item?.nganh ? "nganh" : item?.ticker || item?.symbol || item?.code || item?.keyValue ? "ma" : "thi_truong");
  const date = toDateInputValue(firstString(item?.date, item?.tradingDate, item?.createdDate, item?.createdAt, item?.updatedAt, item?.time, fallbackDate));
  const ticker = firstString(item?.ticker, item?.symbol, item?.code, item?.stock, item?.keyValue);
  const title = firstString(item?.title, item?.tieuDe, item?.name, item?.subject, item?.header, item?.typeName)
    || (ticker ? `Tín hiệu ${ticker}` : cap === "thi_truong" ? "Tín hiệu thị trường" : "Cảnh báo tín hiệu");
  const text = firstString(item?.content, item?.noiDung, item?.message, item?.description, item?.body, item?.text, item?.note, item?.noti, item?.notiContent, item?.contentNoti)
    || title;
  const time = formatTimeOfDay(pickTimeField(item)) || formatTimeOfDay(item?.date) || formatTimeOfDay(item?.createdDate) || formatTimeOfDay(item?.createdAt) || formatTimeOfDay(item?.updatedAt);

  return {
    id: firstString(item?.id, item?.notiId, item?.key) || `${date}-${cap}-${title}-${index}`,
    cap,
    capTag: capTagFor(cap, item),
    k: toneFor(item, cap),
    t: time,
    sortDate: date,
    title,
    x: text,
    smdtValue: Number.isFinite(Number(item?.smdt ?? item?.value)) ? Number(item?.smdt ?? item?.value) : undefined,
    raw: item,
  };
}

function normalize(data, fallbackDate) {
  return extractRows(data)
    .map((item, index) => normalizeItem(item, index, fallbackDate))
    .filter((item) => item.title || item.x);
}

function rowKey(row) {
  return row?.id || `${row?.sortDate || ""}-${row?.cap || ""}-${row?.title || ""}-${row?.x || ""}`;
}

function mergeRows(baseRows = [], patchRows = []) {
  const patchKeys = new Set(patchRows.map(rowKey));
  return [
    ...patchRows,
    ...baseRows.filter((row) => !patchKeys.has(rowKey(row))),
  ];
}

function extractRealtimeRows(payload, fallbackDate) {
  if (!payload) return [];

  if (typeof payload === "string") {
    try {
      return extractRealtimeRows(JSON.parse(payload), fallbackDate);
    } catch {
      return [];
    }
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extractRealtimeRows(item, fallbackDate));
  }

  if (payload?.channel && !CHANNELS.includes(payload.channel)) return [];
  const data = CHANNELS.includes(payload?.channel) && payload?.data ? payload.data : payload;
  const rows = normalize(data, fallbackDate);
  return fallbackDate ? rows.filter((row) => !row.sortDate || row.sortDate === fallbackDate) : rows;
}

export function useStockNoti(date) {
  const dateValue = toDateInputValue(date);
  const inFlightRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(dateValue ? "loading" : "idle");
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const fetchSnapshot = useCallback(async ({ force = false } = {}) => {
    if (!dateValue) {
      setRows([]);
      setStatus("idle");
      return null;
    }
    if (inFlightRef.current && !force) return inFlightRef.current;

    const request = (async () => {
      setStatus((current) => (current === "ready" && !force ? "ready" : "loading"));
      try {
        const json = await fetchDataPostWithClientCache(
          API_URL,
          { date: dateValue, ...(force ? { fresh: true } : {}) },
          { force }
        );
        const code = getReply(json)?.codeReply?.codeID;
        if (code && code !== "S0000") throw new Error(`API ${code}`);
        setRows(normalize(json, dateValue));
        setUpdatedAt(new Date());
        setStatus("ready");
        setError(null);
      } catch (err) {
        console.error("StockNoti Fetch error:", err);
        setRows([]);
        setStatus("error");
        setError(err.message || "Lỗi tải dữ liệu");
      } finally {
        if (inFlightRef.current === request) inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [dateValue]);

  useEffect(() => {
    fetchSnapshot();
    const refresh = () => {
      if (document.visibilityState === "visible" && shouldRunClientRefresh(`stock-noti:${dateValue || "all"}`)) {
        fetchSnapshot({ force: true });
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(REALTIME_RECONNECT_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(REALTIME_RECONNECT_EVENT, refresh);
    };
  }, [fetchSnapshot]);

  const applyTick = useCallback((payload) => {
    const tickRows = extractRealtimeRows(payload, dateValue);
    if (!tickRows.length) return;

    const now = new Date();
    setRows((current) => mergeRows(current, tickRows));
    setUpdatedAt(now);
    setStatus("ready");
    setError(null);
  }, [dateValue]);

  return { rows, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }), applyTick };
}

function getRealtimeUrl() {
  return resolveRealtimeUrl(import.meta.env.VITE_STOCK_NOTI_WS_URL, import.meta.env.VITE_SMDT_WS_URL);
}

export function useRealtimeStockNotiFeed(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), { autoConnect: true, transports: ["websocket"] });

    const handlePayload = (payload) => {
      if (extractRealtimeRows(payload).length > 0) cbRef.current?.(payload);
    };

    let hadConnected = false;
    socket.on("connect", () => {
      console.log("Socket.IO (stock noti) connected to namespace:", socket.nsp);
      setConnected(true);
      socket.emit("message", { action: "subscribe", channels: CHANNELS });
      if (hadConnected) emitRealtimeReconnected();
      hadConnected = true;
    });

    socket.on("message", handlePayload);
    socket.on("connect_error", (error) => console.error("Socket.IO (stock noti) connection error:", error.message));
    socket.on("disconnect", () => setConnected(false));

    return () => socket.disconnect();
  }, []);

  return { connected };
}
