import crypto from "node:crypto";

const DEFAULT_FPT_BASE_URL = "http://sandbox.sms.fpt.net";
const DEFAULT_SCOPE = "send_brandname_otp";
const DEFAULT_OTP_TTL_SECONDS = 5 * 60;
const DEFAULT_VERIFIED_TTL_SECONDS = 10 * 60;
const DEFAULT_OTP_PHONE_COOLDOWN_SECONDS = 60;
const DEFAULT_OTP_PHONE_HOURLY_LIMIT = 5;
const DEFAULT_OTP_PHONE_DAILY_LIMIT = 2;
const DEFAULT_OTP_IP_HOURLY_LIMIT = 20;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const STOCKTRADERS_REGISTER_URL = "https://stocktraders.vn/service/data/getUserRegister";
const STOCKTRADERS_CHANGE_PASSWORD_URL = "https://stocktraders.vn/service/api/getUserChangePassword";
const otpRateStore = globalThis.__stocktradersOtpRateStore || new Map();
globalThis.__stocktradersOtpRateStore = otpRateStore;

const FPT_RETRYABLE_TOKEN_CODES = new Set(["1011", "1013"]);
const FPT_ERROR_MESSAGES = {
  1008: "Sai thông tin xác thực FPT SMS (client_id/client_secret).",
  1011: "Access token FPT SMS không hợp lệ.",
  1013: "Access token FPT SMS đã hết hạn.",
  2501: "Tin nhắn OTP bị trùng trong vòng 5 phút. Vui lòng chờ rồi thử lại.",
  1: "Tin nhắn OTP bị trùng trong vòng 5 phút hoặc yêu cầu chưa hợp lệ.",
  2513: "Brandname FPT SMS chưa đúng hoặc chưa được khai báo.",
  2: "Brandname FPT SMS chưa đúng hoặc chưa được khai báo.",
  "-8": "Brandname FPT SMS chưa đúng hoặc chưa được khai báo.",
  2518: "Nội dung OTP không khớp template đã đăng ký.",
  5: "Nội dung OTP không khớp template đã đăng ký.",
  "-20": "Nội dung OTP không khớp template đã đăng ký.",
  2519: "Nội dung OTP chứa từ khóa bị cấm.",
  6: "Nội dung OTP chứa từ khóa bị cấm.",
  "-18": "Nội dung OTP chứa từ khóa bị cấm.",
};

