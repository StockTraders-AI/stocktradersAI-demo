/* Lớp client cho các endpoint dữ liệu đã mã hoá (xem api/_secure.js).
 *
 * - Khoá phiên chỉ nằm trong bộ nhớ module, không ghi vào localStorage.
 * - Mỗi request kèm chữ ký HMAC có hạn 60 giây, nên lệnh cURL sao chép từ tab
 *   Network sẽ hết hiệu lực rất nhanh.
 * - Server có thể tắt hẳn lớp này bằng biến môi trường SECURE_PAYLOAD=0; client
 *   tự nhận biết qua Content-Type nên không cần build lại.
 *
 * Đây là lớp che dữ liệu, không phải bảo mật tuyệt đối: khoá vẫn nằm trong bộ
 * nhớ trình duyệt nên người có kỹ năng vẫn đọc được plaintext. */

const DATA_KEY_URL = "/api/auth/data-key";

const MAGIC = 0x5354; // "ST"
const VERSION = 1;
const FLAG_GZIP = 0x01;
const HEADER_BYTES = 10; // magic(2) + version(1) + flags(1) + epoch(6)
const IV_BYTES = 12;
const KEY_REFRESH_MARGIN_MS = 30 * 1000;

const HEADER_EPOCH = "X-St-E";
const HEADER_TIMESTAMP = "X-St-T";
const HEADER_SIGNATURE = "X-St-S";
const HEADER_ACCEPT_GZIP = "X-St-Z";

export class SecureTransportError extends Error {
  constructor(message, code = "SECURE_TRANSPORT") {
    super(message);
    this.name = "SecureTransportError";
    this.code = code;
  }
}

/* epoch -> { aesKey, hmacKey }. Giữ cả khoá của mốc trước để response đang bay
 * lúc khoá xoay vẫn giải mã được. */
const keyCache = new Map();

let activeKey = null; // { epoch, expiresAt }
let keyPromise = null;
let secureDisabled = false;

function subtle() {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new SecureTransportError(
      "Trình duyệt không cho dùng WebCrypto ở ngữ cảnh này. Hãy mở trang qua HTTPS hoặc http://localhost.",
      "NO_WEBCRYPTO",
    );
  }
  return api;
}

function supportsGzip() {
  return typeof globalThis.DecompressionStream === "function";
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pathnameOf(url) {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return new URL(url, base).pathname.replace(/\/+$/, "") || "/";
}

async function importKeyPair(rawKey) {
  const api = subtle();
  const [aesKey, hmacKey] = await Promise.all([
    api.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]),
    api.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
  ]);
  return { aesKey, hmacKey };
}

