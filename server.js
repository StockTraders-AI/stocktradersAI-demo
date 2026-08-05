import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import changePasswordHandler from "./api/auth/change-password.js";
import registerHandler from "./api/auth/register.js";
import requestOtpHandler from "./api/auth/request-otp.js";
import verifyOtpHandler from "./api/auth/verify-otp.js";
import smsDlrHandler from "./api/sms/dlr.js";

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
  ["/api/sms/dlr", smsDlrHandler],
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
    await routeApi(req, res, url.pathname);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`StockTraders AI server listening on http://${host}:${port}`);
});
