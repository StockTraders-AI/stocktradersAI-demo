import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "st_auth_session";
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function normalizeText(value) {
  return String(value || "").trim();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function getSessionSecret() {
  const secret = normalizeText(
    process.env.AUTH_SESSION_SECRET ||
      process.env.SESSION_SECRET ||
      process.env.FPT_SMS_OTP_SIGNING_SECRET ||
      process.env.FPT_SMS_CLIENT_SECRET,
  );
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "stocktraders-local-dev-session-secret";
  throw new Error("Missing AUTH_SESSION_SECRET.");
}

function getCookieHeader(req) {
  return normalizeText(req.headers?.cookie);
}

function readCookie(req, name) {
  const cookies = getCookieHeader(req).split(";").map((part) => part.trim()).filter(Boolean);
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = cookie.slice(0, separatorIndex);
    if (key === name) return decodeURIComponent(cookie.slice(separatorIndex + 1));
  }
  return "";
}

function signPayload(encodedPayload) {
  return crypto.createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createSessionToken(payload, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifySessionToken(token) {
  const [encodedPayload, signature] = normalizeText(token).split(".");
  if (!encodedPayload || !signature) return null;
  if (!timingSafeEqualText(signPayload(encodedPayload), signature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const exp = Number(payload?.exp || 0);
    if (!exp || exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readAuthSession(req) {
  return verifySessionToken(readCookie(req, SESSION_COOKIE_NAME));
}

/* Định danh phiên dùng làm info cho HKDF khi suy ra khoá mã hoá dữ liệu. Session
 * phát hành trước khi có `sid` vẫn dùng được nhờ fallback về account. */
export function getSessionId(session) {
  return normalizeText(session?.sid) || normalizeText(session?.account);
}

export function setAuthSessionCookie(res, payload, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS) {
  const token = createSessionToken(
    { sid: crypto.randomBytes(16).toString("base64url"), ...payload },
    ttlSeconds,
  );
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function clearAuthSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function setSameOriginCors(req, res, methods = "GET, OPTIONS") {
  const origin = normalizeText(req.headers?.origin);
  const host = normalizeText(req.headers?.host);
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      }
    } catch {
      // Ignore malformed Origin headers.
    }
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function requireAuth(req, res) {
  const session = readAuthSession(req);
  if (session) return session;
  res.status(401).json({ error: "Unauthorized" });
  return null;
}
