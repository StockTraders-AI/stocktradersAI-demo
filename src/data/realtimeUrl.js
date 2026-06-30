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
