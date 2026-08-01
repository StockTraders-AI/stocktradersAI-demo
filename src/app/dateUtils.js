export function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return date.slice(0, 10);
}

export function sortDatesDesc(dates) {
  return [...dates].sort((a, b) => toDateInputValue(b).localeCompare(toDateInputValue(a)));
}

export function findDateIndex(datesDesc, dateValue) {
  if (!dateValue || datesDesc.length === 0) return -1;
  const exactIndex = datesDesc.findIndex((date) => toDateInputValue(date) === dateValue);
  if (exactIndex >= 0) return exactIndex;
  const previousIndex = datesDesc.findIndex((date) => toDateInputValue(date) <= dateValue);
  return previousIndex === -1 ? datesDesc.length - 1 : previousIndex;
}

/* ───────────────────────────────────────────────────────────────────────
 * Giờ trong ngày (HH:mm)
 *
 * Các API hiện trả `date` dạng chỉ-ngày ("2026-07-31" hoặc "31/07/2026"),
 * nên phần lớn bản ghi không có giờ. Hai helper dưới đây tách giờ ra khi
 * dữ liệu thực sự có — chấp nhận cả datetime ("2026-07-31 14:46:00") lẫn
 * field giờ riêng — để không phải đoán/hardcode ở tầng hiển thị.
 * ─────────────────────────────────────────────────────────────────────── */

const TIME_FIELDS = [
  "time",
  "datetime",
  "dateTime",
  "tradingTime",
  "signalTime",
  "updateTime",
  "updatedTime",
  "createdTime",
  "timestamp",
  "date",
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatTimeOfDay(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  if (typeof value !== "string") return "";
  const match = value.match(/(?:^|[ T])(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${pad2(hour)}:${pad2(minute)}` : "";
}

// Trả về chuỗi giờ gốc đầu tiên tìm được trong item, "" nếu item chỉ có ngày.
// Dùng ở tầng chuẩn hoá để giữ lại giờ mà không phải cache nguyên payload.
export function pickTimeField(item) {
  if (!item || typeof item !== "object") return "";
  for (const field of TIME_FIELDS) {
    if (formatTimeOfDay(item[field])) return String(item[field]);
  }
  return "";
}
