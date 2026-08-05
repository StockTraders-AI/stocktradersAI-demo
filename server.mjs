import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import branchPath from "./api/branch-path.js";
import cashflowBranch from "./api/cashflow-branch.js";
import cashflowTicker from "./api/cashflow-ticker.js";
import conditionSignalLatest from "./api/condition-signal-latest.js";
import doSongAdvice from "./api/do-song-advice.js";
import portfolioChat from "./api/portfolio-chat.js";
import smdt from "./api/smdt.js";
import smdtTicker from "./api/smdt-ticker.js";
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
import {
  handleStockWaveCurrent as doSongHandleStockWaveCurrent,
  handleStockWaveCurrentStream as doSongHandleStockWaveCurrentStream,
  startStockWaveCurrentSocket as startDoSongStockWaveCurrentSocket,
} from "./embedded/stocktraders-web/stockWaveCurrentCache.js";
import {
  handleStockWaveHistory as doSongHandleStockWaveHistory,
  preloadStockWaveHistorySnapshot as preloadDoSongStockWaveHistorySnapshot,
} from "./embedded/stocktraders-web/stockWaveHistoryCache.js";
import { handleStockWaveTickers as doSongHandleStockWaveTickers } from "./embedded/stocktraders-web/stockWaveTickersCache.js";
import { handleWaveBottomConfirmPairs as doSongHandleWaveBottomConfirmPairs } from "./embedded/stocktraders-web/waveBottomConfirmPairsCache.js";
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
const DIST_DIR = resolve(__dirname, "dist");
const DOSONG_API_PREFIX = "/thi-truong";
const PORT = Number(process.env.PORT || 3000);

const apiHandlers = new Map([
  ["/api/branch-path", branchPath],
  ["/api/cashflow-branch", cashflowBranch],
  ["/api/cashflow-ticker", cashflowTicker],
  ["/api/condition-signal-latest", conditionSignalLatest],
  ["/api/do-song-advice", doSongAdvice],
  ["/api/portfolio-chat", portfolioChat],
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
]);


initDoSongStockDataDb()
  .then(async () => {
    console.log(`Do-song DB ready at ${DOSONG_DB_PATH}`);
    const rows = await preloadDoSongStockWaveHistorySnapshot();
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
  if (embeddedPath === "/api/wave-bottom-confirm-pairs") {
    await callDoSongApi(doSongHandleWaveBottomConfirmPairs, req, res, rawUrl);
    return true;
  }
  if (embeddedPath === "/api/stock-noti" || embeddedPath === "/api/stock-noti/stream") {
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
  const handler = apiHandlers.get(url.pathname);
  if (!handler) return false;

  attachResponseHelpers(res);
  req.query = Object.fromEntries(url.searchParams.entries());

  try {
    await handler(req, res);
  } catch (error) {
    console.error(`API error ${url.pathname}:`, error);
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

async function sendFile(res, filePath) {
  const body = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
  );
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
    await sendFile(res, filePath);
  } catch {
    await sendFile(res, join(DIST_DIR, "index.html"));
  }
}

createServer(async (req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  if (await handleDoSongApi(req, res, url)) return;
  if (await handleApi(req, res, url)) return;
  await handleStatic(req, res, url);
}).listen(PORT, "0.0.0.0", () => {
  console.log(`StockTraders dashboard listening on port ${PORT}`);
});