export function setCors(req, res, methods = "POST, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Authorization-Key");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function methodNotAllowed(res) {
  return res.status(405).json({ error: "Method not allowed" });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizePhone(value) {
  const raw = normalizeText(value).replace(/[\s().-]/g, "");
  if (/^0\d{9,10}$/.test(raw)) return raw;
  if (/^84\d{9,10}$/.test(raw)) return raw;
  throw new Error("Số điện thoại không hợp lệ. Vui lòng dùng định dạng 0xx hoặc 84xx.");
}

export function getOtpPurpose(value) {
  const purpose = normalizeText(value);
  if (purpose === "register" || purpose === "change-password") return purpose;
  throw new Error("Mục đích OTP không hợp lệ.");
}

export function getEnvConfig() {
  const baseUrl = normalizeText(process.env.FPT_SMS_BASE_URL || DEFAULT_FPT_BASE_URL).replace(/\/+$/, "");
  const clientId = normalizeText(process.env.FPT_SMS_CLIENT_ID);
  const clientSecret = normalizeText(process.env.FPT_SMS_CLIENT_SECRET);
  const brandName = normalizeText(process.env.FPT_SMS_BRANDNAME);
  const signingSecret = normalizeText(process.env.FPT_SMS_OTP_SIGNING_SECRET || clientSecret);
  const otpTemplate = normalizeText(process.env.FPT_SMS_OTP_TEMPLATE);

  return {
    baseUrl,
    tokenUrl: `${baseUrl}/oauth2/token`,
    sendUrl: `${baseUrl}/api/push-brandname-otp`,
    clientId,
    clientSecret,
    brandName,
    signingSecret,
    scope: normalizeText(process.env.FPT_SMS_SCOPE || DEFAULT_SCOPE),
    otpTemplate,
    otpTtlSeconds: readPositiveInt(process.env.FPT_SMS_OTP_TTL_SECONDS, DEFAULT_OTP_TTL_SECONDS),
    verifiedTtlSeconds: readPositiveInt(process.env.FPT_SMS_VERIFIED_TTL_SECONDS, DEFAULT_VERIFIED_TTL_SECONDS),
    phoneCooldownSeconds: readPositiveInt(process.env.FPT_SMS_OTP_PHONE_COOLDOWN_SECONDS, DEFAULT_OTP_PHONE_COOLDOWN_SECONDS),
    phoneHourlyLimit: readPositiveInt(process.env.FPT_SMS_OTP_PHONE_HOURLY_LIMIT, DEFAULT_OTP_PHONE_HOURLY_LIMIT),
    phoneDailyLimit: readPositiveInt(process.env.FPT_SMS_OTP_PHONE_DAILY_LIMIT, DEFAULT_OTP_PHONE_DAILY_LIMIT),
    ipHourlyLimit: readPositiveInt(process.env.FPT_SMS_OTP_IP_HOURLY_LIMIT, DEFAULT_OTP_IP_HOURLY_LIMIT),
    turnstileSecretKey: normalizeText(process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: normalizeText(process.env.VITE_TURNSTILE_SITE_KEY),
    exposeDebugOtp: process.env.FPT_SMS_EXPOSE_TEST_OTP === "1" && process.env.NODE_ENV !== "production",
    debugLog:
      process.env.FPT_SMS_DEBUG_LOG === "1" ||
      (process.env.NODE_ENV !== "production" && baseUrl.includes("sandbox.sms.fpt.net")),
  };
}

export function getRequestIp(req) {
  const forwarded = normalizeText(req.headers["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0].trim();
  return normalizeText(req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown");
}

export async function verifyTurnstileToken({ config, token, remoteIp }) {
  if (!config.turnstileSecretKey) {
    if (config.turnstileSiteKey || process.env.NODE_ENV === "production") {
      throw new Error("Thiếu TURNSTILE_SECRET để xác minh CAPTCHA server-side.");
    }
    return;
  }

  const normalizedToken = normalizeText(token);
  if (!normalizedToken) {
    throw new Error("Vui lòng xác minh CAPTCHA trước khi gửi OTP.");
  }

  const params = new URLSearchParams();
  params.set("secret", config.turnstileSecretKey);
  params.set("response", normalizedToken);
  if (remoteIp && remoteIp !== "unknown") params.set("remoteip", remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await readResponseJson(response);

  if (!response.ok || data?.success !== true) {
    console.warn("Turnstile verification failed:", data);
    throw new Error("CAPTCHA không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.");
  }
}

export function assertOtpRateLimit({ config, phone, purpose, ip }) {
  const now = Date.now();
  pruneRateStore(now);

  const phoneKey = `phone:${purpose}:${phone}`;
  const ipKey = `ip:${purpose}:${ip || "unknown"}`;
  const cooldownMs = config.phoneCooldownSeconds * 1000;
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;

  const phoneRecord = getRateRecord(phoneKey);
  const ipRecord = getRateRecord(ipKey);
  const lastPhoneRequest = phoneRecord.timestamps[phoneRecord.timestamps.length - 1] || 0;

  if (lastPhoneRequest && now - lastPhoneRequest < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (now - lastPhoneRequest)) / 1000);
    throw new Error(`Vui lòng chờ ${waitSeconds} giây trước khi gửi lại OTP.`);
  }

  phoneRecord.timestamps = phoneRecord.timestamps.filter((time) => now - time < dayMs);
  ipRecord.timestamps = ipRecord.timestamps.filter((time) => now - time < hourMs);
  const phoneHourlyCount = phoneRecord.timestamps.filter((time) => now - time < hourMs).length;

  if (phoneHourlyCount >= config.phoneHourlyLimit) {
    throw new Error("Số điện thoại này đã yêu cầu OTP quá nhiều lần. Vui lòng thử lại sau.");
  }

  if (phoneRecord.timestamps.length >= config.phoneDailyLimit) {
    throw new Error(`Số điện thoại này đã dùng hết ${config.phoneDailyLimit} lượt OTP trong 24 giờ. Vui lòng thử lại sau.`);
  }

  if (ipRecord.timestamps.length >= config.ipHourlyLimit) {
    throw new Error("Thiết bị/mạng hiện tại đã gửi quá nhiều OTP. Vui lòng thử lại sau.");
  }

  phoneRecord.timestamps.push(now);
  ipRecord.timestamps.push(now);
  phoneRecord.updatedAt = now;
  ipRecord.updatedAt = now;
  otpRateStore.set(phoneKey, phoneRecord);
  otpRateStore.set(ipKey, ipRecord);
}

export function assertSmsConfig(config) {
  const missing = [];
  if (!config.clientId) missing.push("FPT_SMS_CLIENT_ID");
  if (!config.clientSecret) missing.push("FPT_SMS_CLIENT_SECRET");
  if (!config.brandName) missing.push("FPT_SMS_BRANDNAME");
  if (!config.signingSecret) missing.push("FPT_SMS_OTP_SIGNING_SECRET");
  if (!config.otpTemplate) missing.push("FPT_SMS_OTP_TEMPLATE");
  if (missing.length) {
    throw new Error(`Thiếu cấu hình SMS OTP: ${missing.join(", ")}.`);
  }
}

export function assertOtpSigningConfig(config) {
  if (!config.signingSecret) {
    throw new Error("Thiếu cấu hình SMS OTP: FPT_SMS_OTP_SIGNING_SECRET.");
  }
}

export function createOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function createSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

export function createRequestId(purpose, phone) {
  const suffix = crypto.randomBytes(8).toString("hex");
  return `${purpose}-${phone}-${Date.now()}-${suffix}`.slice(0, 100);
}

export function renderOtpMessage(template, otp, ttlSeconds) {
  const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
  return template
    .replaceAll("{OTP}", otp)
    .replaceAll("{otp}", otp)
    .replaceAll("{CODE}", otp)
    .replaceAll("{code}", otp)
    .replaceAll("{MINUTES}", String(minutes))
    .replaceAll("{minutes}", String(minutes));
}

export function signOtpChallenge({ phone, purpose, otp, ttlSeconds, signingSecret }) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const otpHash = hashOtp({ phone, purpose, otp, nonce, signingSecret });
  return signPayload(
    {
      type: "otp_challenge",
      phone,
      purpose,
      nonce,
      otpHash,
      expiresAt,
      createdAt: Date.now(),
    },
    signingSecret,
  );
}

export function verifyOtpChallenge({ challengeToken, phone, purpose, otp, signingSecret, verifiedTtlSeconds }) {
  const payload = verifySignedPayload(challengeToken, signingSecret);
  if (payload.type !== "otp_challenge") throw new Error("Phiên OTP không hợp lệ.");
  if (payload.phone !== phone || payload.purpose !== purpose) throw new Error("OTP không khớp yêu cầu hiện tại.");
  if (Date.now() > Number(payload.expiresAt || 0)) throw new Error("OTP đã hết hạn. Vui lòng gửi lại mã.");

  const expectedHash = hashOtp({
    phone,
    purpose,
    otp: normalizeText(otp),
    nonce: payload.nonce,
    signingSecret,
  });

  if (!safeEqual(expectedHash, payload.otpHash)) {
    throw new Error("Mã OTP không chính xác.");
  }

  return signPayload(
    {
      type: "otp_verified",
      phone,
      purpose,
      verifiedAt: Date.now(),
      expiresAt: Date.now() + verifiedTtlSeconds * 1000,
      jti: crypto.randomBytes(16).toString("hex"),
    },
    signingSecret,
  );
}

export function verifyOtpProof({ verificationToken, phone, purpose, signingSecret }) {
  const payload = verifySignedPayload(verificationToken, signingSecret);
  if (payload.type !== "otp_verified") throw new Error("Vui lòng xác thực OTP trước khi tiếp tục.");
  if (payload.phone !== phone || payload.purpose !== purpose) throw new Error("OTP đã xác thực không khớp số điện thoại.");
  if (Date.now() > Number(payload.expiresAt || 0)) throw new Error("Phiên xác thực OTP đã hết hạn. Vui lòng xác thực lại.");
  return payload;
}

export async function requestFptAccessToken(config) {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
      session_id: createSessionId(),
    }),
  });

  const data = await readResponseJson(response);
  logFptDebug(config, "oauth2/token response", data);

  if (!response.ok) {
    throw createFptError(data, `Không lấy được access token FPT SMS (HTTP ${response.status}).`);
  }

  const accessToken = findLooseValue(data, ["accesstoken", "access_token", "token"]);
  if (!accessToken) {
    throw createFptError(data, "FPT SMS không trả về access_token.");
  }

  return { accessToken, raw: data };
}

