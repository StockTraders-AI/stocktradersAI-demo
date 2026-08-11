const PORTFOLIO_CHAT_API_URL = process.env.PORTFOLIO_CHAT_API_URL || "http://112.213.91.235:8000/api/portfolio-chat";
const PORTFOLIO_CHAT_TIMEOUT_MS = Math.max(15_000, Number(process.env.PORTFOLIO_CHAT_TIMEOUT_MS) || 120_000);

function withTimeout(options = {}) {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return options;
  return { ...options, signal: AbortSignal.timeout(PORTFOLIO_CHAT_TIMEOUT_MS) };
}

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

export async function handlePortfolioChat(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/api/portfolio-chat") return false;

  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const question = String(body.question || "").trim();
    if (!question) {
      sendJson(res, 400, { success: false, error: "Missing question." });
      return true;
    }

    const upstreamBody = {
      question,
      user_id: body.user_id || "u1",
      conversation_id: body.conversation_id || "portfolio-test-1",
    };
    if (body.portfolio && typeof body.portfolio === "object") {
      upstreamBody.portfolio = body.portfolio;
    }

    const response = await fetch(PORTFOLIO_CHAT_API_URL, withTimeout({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
    }));

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendJson(res, response.status, {
        success: false,
        error: payload.error || payload.message || `Portfolio chat failed: ${response.status}`,
      });
      return true;
    }

    sendJson(res, 200, {
      answer: typeof payload.answer === "string" ? payload.answer : "",
      conversation_id: payload.conversation_id || body.conversation_id || "portfolio-test-1",
    });
  } catch (error) {
    console.error("Portfolio chat proxy failed", error);
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, isTimeout ? 504 : 502, { success: false, error: error.message || "Cannot call portfolio chat." });
  }

  return true;
}
