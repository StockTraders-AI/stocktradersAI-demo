/**
 * Proxy for the new stocktraders-mcp webapp's BYOK key storage
 * (POST /auth/key, GET /auth/key/status, DELETE /auth/key). Split into 3
 * exported handlers (save/status/delete) since neither this app's
 * api/market helpers nor its api/data.js secure-proxy wrap DELETE - delete
 * is triggered by a POST from the frontend and issues a real DELETE to the
 * webapp internally.
 *
 * These handlers are path-agnostic (no internal pathname check) because
 * they're invoked from two different callers with two different internal
 * req.url conventions: the direct api/market/ai-key*.js Vercel-style
 * routes, and api/data.js's secure-proxy (which rewrites req.url to its
 * own /api/market-ai-key* path before calling in). Routing correctness is
 * guaranteed by each caller's own registration, not by these functions.
 */
const NEW_CHAT_API_BASE_URL = (process.env.NEW_CHAT_API_BASE_URL || "").replace(/\/$/, "");

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(JSON.parse(req.body || "{}"));
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getQuery(req, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  return url.searchParams;
}

export async function handleAiKeySave(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }
  if (!NEW_CHAT_API_BASE_URL) {
    sendJson(res, 503, { success: false, error: "NEW_CHAT_API_BASE_URL chua duoc cau hinh tren server." });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body.api_key || "").trim();
    if (!apiKey) {
      sendJson(res, 400, { success: false, error: "Thieu api_key." });
      return true;
    }
    const response = await fetch(`${NEW_CHAT_API_BASE_URL}/auth/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: body.user_id || "u1",
        provider: body.provider || "openai",
        api_key: apiKey,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendJson(res, response.status, { success: false, error: payload.detail || payload.error || "Luu key that bai." });
      return true;
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("AI key save proxy failed", error);
    sendJson(res, 502, { success: false, error: error.message || "Cannot reach webapp." });
  }
  return true;
}

export async function handleAiKeyStatus(req, res, rawUrl) {
  if (!NEW_CHAT_API_BASE_URL) {
    sendJson(res, 503, { success: false, error: "NEW_CHAT_API_BASE_URL chua duoc cau hinh tren server." });
    return true;
  }
  try {
    const query = getQuery(req, rawUrl);
    const userId = query.get("user_id") || (req.body && req.body.user_id) || "u1";
    const provider = query.get("provider") || (req.body && req.body.provider) || "openai";
    const params = new URLSearchParams({ user_id: userId, provider });
    const response = await fetch(`${NEW_CHAT_API_BASE_URL}/auth/key/status?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    sendJson(res, response.ok ? 200 : response.status, payload);
  } catch (error) {
    console.error("AI key status proxy failed", error);
    sendJson(res, 502, { success: false, error: error.message || "Cannot reach webapp." });
  }
  return true;
}

export async function handleAiKeyDelete(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }
  if (!NEW_CHAT_API_BASE_URL) {
    sendJson(res, 503, { success: false, error: "NEW_CHAT_API_BASE_URL chua duoc cau hinh tren server." });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    const userId = body.user_id || "u1";
    const provider = body.provider || "openai";
    const params = new URLSearchParams({ user_id: userId, provider });
    const response = await fetch(`${NEW_CHAT_API_BASE_URL}/auth/key?${params.toString()}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendJson(res, response.status, { success: false, error: payload.detail || payload.error || "Xoa key that bai." });
      return true;
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("AI key delete proxy failed", error);
    sendJson(res, 502, { success: false, error: error.message || "Cannot reach webapp." });
  }
  return true;
}