export async function sendFptOtpMessage({ config, accessToken, phone, message, requestId }) {
  const encodedMessage = Buffer.from(message, "utf8").toString("base64");
  logFptDebug(config, "push-brandname-otp encoded message", {
    BrandName: config.brandName,
    Phone: phone,
    Message: encodedMessage,
    RequestId: requestId,
  });

  const response = await fetch(config.sendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      BrandName: config.brandName,
      Phone: phone,
      Message: encodedMessage,
      RequestId: requestId,
    }),
  });

  const data = await readResponseJson(response);
  logFptDebug(config, "push-brandname-otp response", data);

  if (!response.ok) {
    throw createFptError(data, `Không gửi được OTP qua FPT SMS (HTTP ${response.status}).`);
  }

  const code = readFptCode(data);
  if (code && FPT_RETRYABLE_TOKEN_CODES.has(code)) {
    const tokenError = createFptError(data, "Access token FPT SMS không hợp lệ hoặc đã hết hạn.");
    tokenError.retryToken = true;
    throw tokenError;
  }

  const messageId = findLooseValue(data, ["messageid", "smsid", "id"]);
  if (!messageId && code && !isFptSuccessCode(code)) {
    throw createFptError(data, "Không gửi được OTP qua FPT SMS.");
  }

  return { messageId: messageId || requestId, raw: data };
}

