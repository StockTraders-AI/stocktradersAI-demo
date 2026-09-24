/**
 * Portfolio-chat handler for the market-flow tab ONLY - always calls the
 * new stocktraders-mcp webapp (BYOK), no fallback to the old chatbotgpt
 * /api/portfolio-chat. Kept as its own file, separate from
 * server/do-song/portfolioChatApi.js, because that file is also used by
 * the dashboard's /api/portfolio-chat route, which must keep calling the
 * old chatbotgpt backend unchanged.
 */
const NEW_CHAT_API_BASE_URL = (process.env.NEW_CHAT_API_BASE_URL || "").replace(/\/$/, "");
const NEW_CHAT_PROVIDER = process.env.NEW_CHAT_PROVIDER || "openai";
const PORTFOLIO_CHAT_TIMEOUT_MS = Math.max(
  15_000,
  Number(process.env.PORTFOLIO_CHAT_TIMEOUT_MS) || 240_000,
);

function withTimeout(options = {}) {
  if (
    typeof AbortSignal === "undefined" ||
    typeof AbortSignal.timeout !== "function"
  )
    return options;
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
  if (req.body && typeof req.body === "object")
    return Promise.resolve(req.body);
  if (typeof req.body === "string")
    return Promise.resolve(JSON.parse(req.body || "{}"));
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

export async function handleMarketPortfolioChat(req, res, rawUrl) {
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
    const question = String(body.question || "").trim();
    if (!question) {
      sendJson(res, 400, { success: false, error: "Missing question." });
      return true;
    }

    const userId = body.user_id || "u1";
    const conversationId = body.conversation_id || "portfolio-test-1";

    const response = await fetch(
      `${NEW_CHAT_API_BASE_URL}/chat`,
      withTimeout({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          message: question,
          provider: NEW_CHAT_PROVIDER,
          history: Array.isArray(body.history) ? body.history : [],
        }),
      }),
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendJson(res, response.status, {
        success: false,
        error:
          payload.error ||
          payload.detail ||
          payload.message ||
          `Portfolio chat failed: ${response.status}`,
      });
      return true;
    }

    sendJson(res, 200, {
      answer: typeof payload.answer === "string" ? payload.answer : "",
      conversation_id: payload.conversation_id || conversationId,
      usage: payload.usage || null,
    });
  } catch (error) {
    console.error("Market portfolio chat proxy failed", error);
    const isTimeout =
      error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, isTimeout ? 504 : 502, {
      success: false,
      error: error.message || "Cannot call portfolio chat.",
    });
  }

  return true;
}
