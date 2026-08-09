import { getSessionId } from "./_auth.js";

/* Giới hạn tần suất cho các endpoint dữ liệu, đếm theo phiên + đường dẫn.
 *
 * Bộ đếm nằm trong bộ nhớ của từng instance (giống otpRateStore ở _otp.js). Trên
 * Vercel serverless, hạn mức thực tế bằng hạn mức cấu hình nhân với số instance
 * đang chạy. Đủ để chặn script quét tốc độ cao, không phải hàng rào cứng — muốn
 * cứng thì phải chuyển bộ đếm sang Redis. */

const rateStore = globalThis.__stocktradersDataRateStore || new Map();
globalThis.__stocktradersDataRateStore = rateStore;

const WINDOW_MS = 60 * 1000;
const DEFAULT_LIMIT_PER_MINUTE = 120;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

let lastPrunedAt = 0;

function configuredLimit() {
  const raw = Number(process.env.DATA_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIMIT_PER_MINUTE;
}

/* Bản sao nhỏ của requestPathname trong _secure.js — giữ ở đây để hai module
 * không nhập vòng lẫn nhau. */
function pathnameOf(req) {
  const host = req?.headers?.host || "localhost";
  try {
    return new URL(req?.url || "/", `http://${host}`).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (forwarded) return forwarded.split(",")[0].trim();
  return req?.socket?.remoteAddress || "unknown";
}

function prune(now) {
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
  lastPrunedAt = now;
  for (const [key, record] of rateStore) {
    if (now - record.startedAt > WINDOW_MS) rateStore.delete(key);
  }
}

export function checkRateLimit(key, limit = configuredLimit(), now = Date.now()) {
  prune(now);

  const record = rateStore.get(key);
  if (!record || now - record.startedAt > WINDOW_MS) {
    rateStore.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  record.count += 1;
  if (record.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((record.startedAt + WINDOW_MS - now) / 1000)),
    };
  }

  return { allowed: true, remaining: limit - record.count, retryAfterSeconds: 0 };
}

/* Trả về false khi đã gửi 429 — caller phải dừng ngay. */
export function enforceRateLimit(req, res, session, limitPerMinute) {
  const limit = Number.isFinite(limitPerMinute) && limitPerMinute > 0 ? limitPerMinute : configuredLimit();
  const identity = getSessionId(session) || clientIp(req);
  const result = checkRateLimit(`${identity}|${pathnameOf(req)}`, limit);

  if (result.allowed) {
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    return true;
  }

  res.statusCode = 429;
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      error: "Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít giây.",
      code: "RATE_LIMITED",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
  );
  return false;
}