export async function postStocktradersJson(url, payload, fallbackMessage) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `${fallbackMessage} (HTTP ${response.status}).`);
  }
  return data;
}

export function getRegisterUrl() {
  return normalizeText(process.env.STOCKTRADERS_REGISTER_API_URL || STOCKTRADERS_REGISTER_URL);
}

export function getChangePasswordUrl() {
  return normalizeText(process.env.STOCKTRADERS_CHANGE_PASSWORD_API_URL || STOCKTRADERS_CHANGE_PASSWORD_URL);
}

function readPositiveInt(value, fallback) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function logFptDebug(config, label, payload) {
  if (!config.debugLog) return;
  console.log(`[FPT SMS DEBUG] ${label}:`, JSON.stringify(payload, null, 2));
}

function getRateRecord(key) {
  return otpRateStore.get(key) || { timestamps: [], updatedAt: Date.now() };
}

function pruneRateStore(now) {
  const maxAgeMs = 2 * 60 * 60 * 1000;
  for (const [key, record] of otpRateStore.entries()) {
    if (!record?.updatedAt || now - record.updatedAt > maxAgeMs) {
      otpRateStore.delete(key);
    }
  }
}

function hashOtp({ phone, purpose, otp, nonce, signingSecret }) {
  return crypto
    .createHmac("sha256", signingSecret)
    .update(`${phone}.${purpose}.${otp}.${nonce}`)
    .digest("hex");
}

function signPayload(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySignedPayload(token, secret) {
  const [body, signature] = normalizeText(token).split(".");
  if (!body || !signature) throw new Error("Token OTP không hợp lệ.");

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(expected, signature)) throw new Error("Token OTP không hợp lệ.");

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new Error("Token OTP không hợp lệ.");
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function readResponseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function readFptCode(data) {
  const code = findLooseValue(data, ["code", "codeid", "errorcode", "status", "statuscode"]);
  if (code == null) {
    const errorValue = findLooseValue(data, ["error"]);
    if (errorValue != null && FPT_ERROR_MESSAGES[String(errorValue).trim()]) {
      return String(errorValue).trim();
    }
  }
  return code == null ? "" : String(code).trim();
}

function isFptSuccessCode(code) {
  return ["0", "00", "200", "s0000", "success", "true"].includes(String(code || "").trim().toLowerCase());
}

function createFptError(data, fallbackMessage) {
  const code = readFptCode(data);
  const rawMessage = findLooseValue(data, ["message", "error", "description", "codename"]);
  const normalizedMessage = rawMessage == null ? "" : String(rawMessage).trim();
  const message =
    code && FPT_ERROR_MESSAGES[code]
      ? FPT_ERROR_MESSAGES[code]
      : FPT_ERROR_MESSAGES[normalizedMessage] || normalizedMessage;
  const error = new Error(message || fallbackMessage);
  error.code = code;
  error.raw = data;
  return error;
}

function findLooseValue(source, targetKeys, depth = 0) {
  if (!source || typeof source !== "object" || depth > 5) return undefined;
  const normalizedTargets = new Set(targetKeys);

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedTargets.has(normalizedKey)) return value;
  }

  for (const value of Object.values(source)) {
    const found = findLooseValue(value, targetKeys, depth + 1);
    if (found !== undefined) return found;
  }

  return undefined;
}
