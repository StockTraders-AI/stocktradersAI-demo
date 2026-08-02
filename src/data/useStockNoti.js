import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJsonWithClientCache } from "./requestCache";
import { formatTimeOfDay, pickTimeField, toDateInputValue } from "../app/dateUtils";

const API_URL = "/api/stock-noti";
const REPLY_KEYS = ["StockNotiReply", "StockNotiRequest"];

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return data || {};
}

function firstString(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function normalizeCap(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["thi_truong", "thị trường", "thi truong", "market", "tt"].includes(raw) || raw.includes("market") || raw.includes("thi_truong") || raw.includes("thitruong")) return "thi_truong";
  if (["nganh", "ngành", "industry", "branch"].includes(raw) || raw.includes("nganh") || raw.includes("industry") || raw.includes("branch")) return "nganh";
  if (["ma", "mã", "co phieu", "cổ phiếu", "stock", "ticker"].includes(raw) || raw.includes("ticker") || raw.includes("stock") || raw.includes("symbol")) return "ma";
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
        const params = new URLSearchParams({ date: dateValue });
        if (force) {
          params.set("fresh", "1");
          params.set("_", String(Date.now()));
        }
        const json = await fetchJsonWithClientCache(`${API_URL}?${params.toString()}`, { force });
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
  }, [fetchSnapshot]);

  return { rows, status, error, updatedAt, refresh: () => fetchSnapshot({ force: true }) };
}
