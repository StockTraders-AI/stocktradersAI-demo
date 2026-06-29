export const DEFAULT_REALTIME_URL = "http://112.213.91.235:3005/realtime";

export function resolveRealtimeUrl(...candidates) {
  const configured = candidates
    .map((value) => String(value || "").trim())
    .find(Boolean);

  return configured || DEFAULT_REALTIME_URL;
}
