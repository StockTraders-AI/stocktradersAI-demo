import crypto from "node:crypto";
import zlib from "node:zlib";

import { getSessionId, getSessionSecret, requireAuth, setSameOriginCors } from "./_auth.js";
import { enforceRateLimit } from "./_ratelimit.js";

/* Lớp bọc response cho các endpoint dữ liệu:
 *  - Body trả về là gói nhị phân AES-256-GCM thay vì JSON đọc được.
 *  - Khoá suy ra từ AUTH_SESSION_SECRET + định danh phiên + mốc thời gian, nên
 *    không phải lưu trạng thái ở đâu cả (chạy được trên serverless).
 *  - Mỗi request phải kèm chữ ký HMAC còn hạn, khiến lệnh cURL sao chép ra ngoài
 *    chỉ dùng được trong khoảng SIGNATURE_WINDOW_MS.
 *
 * Đây là lớp che dữ liệu, không phải lớp bảo mật tuyệt đối: khoá vẫn nằm trong
 * bộ nhớ trình duyệt nên người có kỹ năng vẫn đọc được plaintext. Xác thực và
 * phân quyền thật vẫn nằm ở requireAuth. */

const MAGIC = 0x5354; // "ST"
const VERSION = 1;
const FLAG_GZIP = 0x01;
const HEADER_BYTES = 10; // magic(2) + version(1) + flags(1) + epoch(6)
const IV_BYTES = 12;

export const KEY_TTL_MS = 10 * 60 * 1000;
const SIGNATURE_WINDOW_MS = 60 * 1000;

const HEADER_EPOCH = "x-st-e";
const HEADER_TIMESTAMP = "x-st-t";
const HEADER_SIGNATURE = "x-st-s";
const HEADER_ACCEPT_GZIP = "x-st-z";

export function isSecurePayloadEnabled() {
  return String(process.env.SECURE_PAYLOAD || "").trim() !== "0";
}

export function currentEpoch(now = Date.now()) {
  return Math.floor(now / KEY_TTL_MS);
}

export function epochExpiresAt(epoch) {
  return (epoch + 1) * KEY_TTL_MS;
}

export function deriveDataKey(session, epoch) {
  const sid = getSessionId(session);
  if (!sid) throw new Error("Session thiếu định danh.");
  const derived = crypto.hkdfSync("sha256", getSessionSecret(), "st-data-key", `${sid}|${epoch}`, 32);
  return Buffer.from(derived);
}

export function readHeader(req, name) {
  const value = req?.headers?.[name];
  return String(Array.isArray(value) ? value[0] : value || "").trim();
}

