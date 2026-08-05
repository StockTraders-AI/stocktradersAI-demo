import { sendJson } from "./stockWaveHistoryCache.js";

const DEFAULT_CHATWEB_API_BASE_URL = "http://112.213.91.235:8000";

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw.trim() ? JSON.parse(raw) : {};
}

export async function handleConditionSignalLatest(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method !== "GET" || url.pathname !== "/api/condition-signal-latest") {
    return false;
  }

  const chatwebBaseUrl = (process.env.CHATWEB_API_BASE_URL || DEFAULT_CHATWEB_API_BASE_URL).replace(/\/$/, "");
  const signalKey = url.searchParams.get("signal_key") || "waitbuy_over_threshold";
  const flowId = url.searchParams.get("flow_id");
  const checkDate = url.searchParams.get("check_date") || url.searchParams.get("date");
  const waitbuy = url.searchParams.get("waitbuy");
  const buy = url.searchParams.get("buy");
  const targetUrl = new URL(`${chatwebBaseUrl}/public/condition-signals/latest`);

  targetUrl.searchParams.set("signal_key", signalKey);
  if (flowId) targetUrl.searchParams.set("flow_id", flowId);
  if (checkDate) targetUrl.searchParams.set("check_date", checkDate);
  if (waitbuy) targetUrl.searchParams.set("waitbuy", waitbuy);
  if (buy) targetUrl.searchParams.set("buy", buy);

  try {
    const upstream = await fetch(targetUrl);
    const data = await upstream.json().catch(() => ({}));

    sendJson(res, upstream.ok ? 200 : upstream.status, {
      ok: upstream.ok && data?.ok !== false,
      title: data?.title || null,
      response: data?.response || null,
      recommendation: data?.recommendation || null,
      check_date: data?.check_date || null,
    });
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      title: null,
      response: null,
      recommendation: null,
      error: error.message || "Cannot load condition signal",
    });
  }

  return true;
}


export async function handleDoSongAdvice(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method !== "POST" || url.pathname !== "/api/do-song-advice") {
    return false;
  }

  const chatwebBaseUrl = (process.env.CHATWEB_API_BASE_URL || DEFAULT_CHATWEB_API_BASE_URL).replace(/\/$/, "");

  try {
    const body = await readJsonBody(req);
    const upstream = await fetch(`${chatwebBaseUrl}/public/do-song-advice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await upstream.json().catch(() => ({}));

    sendJson(res, upstream.ok ? 200 : upstream.status, {
      ok: upstream.ok && data?.ok !== false,
      title: data?.title || null,
      response: data?.response || null,
      recommendation: data?.recommendation || null,
      check_date: data?.check_date || null,
      source: data?.source || null,
      flow_id: data?.flow_id || null,
      signal_keys: data?.signal_keys || [],
      maTrangThai: data?.maTrangThai || null,
      pha: data?.pha || null,
    });
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      title: null,
      response: null,
      recommendation: null,
      error: error.message || "Cannot load do song advice",
    });
  }

  return true;
}
