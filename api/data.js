import branchPathHandler from "./branch-path.js";
import cashflowBranchHandler from "./cashflow-branch.js";
import cashflowTickerHandler from "./cashflow-ticker.js";
import conditionSignalLatestHandler from "./condition-signal-latest.js";
import doSongAdviceHandler from "./do-song-advice.js";
import indexDailyChangesHandler from "./index-daily-changes.js";
import performanceHandler from "./performance.js";
import portfolioChatHandler from "./portfolio-chat.js";
import { readJsonBody } from "./_request.js";
import smdtHandler from "./smdt.js";
import smdtBranchCrossHandler from "./smdt-branch-cross.js";
import smdtTickerHandler from "./smdt-ticker.js";
import smdtTickerCrossHandler from "./smdt-ticker-cross.js";
import stockNotiHandler from "./stock-noti.js";
import stockSignalHandler from "./stock-signal.js";
import stockWaveCurrentHandler from "./stock-wave-current.js";
import stockWaveHistoryHandler from "./stock-wave-history.js";
import stockWaveTickersHandler from "./stock-wave-tickers.js";
import stockWaveHandler from "./stock-wave.js";
import totalTradeHandler from "./total-trade.js";
import totalTradeRealHandler from "./total-trade-real.js";
import waveBottomConfirmPairsHandler from "./wave-bottom-confirm-pairs.js";
import { handleDoSongRecommendation } from "../embedded/stocktraders-web/doSongRecommendationDb.js";
import {
  handleStockWaveCurrent as doSongStockWaveCurrentHandler,
} from "../embedded/stocktraders-web/stockWaveCurrentCache.js";
import {
  handleStockWaveHistory as doSongStockWaveHistoryHandler,
} from "../embedded/stocktraders-web/stockWaveHistoryCache.js";
import {
  handleStockWaveTickers as doSongStockWaveTickersHandler,
} from "../embedded/stocktraders-web/stockWaveTickersCache.js";
import {
  handleStockNoti as doSongStockNotiHandler,
} from "../embedded/stocktraders-web/stockNotiCache.js";
import {
  handleWaveBottomConfirmPairs as doSongWaveBottomConfirmPairsHandler,
} from "../embedded/stocktraders-web/waveBottomConfirmPairsCache.js";

function doSongRecommendationHandler(req, res) {
  const method = req.method;
  req.method = "GET";
  return Promise.resolve(handleDoSongRecommendation(req, res, req.url)).finally(() => {
    req.method = method;
  });
}

function doSongStockNotiDataHandler(req, res) {
  const method = req.method;
  req.method = "GET";
  return Promise.resolve(doSongStockNotiHandler(req, res, req.url)).finally(() => {
    req.method = method;
  });
}

const ROUTES = new Map([
  ["branch-path", { path: "/api/branch-path", handler: branchPathHandler }],
  ["cashflow-branch", { path: "/api/cashflow-branch", handler: cashflowBranchHandler }],
  ["cashflow-ticker", { path: "/api/cashflow-ticker", handler: cashflowTickerHandler }],
  ["condition-signal-latest", { path: "/api/condition-signal-latest", handler: conditionSignalLatestHandler }],
  ["do-song-advice", { path: "/api/do-song-advice", handler: doSongAdviceHandler }],
  ["do-song-recommendation", { path: "/api/do-song-recommendation", handler: doSongRecommendationHandler }],
  ["index-daily-changes", { path: "/api/index-daily-changes", handler: indexDailyChangesHandler }],
  ["performance", { path: "/api/performance", handler: performanceHandler }],
  ["portfolio-chat", { path: "/api/portfolio-chat", handler: portfolioChatHandler }],
  ["smdt", { path: "/api/smdt", handler: smdtHandler }],
  ["smdt-branch-cross", { path: "/api/smdt-branch-cross", handler: smdtBranchCrossHandler }],
  ["smdt-ticker", { path: "/api/smdt-ticker", handler: smdtTickerHandler }],
  ["smdt-ticker-cross", { path: "/api/smdt-ticker-cross", handler: smdtTickerCrossHandler }],
  ["stock-noti", { path: "/api/stock-noti", handler: stockNotiHandler }],
  ["stock-signal", { path: "/api/stock-signal", handler: stockSignalHandler }],
  ["stock-wave", { path: "/api/stock-wave", handler: stockWaveHandler }],
  ["stock-wave-current", { path: "/api/stock-wave-current", handler: stockWaveCurrentHandler }],
  ["stock-wave-history", { path: "/api/stock-wave-history", handler: stockWaveHistoryHandler }],
  ["stock-wave-tickers", { path: "/api/stock-wave-tickers", handler: stockWaveTickersHandler }],
  ["total-trade", { path: "/api/total-trade", handler: totalTradeHandler }],
  ["total-trade-real", { path: "/api/total-trade-real", handler: totalTradeRealHandler }],
  ["wave-bottom-confirm-pairs", { path: "/api/wave-bottom-confirm-pairs", handler: waveBottomConfirmPairsHandler }],
  ["market-stock-wave-current", { path: "/api/stock-wave-current", handler: doSongStockWaveCurrentHandler }],
  ["market-stock-wave-history", { path: "/api/stock-wave-history", handler: doSongStockWaveHistoryHandler }],
  ["market-stock-wave-tickers", { path: "/api/stock-wave-tickers", handler: doSongStockWaveTickersHandler }],
  ["market-stock-noti", { path: "/api/stock-noti", handler: doSongStockNotiDataHandler }],
  ["market-wave-bottom-confirm-pairs", { path: "/api/wave-bottom-confirm-pairs", handler: doSongWaveBottomConfirmPairsHandler }],
]);

const ROUTE_CODES = new Map([
  ["r01", "branch-path"],
  ["r02", "cashflow-branch"],
  ["r03", "cashflow-ticker"],
  ["r04", "condition-signal-latest"],
  ["r05", "do-song-advice"],
  ["r06", "do-song-recommendation"],
  ["r07", "index-daily-changes"],
  ["r08", "performance"],
  ["r09", "portfolio-chat"],
  ["r10", "smdt"],
  ["r11", "smdt-branch-cross"],
  ["r12", "smdt-ticker"],
  ["r13", "smdt-ticker-cross"],
  ["r14", "stock-noti"],
  ["r15", "stock-signal"],
  ["r16", "stock-wave"],
  ["r17", "stock-wave-current"],
  ["r18", "stock-wave-history"],
  ["r19", "stock-wave-tickers"],
  ["r20", "total-trade"],
  ["r21", "total-trade-real"],
  ["r22", "wave-bottom-confirm-pairs"],
  ["r31", "market-stock-wave-current"],
  ["r32", "market-stock-wave-history"],
  ["r33", "market-stock-wave-tickers"],
  ["r34", "market-stock-noti"],
  ["r35", "market-wave-bottom-confirm-pairs"],
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

  const routeKey = normalizeRoute(body.r || body.route);
  const route = ROUTES.get(ROUTE_CODES.get(routeKey) || routeKey);
  if (!route) {
    return sendJson(res, 404, { error: "Data route not found" });
  }

  const requestParams = body.p ?? body.params;
  const params = requestParams && typeof requestParams === "object" ? requestParams : {};
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && typeof value !== "object"),
  ).toString();
  req.url = search ? `${route.path}?${search}` : route.path;
  req.query = params;
  req.body = params;

  return route.handler(req, res);
}
