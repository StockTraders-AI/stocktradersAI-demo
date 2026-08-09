import fs from "node:fs";
import http from "node:http";
import path from "node:path";
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
import smsDlrHandler from "./api/sms/dlr.js";
import branchPathHandler from "./api/branch-path.js";
import cashflowBranchHandler from "./api/cashflow-branch.js";
import cashflowTickerHandler from "./api/cashflow-ticker.js";
import indexDailyChangesHandler from "./api/index-daily-changes.js";
import performanceHandler from "./api/performance.js";
import portfolioChatHandler from "./api/portfolio-chat.js";
import smdtBranchCrossHandler from "./api/smdt-branch-cross.js";
import smdtTickerCrossHandler from "./api/smdt-ticker-cross.js";
import smdtTickerHandler from "./api/smdt-ticker.js";
import smdtHandler from "./api/smdt.js";
import stockNotiHandler from "./api/stock-noti.js";
import stockSignalHandler from "./api/stock-signal.js";
import stockWaveHistoryHandler from "./api/stock-wave-history.js";
import stockWaveHandler from "./api/stock-wave.js";
import totalTradeRealHandler from "./api/total-trade-real.js";
import totalTradeHandler from "./api/total-trade.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");

loadEnvFiles([".env", ".env.local"]);

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

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
  ["/api/branch-path", branchPathHandler],
  ["/api/cashflow-branch", cashflowBranchHandler],
  ["/api/cashflow-ticker", cashflowTickerHandler],
  ["/api/index-daily-changes", indexDailyChangesHandler],
  ["/api/performance", performanceHandler],
  ["/api/portfolio-chat", portfolioChatHandler],
  ["/api/smdt-branch-cross", smdtBranchCrossHandler],
  ["/api/smdt-ticker-cross", smdtTickerCrossHandler],
  ["/api/smdt-ticker", smdtTickerHandler],
  ["/api/smdt", smdtHandler],
  ["/api/stock-noti", stockNotiHandler],
  ["/api/stock-signal", stockSignalHandler],
  ["/api/stock-wave-history", stockWaveHistoryHandler],
  ["/api/stock-wave", stockWaveHandler],
  ["/api/total-trade-real", totalTradeRealHandler],
  ["/api/total-trade", totalTradeHandler],
]);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function loadEnvFiles(fileNames) {
  for (const fileName of fileNames) {
    const filePath = path.join(__dirname, fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
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

function enhanceResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
  };
  return res;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getSafeStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalizedPath === "/" ? "index.html" : normalizedPath.replace(/^[/\\]+/, "");
  const absolutePath = path.join(distDir, relativePath);
  if (!absolutePath.startsWith(distDir)) return null;
  return absolutePath;
}

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end("Method Not Allowed");
    return;
  }

  const requestedPath = getSafeStaticPath(pathname);
  const fallbackPath = path.join(distDir, "index.html");
  const filePath = requestedPath && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : fallbackPath;

  if (!fs.existsSync(filePath)) {
    res.statusCode = 503;
    res.end("Build output not found. Run npm run build first.");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes.get(path.extname(filePath)) || "application/octet-stream");
  res.setHeader("Cache-Control", filePath === fallbackPath ? "no-cache" : "public, max-age=31536000, immutable");

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

async function routeApi(req, res, pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const handler = apiHandlers.get(normalizedPath);

  if (!handler) {
    sendJson(res, 404, { error: "API route not found" });
    return true;
  }

  enhanceResponse(res);
  try {
    await handler(req, res);
  } catch (error) {
    console.error(`${normalizedPath} error:`, error);
    if (!res.writableEnded) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const requestHost = req.headers.host || `localhost:${port}`;
  const url = new URL(req.url || "/", `http://${requestHost}`);

  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

  if (url.pathname.startsWith("/api/")) {
    req.query = Object.fromEntries(url.searchParams.entries());
    await routeApi(req, res, url.pathname);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`StockTraders AI server listening on http://${host}:${port}`);
});
