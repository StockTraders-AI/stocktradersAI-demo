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
const REALTIME_RECONNECT_THROTTLE_MS = 30_000;
const CLIENT_REFRESH_THROTTLE_MS = 20_000;
const lastClientRefreshAt = new Map();
let lastRealtimeReconnectAt = 0;

export function shouldRunClientRefresh(key, minDelayMs = CLIENT_REFRESH_THROTTLE_MS) {
  if (typeof window === "undefined") return true;

  const now = Date.now();
  const last = lastClientRefreshAt.get(key) || 0;
  if (now - last < minDelayMs) return false;

  lastClientRefreshAt.set(key, now);
  return true;
}

export function emitRealtimeReconnected() {
  if (typeof window !== "undefined") {
    const now = Date.now();
    if (now - lastRealtimeReconnectAt < REALTIME_RECONNECT_THROTTLE_MS) return;
    lastRealtimeReconnectAt = now;
    window.dispatchEvent(new Event(REALTIME_RECONNECT_EVENT));
  }
}
