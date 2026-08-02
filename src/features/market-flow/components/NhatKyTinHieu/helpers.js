export const NHAT_KY_TABS = [
  ["all", "Tất cả"],
  ["thi_truong", "Thị trường"],
  ["nganh", "Ngành"],
  ["ma", "Mã"],
];

export const NHAT_KY_CAP = {
  thi_truong:"Thị trường",
  nganh:"Ngành",
  ma:"Mã",
};

export const NHAT_KY_DARK_COLORS = {
  mode:"dark",
  t1:"#F0F4FF", t2:"#A8B8D0", t4:"#5C7090",
  surf:"#111520", elev:"#171D2E", cbdr:"#1E2A3E", bdrs:"#1A2232",
  B:"#A78BFA", Bd:"#7C3AED",
  cmb:"#0A2318", cmd:"#0F3D22", cmc:"#3DD68C",
  cbb:"#2B1800", cbd:"#4A2E00", cbc:"#FF9F0A",
  bab:"#200A0E", bad:"#3D1018", bac:"#FF2D55",
  pb:"rgba(124,58,237,.16)", pd:"#5B21B6",
};

export const NHAT_KY_LIGHT_COLORS = {
  mode:"light",
  t1:"#111827", t2:"#5B6472", t4:"#8A94A6",
  surf:"#FFFFFF", elev:"#F6F7FC", cbdr:"#DDE3EF", bdrs:"#E8ECF4",
  B:"#7C3AED", Bd:"#7C3AED",
  cmb:"#EAF8EF", cmd:"#BFEACF", cmc:"#16A05D",
  cbb:"#FFF7E6", cbd:"#F3CE8B", cbc:"#D97706",
  bab:"#FFECEF", bad:"#F5B8C3", bac:"#E11D48",
  pb:"rgba(124,58,237,.10)", pd:"#7C3AED",
};

export function getStockNotiRawDate(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

export function getStockNotiStableId(row) {
  return [row?.sortKey || row?.date || "", row?.title || "", row?.capTag || row?.cap || "", row?.x || row?.content || ""]
    .map((part) => String(part).trim())
    .join("|");
}

export function mergeStockNotiRows(current, incoming) {
  const byId = new Map();
  [...incoming, ...current].forEach((row) => {
    const id = getStockNotiStableId(row);
    if (!id) return;
    if (!byId.has(id)) byId.set(id, { ...row, id });
  });
  return [...byId.values()].sort((a, b) => String(b.sortKey || b.id).localeCompare(String(a.sortKey || a.id)));
}

export function pickStockNotiRowsForDate(rows, dateKey) {
  if (!dateKey) return rows;
  const datedRows = rows.filter((row) => row.rawDate && row.rawDate <= dateKey);
  if (!datedRows.length) return [];
  const sourceDate = datedRows.reduce((latest, row) => row.rawDate > latest ? row.rawDate : latest, "");
  return datedRows.filter((row) => row.rawDate === sourceDate);
}

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function normalizeStockNotiType(type, fallbackTitle = "") {
  const key = normalizeSearchText(type || fallbackTitle);
  if (key.includes("nganh")) return "nganh";
  if (key.includes("co phieu") || key.includes("ma")) return "ma";
  return "thi_truong";
}

export function getStockNotiCapTag(cap) {
  if (cap === "ma") return "Cổ phiếu";
  if (cap === "nganh") return "Ngành";
  return "Thị trường";
}

export function formatStockNotiTime(value) {
  const text = String(value || "");
  const match = text.match(/(?:^|[ T])(\d{2}:\d{2})/);
  if (match) return match[1];
  const date = new Date(text.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", { hour:"2-digit", minute:"2-digit", hour12:false }).format(date);
}

export function formatStockNotiDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(text.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date());
  return new Intl.DateTimeFormat("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" }).format(date);
}

export function getSmdtValue(content) {
  const normalized = normalizeSearchText(content);
  const match = normalized.match(/smdt[^0-9-]*(-?\d+(?:[.,]\d+)?)\s*%/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function getStockNotiKind(row) {
  const title = normalizeSearchText(row?.title);
  const content = normalizeSearchText(row?.content);
  if (title.includes("smdt")) return "smdt";
  if (title.includes("dong tien")) {
    if (content.includes("thoat ra") || content.includes("rut ra") || content.includes("ban ra")) return "down";
    if (content.includes("do vao") || content.includes("vao") || content.includes("nhen nhom")) return "up";
  }
  if (title.includes("ban") || title.includes("thoat")) return "down";
  if (title.includes("canh bao")) return "warn";
  if (normalizeStockNotiType(row?.type, row?.title) === "thi_truong") return "wave";
  return "up";
}

export function getStockNotiRows(payload) {
  const reply = payload?.StockNotiReply || payload?.data?.StockNotiReply || payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(reply?.stockNotifications)) return reply.stockNotifications;
  return [];
}

export function normalizeStockNotiRows(payload) {
  return getStockNotiRows(payload)
    .map((row) => {
      const content = String(row?.content || row?.x || row?.txt || "").trim();
      const date = String(row?.date || payload?.sourceDate || payload?.requestedDate || "").trim();
      if (!content) return null;
      const cap = normalizeStockNotiType(row?.type ?? row?.cap, row?.title);
      return {
        id:getStockNotiStableId({ sortKey:date, title:row?.title || "", capTag:getStockNotiCapTag(cap), x:content }),
        t:row?.t || row?.time || formatStockNotiTime(date),
        date:row?.dateLabel || formatStockNotiDate(date),
        rawDate:row?.rawDate || getStockNotiRawDate(date),
        sortKey:row?.sortKey || date,
        cap,
        capTag:row?.capTag || getStockNotiCapTag(cap),
        k:row?.k || getStockNotiKind(row),
        title:String(row?.title || "Tín hiệu").trim() || "Tín hiệu",
        smdtValue:row?.smdtValue ?? getSmdtValue(content),
        x:content,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.sortKey || b.id).localeCompare(String(a.sortKey || a.id)));
}

export function getStockNotiUrl(dateKey, endpoint = "/api/stock-noti") {
  const url = new URL(endpoint, window.location.origin);
  if (dateKey) url.searchParams.set("date", dateKey);
  return url.toString();
}

export function fetchStockNoti(dateKey, { endpoint = "/api/stock-noti" } = {}) {
  return fetch(getStockNotiUrl(dateKey, endpoint))
    .then((response) => {
      if (!response.ok) throw new Error(`Stock notification failed: ${response.status}`);
      return response.json();
    })
    .then((payload) => normalizeStockNotiRows(payload));
}