async function requestDataKey() {
  const response = await fetch(DATA_KEY_URL, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) {
    throw new SecureTransportError("Phiên đăng nhập đã hết hạn.", "UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new SecureTransportError(`Không lấy được khoá dữ liệu (HTTP ${response.status}).`, "KEY_FETCH_FAILED");
  }

  const payload = await response.json();
  if (payload?.enabled === false) {
    secureDisabled = true;
    activeKey = null;
    return null;
  }

  secureDisabled = false;
  const epoch = Number(payload?.epoch);
  if (!Number.isFinite(epoch) || !payload?.key) {
    throw new SecureTransportError("Khoá dữ liệu trả về không hợp lệ.", "KEY_INVALID");
  }

  keyCache.set(epoch, await importKeyPair(base64UrlToBytes(payload.key)));
  // Chỉ giữ hai mốc gần nhất.
  for (const cached of [...keyCache.keys()]) {
    if (cached < epoch - 1) keyCache.delete(cached);
  }

  activeKey = { epoch, expiresAt: Number(payload.expiresAt) || Date.now() + KEY_REFRESH_MARGIN_MS };
  return activeKey;
}

async function ensureKey({ force = false } = {}) {
  if (secureDisabled && !force) return null;

  const fresh = activeKey && Date.now() < activeKey.expiresAt - KEY_REFRESH_MARGIN_MS;
  if (!force && fresh) return activeKey;

  if (!keyPromise) {
    keyPromise = requestDataKey().finally(() => {
      keyPromise = null;
    });
  }
  return keyPromise;
}

async function signHeaders(url, method) {
  const key = await ensureKey();
  if (!key) return null;

  const entry = keyCache.get(key.epoch);
  if (!entry) return null;

  const timestamp = Date.now();
  const base = `${method.toUpperCase()}|${pathnameOf(url)}|${timestamp}`;
  const signature = await subtle().sign("HMAC", entry.hmacKey, new TextEncoder().encode(base));

  const headers = {
    [HEADER_EPOCH]: String(key.epoch),
    [HEADER_TIMESTAMP]: String(timestamp),
    [HEADER_SIGNATURE]: bytesToBase64Url(signature),
  };
  if (supportsGzip()) headers[HEADER_ACCEPT_GZIP] = "gzip";
  return headers;
}

async function gunzip(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decryptEnvelope(url, method, buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_BYTES + IV_BYTES + 16) {
    throw new SecureTransportError("Gói dữ liệu quá ngắn.", "ENVELOPE_INVALID");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0) !== MAGIC) throw new SecureTransportError("Sai magic.", "ENVELOPE_INVALID");
  if (view.getUint8(2) !== VERSION) throw new SecureTransportError("Sai phiên bản gói.", "ENVELOPE_INVALID");

  const flags = view.getUint8(3);
  const epoch = view.getUint16(4) * 2 ** 32 + view.getUint32(6);

  const entry = keyCache.get(epoch);
  if (!entry) throw new SecureTransportError("Không có khoá cho gói dữ liệu này.", "KEY_MISSING");

  const iv = bytes.subarray(HEADER_BYTES, HEADER_BYTES + IV_BYTES);
  const ciphertext = bytes.subarray(HEADER_BYTES + IV_BYTES);
  const aad = new TextEncoder().encode(`${method.toUpperCase()}|${pathnameOf(url)}`);

  const plaintext = new Uint8Array(
    await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, entry.aesKey, ciphertext),
  );

  const json = flags & FLAG_GZIP ? await gunzip(plaintext) : plaintext;
  return JSON.parse(new TextDecoder().decode(json));
}

async function readResponse(url, method, response) {
  const contentType = String(response.headers.get("content-type") || "");
  if (contentType.includes("application/octet-stream")) {
    return decryptEnvelope(url, method, await response.arrayBuffer());
  }
  return response.json();
}

/* Thay thế fetch(...).json() cho mọi endpoint dữ liệu.
 * Ném lỗi khi HTTP không thành công, giống hành vi cũ ở requestCache. */
export async function secureFetchJson(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  const run = async () => {
    const signature = await signHeaders(url, method);
    return fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: { ...(options.headers || {}), ...(signature || {}) },
    });
  };

  let response = await run();

  // 401 thường là do khoá vừa xoay: xin khoá mới rồi thử đúng một lần nữa.
  if (response.status === 401 && !secureDisabled) {
    await ensureKey({ force: true });
    response = await run();
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return readResponse(url, method, response);
}

/* Dùng khi caller cần tự xử lý mã lỗi HTTP thay vì nhận Error. */
export async function secureFetchRaw(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  const run = async () => {
    const signature = await signHeaders(url, method);
    return fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: { ...(options.headers || {}), ...(signature || {}) },
    });
  };

  let response = await run();
  if (response.status === 401 && !secureDisabled) {
    await ensureKey({ force: true });
    response = await run();
  }

  return { response, readJson: () => readResponse(url, method, response) };
}

/* Gọi khi đăng xuất để khoá không còn nằm trong bộ nhớ. */
export function clearSecureSession() {
  keyCache.clear();
  activeKey = null;
  keyPromise = null;
  secureDisabled = false;
}
