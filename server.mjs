import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import changePasswordHandler from "./api/auth/change-password.js";
import accessRightsHandler from "./api/auth/access-rights.js";
import dataKeyHandler from "./api/auth/data-key.js";
import loginHandler from "./api/auth/login.js";
import logoutHandler from "./api/auth/logout.js";
import registerHandler from "./api/auth/register.js";
import requestOtpHandler from "./api/auth/request-otp.js";
import socialLoginHandler from "./api/auth/social-login.js";
import verifyOtpHandler from "./api/auth/verify-otp.js";
import branchPath from "./api/branch-path.js";
import cashflowBranch from "./api/cashflow-branch.js";
import cashflowTicker from "./api/cashflow-ticker.js";
import conditionSignalLatest from "./api/condition-signal-latest.js";
import dataHandler from "./api/data.js";
import doSongAdvice from "./api/do-song-advice.js";
import portfolioChat from "./api/portfolio-chat.js";
import smdt from "./api/smdt.js";
import smdtBranchCross from "./api/smdt-branch-cross.js";
import smdtTicker from "./api/smdt-ticker.js";
import smdtTickerCross from "./api/smdt-ticker-cross.js";
import smsDlrHandler from "./api/sms/dlr.js";
import stockNoti from "./api/stock-noti.js";
import stockSignal from "./api/stock-signal.js";
import stockWave from "./api/stock-wave.js";
import stockWaveCurrent from "./api/stock-wave-current.js";
import stockWaveHistory from "./api/stock-wave-history.js";
import stockWaveTickers from "./api/stock-wave-tickers.js";
import totalTrade from "./api/total-trade.js";
import totalTradeReal from "./api/total-trade-real.js";
import waveBottomConfirmPairs from "./api/wave-bottom-confirm-pairs.js";
import performance from "./api/performance.js";
import indexDailyChanges from "./api/index-daily-changes.js";
import liveHandler from "./api/live.js";
import marketConditionSignalLatest from "./api/market/condition-signal-latest.js";
import marketDoSongAdvice from "./api/market/do-song-advice.js";
import marketDoSongRecommendation from "./api/market/do-song-recommendation.js";
import marketPortfolioChat from "./api/market/portfolio-chat.js";
import marketAiKey from "./api/market/ai-key.js";
import marketAiKeyStatus from "./api/market/ai-key-status.js";
import marketAiKeyDelete from "./api/market/ai-key-delete.js";
import marketStockNoti from "./api/market/stock-noti.js";
import marketStockWaveCurrent from "./api/market/stock-wave-current.js";
import marketStockWaveHistory from "./api/market/stock-wave-history.js";
import marketStockWaveTickers from "./api/market/stock-wave-tickers.js";
import marketWaveBottomConfirmPairs from "./api/market/wave-bottom-confirm-pairs.js";
import {
  handleStockWaveCurrent as doSongHandleStockWaveCurrent,
  handleStockWaveCurrentStream as doSongHandleStockWaveCurrentStream,
  startStockWaveCurrentSocket as startDoSongStockWaveCurrentSocket,
} from "./embedded/stocktraders-web/stockWaveCurrentCache.js";
import {
  backfillStockWaveHistoryFromApi as backfillDoSongStockWaveHistoryFromApi,
  invalidateStockWaveHistorySnapshot as invalidateDoSongStockWaveHistorySnapshot,
  handleStockWaveHistory as doSongHandleStockWaveHistory,
  preloadStockWaveHistorySnapshot as preloadDoSongStockWaveHistorySnapshot,
} from "./embedded/stocktraders-web/stockWaveHistoryCache.js";
import { handleStockWaveTickers as doSongHandleStockWaveTickers } from "./embedded/stocktraders-web/stockWaveTickersCache.js";
import {
  handleWaveBottomConfirmPairs as doSongHandleWaveBottomConfirmPairs,
  handleWaveBottomConfirmPairsStream as doSongHandleWaveBottomConfirmPairsStream,
} from "./embedded/stocktraders-web/waveBottomConfirmPairsCache.js";
import {
  handleStockNoti as doSongHandleStockNoti,
  startStockNotiSocket as startDoSongStockNotiSocket,
} from "./embedded/stocktraders-web/stockNotiCache.js";
import { handlePortfolioChat as doSongHandlePortfolioChat } from "./embedded/stocktraders-web/portfolioChatApi.js";
import {
  handleConditionSignalLatest as doSongHandleConditionSignalLatest,
  handleDoSongAdvice as doSongHandleDoSongAdvice,
} from "./embedded/stocktraders-web/conditionSignalApi.js";
import { handleDoSongRecommendation as doSongHandleDoSongRecommendation } from "./embedded/stocktraders-web/doSongRecommendationDb.js";
import {
  DB_PATH as DOSONG_DB_PATH,
  initStockDataDb as initDoSongStockDataDb,
} from "./embedded/stocktraders-web/stockDataDb.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