export function requestPathname(req) {
  const host = req?.headers?.host || "localhost";
  try {
    const pathname = new URL(req?.url || "/", `http://${host}`).pathname;
    return pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/* Chấp nhận mốc hiện tại và mốc liền trước để request đang bay lúc khoá xoay
 * không bị rớt. */
function isAcceptableEpoch(epoch, now) {
  const current = currentEpoch(now);
  return epoch === current || epoch === current - 1;
}

export function signatureBase(method, pathname, timestamp) {
  return `${String(method || "GET").toUpperCase()}|${pathname}|${timestamp}`;
}

export function additionalData(method, pathname) {
  return `${String(method || "GET").toUpperCase()}|${pathname}`;
}

/* Trả về epoch đã xác thực, hoặc null nếu chữ ký thiếu / sai / hết hạn. */
export function verifyRequestSignature(req, session) {
  const epoch = Number(readHeader(req, HEADER_EPOCH));
  const timestamp = Number(readHeader(req, HEADER_TIMESTAMP));
  const signature = readHeader(req, HEADER_SIGNATURE);

  if (!Number.isFinite(epoch) || !Number.isFinite(timestamp) || !signature) return null;

  const now = Date.now();
  if (Math.abs(now - timestamp) > SIGNATURE_WINDOW_MS) return null;
  if (!isAcceptableEpoch(epoch, now)) return null;

  let key;
  try {
    key = deriveDataKey(session, epoch);
  } catch {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", key)
    .update(signatureBase(req.method, requestPathname(req), timestamp))
    .digest("base64url");

  return timingSafeEqualText(expected, signature) ? epoch : null;
}

export function encodeSecureEnvelope(session, epoch, aad, payload, { gzip = true } = {}) {
  const key = deriveDataKey(session, epoch);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const json = Buffer.from(JSON.stringify(payload ?? null), "utf8");
  const plaintext = gzip ? zlib.gzipSync(json) : json;
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16BE(MAGIC, 0);
  header.writeUInt8(VERSION, 2);
  header.writeUInt8(gzip ? FLAG_GZIP : 0, 3);
  header.writeUIntBE(epoch, 4, 6);

  return Buffer.concat([header, iv, ciphertext, tag]);
}

/* Chỉ dùng trong test/kiểm chứng phía server. */
export function decodeSecureEnvelope(session, aad, buffer) {
  const body = Buffer.from(buffer);
  if (body.length < HEADER_BYTES + IV_BYTES + 16) throw new Error("Gói dữ liệu quá ngắn.");
  if (body.readUInt16BE(0) !== MAGIC) throw new Error("Sai magic.");
  if (body.readUInt8(2) !== VERSION) throw new Error("Sai phiên bản gói.");

  const flags = body.readUInt8(3);
  const epoch = body.readUIntBE(4, 6);
  const iv = body.subarray(HEADER_BYTES, HEADER_BYTES + IV_BYTES);
  const tag = body.subarray(body.length - 16);
  const ciphertext = body.subarray(HEADER_BYTES + IV_BYTES, body.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveDataKey(session, epoch), iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const json = flags & FLAG_GZIP ? zlib.gunzipSync(plaintext) : plaintext;
  return JSON.parse(json.toString("utf8"));
}

function sendJsonDirect(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

/* Xác thực chữ ký rồi thay res.json bằng bản mã hoá.
 * Trả về false khi đã tự gửi phản hồi lỗi — caller phải dừng ngay. */
export function applySecureResponse(req, res, session) {
  if (!isSecurePayloadEnabled()) return true;

  const epoch = verifyRequestSignature(req, session);
  if (epoch == null) {
    sendJsonDirect(res, 401, {
      error: "Chữ ký request không hợp lệ hoặc đã hết hạn.",
      code: "SIGNATURE_INVALID",
    });
    return false;
  }

  const gzip = readHeader(req, HEADER_ACCEPT_GZIP) === "gzip";
  const aad = additionalData(req.method, requestPathname(req));
  const originalJson = typeof res.json === "function" ? res.json.bind(res) : null;

  res.json = (payload) => {
    // Lỗi giữ nguyên JSON đọc được: chúng không chứa dữ liệu giá trị và cần debug được.
    if (Number(res.statusCode) >= 300) {
      if (originalJson) return originalJson(payload);
      return sendJsonDirect(res, res.statusCode, payload);
    }

    let body;
    try {
      body = encodeSecureEnvelope(session, epoch, aad, payload, { gzip });
    } catch (error) {
      console.error("Không mã hoá được response:", error);
      return sendJsonDirect(res, 500, { error: "Không mã hoá được dữ liệu." });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(body.length));
    res.setHeader("X-St-Secure", "1");
    res.end(body);
  };

  return true;
}

/* Bọc một handler dữ liệu: CORS → auth → rate limit → chữ ký → mã hoá response.
 * Handler bên trong vẫn tự gọi setSameOriginCors/requireAuth như cũ; chạy lại
 * hai bước đó không gây tác dụng phụ nên các file handler chỉ cần đổi dòng export. */
export function withSecureData(handler, { methods = "GET, OPTIONS", limitPerMinute } = {}) {
  return async function secureDataHandler(req, res) {
    if (setSameOriginCors(req, res, methods)) return;

    const session = requireAuth(req, res);
    if (!session) return;

    if (!enforceRateLimit(req, res, session, limitPerMinute)) return;
    if (!applySecureResponse(req, res, session)) return;

    return handler(req, res);
  };
}
