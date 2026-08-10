import branchPathHandler from "./branch-path.js";
import cashflowBranchHandler from "./cashflow-branch.js";
import cashflowTickerHandler from "./cashflow-ticker.js";
import indexDailyChangesHandler from "./index-daily-changes.js";
import performanceHandler from "./performance.js";
import { readJsonBody } from "./_request.js";
import smdtHandler from "./smdt.js";
import smdtTickerHandler from "./smdt-ticker.js";
import stockNotiHandler from "./stock-noti.js";
import stockSignalHandler from "./stock-signal.js";
import stockWaveHandler from "./stock-wave.js";
import totalTradeHandler from "./total-trade.js";
import totalTradeRealHandler from "./total-trade-real.js";

const ROUTES = new Map([
  ["branch-path", { path: "/api/branch-path", handler: branchPathHandler }],
  ["cashflow-branch", { path: "/api/cashflow-branch", handler: cashflowBranchHandler }],
  ["cashflow-ticker", { path: "/api/cashflow-ticker", handler: cashflowTickerHandler }],
  ["index-daily-changes", { path: "/api/index-daily-changes", handler: indexDailyChangesHandler }],
  ["performance", { path: "/api/performance", handler: performanceHandler }],
  ["smdt", { path: "/api/smdt", handler: smdtHandler }],
  ["smdt-ticker", { path: "/api/smdt-ticker", handler: smdtTickerHandler }],
  ["stock-noti", { path: "/api/stock-noti", handler: stockNotiHandler }],
  ["stock-signal", { path: "/api/stock-signal", handler: stockSignalHandler }],
  ["stock-wave", { path: "/api/stock-wave", handler: stockWaveHandler }],
  ["total-trade", { path: "/api/total-trade", handler: totalTradeHandler }],
  ["total-trade-real", { path: "/api/total-trade-real", handler: totalTradeRealHandler }],
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizeRoute(value) {
  return String(value || "").trim().replace(/^\/api\//, "");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const route = ROUTES.get(normalizeRoute(body.route));
  if (!route) {
    return sendJson(res, 404, { error: "Data route not found" });
  }

  const params = body.params && typeof body.params === "object" ? body.params : {};
  req.url = route.path;
  req.query = params;
  req.body = params;

  return route.handler(req, res);
}
