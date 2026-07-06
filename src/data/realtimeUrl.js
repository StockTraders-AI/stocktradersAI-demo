export const DEFAULT_REALTIME_URL = "http://112.213.91.235:3005/realtime";
export const DEFAULT_REALTIME_PROXY_URL = "/realtime";

export function resolveRealtimeUrl(...candidates) {
  const configured = candidates
    .map((value) => String(value || "").trim())
    .find(Boolean);

  const target = configured || DEFAULT_REALTIME_URL;
  if (typeof window !== "undefined" && window.location.protocol === "https:" && target.startsWith("http://")) {
    return DEFAULT_REALTIME_PROXY_URL;
  }
  return target;
}

/* Sự kiện toàn cục báo socket realtime vừa reconnect: các data hook lắng nghe để
 * fetch lại snapshot bù dữ liệu hụt trong lúc mất kết nối (thay cho polling). */
export const REALTIME_RECONNECT_EVENT = "realtime:reconnected";

export function emitRealtimeReconnected() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REALTIME_RECONNECT_EVENT));
  }
}