loadEnvFiles([".env", ".env.local"]);

const DIST_DIR = resolve(__dirname, "dist");
const DOSONG_API_PREFIX = "/thi-truong";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const apiHandlers = new Map([
  ["/api/auth/request-otp", requestOtpHandler],
  ["/api/auth/verify-otp", verifyOtpHandler],
  ["/api/auth/register", registerHandler],
  ["/api/auth/change-password", changePasswordHandler],
  ["/api/auth/login", loginHandler],
  ["/api/auth/social-login", socialLoginHandler],
  ["/api/auth/access-rights", accessRightsHandler],
  ["/api/auth/data-key", dataKeyHandler],
  ["/api/auth/logout", logoutHandler],
  ["/api/sms/dlr", smsDlrHandler],
  ["/api/branch-path", branchPath],
  ["/api/cashflow-branch", cashflowBranch],
  ["/api/cashflow-ticker", cashflowTicker],
  ["/api/condition-signal-latest", conditionSignalLatest],
  ["/api/data", dataHandler],
  ["/api/do-song-advice", doSongAdvice],
  ["/api/portfolio-chat", portfolioChat],
  ["/api/smdt-branch-cross", smdtBranchCross],
  ["/api/smdt-ticker-cross", smdtTickerCross],
  ["/api/smdt", smdt],
  ["/api/smdt-ticker", smdtTicker],
  ["/api/stock-noti", stockNoti],
  ["/api/stock-signal", stockSignal],
  ["/api/stock-wave", stockWave],
  ["/api/stock-wave-current", stockWaveCurrent],
  ["/api/stock-wave-history", stockWaveHistory],
  ["/api/stock-wave-tickers", stockWaveTickers],
  ["/api/total-trade", totalTrade],
  ["/api/total-trade-real", totalTradeReal],
  ["/api/wave-bottom-confirm-pairs", waveBottomConfirmPairs],
  ["/api/performance", performance],
  ["/api/index-daily-changes", indexDailyChanges],
  ["/api/live", liveHandler],
  ["/api/market/condition-signal-latest", marketConditionSignalLatest],
  ["/api/market/do-song-advice", marketDoSongAdvice],
  ["/api/market/do-song-recommendation", marketDoSongRecommendation],
  ["/api/market/portfolio-chat", marketPortfolioChat],
  ["/api/market/ai-key", marketAiKey],
  ["/api/market/ai-key-status", marketAiKeyStatus],
  ["/api/market/ai-key-delete", marketAiKeyDelete],
  ["/api/market/stock-noti", marketStockNoti],
  ["/api/market/stock-wave-current", marketStockWaveCurrent],
  ["/api/market/stock-wave-history", marketStockWaveHistory],
  ["/api/market/stock-wave-tickers", marketStockWaveTickers],
  ["/api/market/wave-bottom-confirm-pairs", marketWaveBottomConfirmPairs],
]);

initDoSongStockDataDb()
  .then(async () => {
    console.log(`Do-song DB ready at ${DOSONG_DB_PATH}`);
    let rows = await preloadDoSongStockWaveHistorySnapshot();

    if (
      !rows.length &&
      process.env.STOCK_WAVE_BACKFILL_ON_STARTUP !== "false"
    ) {
      try {
        const result = await backfillDoSongStockWaveHistoryFromApi();
        invalidateDoSongStockWaveHistorySnapshot();
        rows = await preloadDoSongStockWaveHistorySnapshot();
        console.log(
          `Do-song history backfilled from API: ${result.allRows.length} rows`,
        );
      } catch (error) {
        console.error("Do-song history startup backfill failed", error);
      }
    }

    console.log(`Do-song history snapshot ready: ${rows.length} rows`);
  })
  .catch((error) => {
    console.error("Do-song DB init failed", error);
  });

