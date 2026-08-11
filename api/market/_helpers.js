import { readJsonBody } from "../_request.js";
import { withSecureData } from "../_secure.js";

const ALLOWED_METHODS = "GET, POST, OPTIONS";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function scalarParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value != null && value !== "" && typeof value !== "object",
    ),
  );
}

async function readParams(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const query = Object.fromEntries(url.searchParams.entries());
  if (req.method !== "POST") return query;

  const body = await readJsonBody(req);
  return {
    ...query,
    ...(body && typeof body === "object" ? body : {}),
  };
}

function internalUrl(path, params) {
  const search = new URLSearchParams(scalarParams(params)).toString();
  return search ? `${path}?${search}` : path;
}

function createCaptureResponse() {
  const headers = new Map();
  const chunks = [];
  let jsonPayload;

  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    writeHead(statusCode, nextHeaders = {}) {
      this.statusCode = statusCode;
      for (const [name, value] of Object.entries(nextHeaders)) {
        this.setHeader(name, value);
      }
      this.headersSent = true;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      this.writableEnded = true;
      return this;
    },
    write(chunk) {
      if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    },
    end(chunk) {
      if (chunk != null) this.write(chunk);
      this.writableEnded = true;
      return this;
    },
    payload() {
      if (jsonPayload !== undefined) return jsonPayload;
      const raw = Buffer.concat(chunks).toString("utf8");
      return raw.trim() ? JSON.parse(raw) : null;
    },
  };
}

async function sendCaptured(req, res, handler, path, { method = "GET" } = {}) {
  const params = await readParams(req);
  const originalMethod = req.method;
  const originalUrl = req.url;
  const originalQuery = req.query;
  const originalBody = req.body;
  const nextUrl = internalUrl(path, params);
  const capture = createCaptureResponse();

  req.method = method;
  req.url = nextUrl;
  req.query = params;
  req.body = params;

  try {
    const handled = await handler(req, capture, nextUrl);
    if (!capture.writableEnded && handled === false) {
      return res.status(404).json({ error: "Market route not found" });
    }
    return res.status(capture.statusCode || 200).json(capture.payload());
  } finally {
    req.method = originalMethod;
    req.url = originalUrl;
    req.query = originalQuery;
    req.body = originalBody;
  }
}

export function createMarketGetHandler(path, handler) {
  return withSecureData(async function marketGetHandler(req, res) {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", ALLOWED_METHODS);
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return sendCaptured(req, res, handler, path);
  }, { methods: ALLOWED_METHODS });
}

export function createMarketPostHandler(path, handler) {
  return withSecureData(async function marketPostHandler(req, res) {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return sendCaptured(req, res, handler, path, { method: "POST" });
  }, { methods: "POST, OPTIONS" });
}