startDoSongStockWaveCurrentSocket();
startDoSongStockNotiSocket();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function loadEnvFiles(fileNames) {
  for (const fileName of fileNames) {
    const filePath = join(__dirname, fileName);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] != null) continue;

      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

function attachResponseHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(data));
  };
}

function stripDoSongApiPrefix(rawUrl = "") {
  return rawUrl.startsWith(DOSONG_API_PREFIX)
    ? rawUrl.slice(DOSONG_API_PREFIX.length) || "/"
    : rawUrl;
}

async function callDoSongApi(handler, req, res, rawUrl) {
  attachResponseHelpers(res);
  const embeddedUrl = stripDoSongApiPrefix(rawUrl);

  try {
    await handler(req, res, embeddedUrl);
  } catch (error) {
    console.error(`Do-song API error ${rawUrl}:`, error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    if (!res.writableEnded) {
      res.end(
        JSON.stringify({
          error: "Internal server error",
          details: error.message,
        }),
      );
    }
  }
}

async function handleDoSongApi(req, res, url) {
  if (!url.pathname.startsWith(`${DOSONG_API_PREFIX}/api/`)) return false;

  const rawUrl = req.url || url.pathname;
  const embeddedPath = stripDoSongApiPrefix(url.pathname);

  if (embeddedPath === "/api/stock-wave-current/stream") {
    doSongHandleStockWaveCurrentStream(req, res);
    return true;
  }
  if (embeddedPath === "/api/stock-wave-current") {
    await callDoSongApi(doSongHandleStockWaveCurrent, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/stock-wave-history") {
    await callDoSongApi(doSongHandleStockWaveHistory, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/stock-wave-tickers") {
    await callDoSongApi(doSongHandleStockWaveTickers, req, res, rawUrl);
    return true;
  }

  if (embeddedPath === "/api/wave-bottom-confirm-pairs/stream") {
    doSongHandleWaveBottomConfirmPairsStream(req, res);
    return true;
  }

  if (embeddedPath === "/api/wave-bottom-confirm-pairs") {
    await callDoSongApi(doSongHandleWaveBottomConfirmPairs, req, res, rawUrl);
    return true;
  }
  if (
    embeddedPath === "/api/stock-noti" ||
    embeddedPath === "/api/stock-noti/stream"
  ) {
    await callDoSongApi(doSongHandleStockNoti, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/portfolio-chat") {
    await callDoSongApi(doSongHandlePortfolioChat, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/condition-signal-latest") {
    await callDoSongApi(doSongHandleConditionSignalLatest, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/do-song-advice") {
    await callDoSongApi(doSongHandleDoSongAdvice, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/do-song-recommendation") {
    await callDoSongApi(doSongHandleDoSongRecommendation, req, res, rawUrl);
    return true;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Do-song API not found" }));
  return true;
}

async function handleApi(req, res, url) {
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const handler = apiHandlers.get(normalizedPath);
  if (!handler) return false;

  attachResponseHelpers(res);
  req.query = Object.fromEntries(url.searchParams.entries());

  try {
    await handler(req, res);
  } catch (error) {
    console.error(`API error ${normalizedPath}:`, error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    if (!res.writableEnded) {
      res.end(
        JSON.stringify({
          error: "Internal server error",
          details: error.message,
        }),
      );
    }
  }

  return true;
}

async function sendFile(req, res, filePath, { fallback = false } = {}) {
  const body = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
  );
  res.setHeader(
    "Cache-Control",
    fallback || extname(filePath).toLowerCase() === ".html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  );
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

async function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(
    join(DIST_DIR, safePath === "/" ? "index.html" : safePath),
  );

  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    await sendFile(req, res, filePath);
  } catch {
    const fallbackPath = join(DIST_DIR, "index.html");
    if (!existsSync(fallbackPath)) {
      res.statusCode = 503;
      res.end("Build output not found. Run npm run build first.");
      return;
    }
    await sendFile(req, res, fallbackPath, { fallback: true });
  }
}

createServer(async (req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

  if (await handleDoSongApi(req, res, url)) return;
  if (await handleApi(req, res, url)) return;
  if (url.pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "API route not found" }));
    return;
  }
  await handleStatic(req, res, url);
}).listen(PORT, HOST, () => {
  console.log(`StockTraders dashboard listening on http://${HOST}:${PORT}`);
});
