const LOGIN_API_URL = import.meta.env.VITE_LOGIN_API_URL || "/service/data/getUserLogin";
const SOCIAL_API_URL = import.meta.env.VITE_SOCIAL_LOGIN_API_URL || "/service/data/getStockSocial";
const REGISTER_API_URL = import.meta.env.VITE_REGISTER_API_URL || "/service/data/getUserRegister";
const ACCESS_RIGHTS_API_URL = import.meta.env.VITE_ACCESS_RIGHTS_API_URL || "/service/data/getAccessRights";
const CHANGE_PASSWORD_API_URL = import.meta.env.VITE_CHANGE_PASSWORD_API_URL || "/service/api/getUserChangePassword";
const SUCCESS_CODE = "S0000";
const DEVICE_ID_KEY = "st-auth-device-id";

const REPLY_KEYS = {
  login: ["UserLoginReply", "UserLoginRequest"],
  social: ["StockSocialReply", "StockSocialRequest"],
  register: ["UserRegisterReply", "UserRegisterRequest"],
  accessRights: ["AccessRightsReply", "AccessRightsRequest"],
  changePassword: ["UserChangePasswordReply", "UserChangePasswordRequest"],
};

export class AccessDeniedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AccessDeniedError";
    this.code = "ACCESS_DENIED";
    Object.assign(this, details);
  }
}

function readReply(data, keys = []) {
  for (const key of keys) {
    if (data?.[key]) return data[key];
  }
  return data || {};
}

function readCode(reply) {
  return reply?.codeReply?.codeID || reply?.codeID || reply?.code || reply?.statusCode;
}

function readMessage(reply) {
  return (
    reply?.message ||
    reply?.messsage ||
    reply?.codeReply?.message ||
    reply?.error ||
    reply?.description ||
    reply?.codeReply?.codeName
  );
}

async function postJson(url, payload, replyKeys, fallbackMessage, { allowApiError = false } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `${fallbackMessage} (HTTP ${response.status}).`);
  }

  const reply = readReply(data, replyKeys);
  const code = readCode(reply);
  if (code && code !== SUCCESS_CODE && !allowApiError) {
    throw new Error(readMessage(reply) || fallbackMessage);
  }

  return { data, reply, code };
}

function getBrowserDeviceId() {
  try {
    const current = localStorage.getItem(DEVICE_ID_KEY);
    if (current) return current;
    const next =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return "web-device";
  }
}

function getDeviceInfo() {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  return {
    device: nav.userAgent || "web",
    name: nav.platform || "browser",
    platform: "web",
    uuid: getBrowserDeviceId(),
    version: nav.appVersion || "",
    code: "1",
  };
}

function normalizeProvider(provider) {
  const value = String(provider || "").trim();
  if (value === "google") return "2";
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function findByLooseKey(source, targetKeys, depth = 0) {
  source = parseMaybeJson(source);
  if (!source || typeof source !== "object" || depth > 5) return undefined;

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (targetKeys.has(normalizedKey)) return value;
  }

  for (const value of Object.values(source)) {
    const found = findByLooseKey(value, targetKeys, depth + 1);
    if (found !== undefined) return found;
  }

  return undefined;
}

function readAccountCandidate(reply, fallback = "") {
  const targetGroups = [
    new Set(["account", "username", "user_name", "loginname"]),
    new Set(["phone", "phonenumber", "phone_number", "mobile"]),
    new Set(["email", "mail"]),
  ];

  for (const keys of targetGroups) {
    const value = normalizeText(findByLooseKey(reply, keys));
    if (value) return value;
  }

  return normalizeText(fallback);
}

function toAccessDecision(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value > 0;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return undefined;

  if (["1", "true", "yes", "y", "active", "valid", "allow", "allowed", "paid", "premium", "vip"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "inactive", "expired", "deny", "denied", "free", "none", "unpaid", "non-paid"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function toStatusAccessDecision(value) {
  if (value === true) return true;
  if (value === false) return false;

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "1" || normalized === "active" || normalized === "allow" || normalized === "allowed") {
    return true;
  }

  if (
    normalized === "0" ||
    normalized === "2" ||
    normalized === "inactive" ||
    normalized === "expired" ||
    normalized === "deny" ||
    normalized === "denied" ||
    normalized === "unpaid"
  ) {
    return false;
  }

  return undefined;
}

function readAccessAllowed(reply) {
  const statusValue = findByLooseKey(
    reply,
    new Set(["status", "accessstatus", "rightstatus", "packagestatus"]),
  );
  const statusDecision = toStatusAccessDecision(statusValue);
  if (statusDecision !== undefined) return statusDecision;

  const accessValue = findByLooseKey(
    reply,
    new Set([
      "access",
      "allow",
      "allowed",
      "hasaccess",
      "hasright",
      "isaccess",
      "isallowed",
      "ispaid",
      "paid",
      "premium",
      "permission",
      "right",
    ]),
  );
  const accessDecision = toAccessDecision(accessValue);
  if (accessDecision !== undefined) return accessDecision;

  const packageValue = findByLooseKey(
    reply,
    new Set(["package", "packagecode", "packagename", "packageid", "plan", "level"]),
  );
  const packageDecision = toAccessDecision(packageValue);
  if (packageDecision !== undefined) return packageDecision;

  return false;
}

function isLoginAccessBlocked(reply) {
  const status = Number(reply?.status);
  const token = normalizeText(reply?.access_token);
  return status === 2 && !token;
}

export async function loginUser({ identifier, password }) {
  const userName = normalizeText(identifier);

  if (!userName || !password) {
    throw new Error("Vui lòng nhập tài khoản và mật khẩu.");
  }

  const { data, reply } = await postJson(
    LOGIN_API_URL,
    {
      UserLoginRequest: {
        user_name: userName,
        password,
      },
    },
    REPLY_KEYS.login,
    "Sai tài khoản hoặc mật khẩu.",
    { allowApiError: true },
  );

  const code = readCode(reply);
  if (code && code !== SUCCESS_CODE) {
    if (isLoginAccessBlocked(reply)) {
      throw new AccessDeniedError(
        "Tài khoản đã đăng ký nhưng chưa có quyền truy cập gói Premium.",
        {
          account: userName,
          reply,
          raw: data,
          reason: "LOGIN_STATUS_2",
        },
      );
    }
    throw new Error(readMessage(reply) || "Sai tài khoản hoặc mật khẩu.");
  }

  return {
    authType: "password",
    account: userName,
    userName,
    reply,
    raw: data,
    loggedAt: new Date().toISOString(),
  };
}

export async function loginWithSocial({
  provider,
  socialId,
  phoneNumber,
  userName,
  password = "",
  fullName,
  email,
  birthday = "",
  address = "",
  avatar = "",
  presenter = "",
}) {
  const socialProvider = normalizeProvider(provider);
  const normalizedSocialId = normalizeText(socialId);
  const normalizedUserName = normalizeText(userName || email);
  const normalizedEmail = normalizeText(email || userName);
  const normalizedPhone = normalizeText(phoneNumber);

  if (!socialProvider || !normalizedSocialId) {
    throw new Error("Vui lòng chọn mạng xã hội và nhập social ID.");
  }
  if (!normalizedUserName && !normalizedPhone) {
    throw new Error("Vui lòng nhập email/tài khoản hoặc số điện thoại.");
  }

  const { data, reply } = await postJson(
    SOCIAL_API_URL,
    {
      StockSocialRequest: {
        provider: socialProvider,
        social_id: normalizedSocialId,
        phone_number: normalizedPhone,
        user_name: normalizedUserName,
        password,
        name: normalizeText(fullName),
        email: normalizedEmail,
        birthday: normalizeText(birthday),
        address: normalizeText(address),
        avatar: normalizeText(avatar),
        presenter: normalizeText(presenter),
        deviceInfo: getDeviceInfo(),
      },
    },
    REPLY_KEYS.social,
    "Không thể đăng nhập bằng mạng xã hội.",
    { allowApiError: true },
  );

  const accessAccount = readAccountCandidate(
    reply,
    normalizedPhone || normalizedUserName || normalizedEmail || normalizedSocialId,
  );
  const code = readCode(reply);
  if (code && code !== SUCCESS_CODE) {
    if (isLoginAccessBlocked(reply)) {
      throw new AccessDeniedError(
        "Tài khoản đã đăng ký nhưng chưa có quyền truy cập gói Premium.",
        {
          account: accessAccount,
          reply,
          raw: data,
          reason: "SOCIAL_STATUS_2",
        },
      );
    }
    throw new Error(readMessage(reply) || "Không thể đăng nhập bằng mạng xã hội.");
  }

  return {
    authType: "social",
    account: accessAccount,
    accessAccount,
    userName: normalizedUserName,
    provider: socialProvider,
    reply,
    raw: data,
    loggedAt: new Date().toISOString(),
  };
}

export async function registerUser({ fullName, userName, email, phoneNumber, password }) {
  const normalizedUserName = normalizeText(userName);
  const normalizedEmail = normalizeText(email);
  const normalizedPhone = normalizeText(phoneNumber);

  if (!normalizedUserName || !password || !fullName || !normalizedEmail || !normalizedPhone) {
    throw new Error("Vui lòng nhập đầy đủ họ tên, tài khoản, email, số điện thoại và mật khẩu.");
  }

  const { data, reply } = await postJson(
    REGISTER_API_URL,
    {
      UserRegisterRequest: {
        user_name: normalizedUserName,
        password,
        name: normalizeText(fullName),
        email: normalizedEmail,
        phone_number: normalizedPhone,
      },
    },
    REPLY_KEYS.register,
    "Không thể tạo tài khoản.",
  );

  return {
    account: normalizedUserName,
    phoneNumber: normalizedPhone,
    reply,
    raw: data,
  };
}

export async function getAccessRights({ account }) {
  const normalizedAccount = normalizeText(account);
  if (!normalizedAccount) {
    throw new Error("Không xác định được tài khoản để kiểm tra quyền truy cập.");
  }

  const { data, reply } = await postJson(
    ACCESS_RIGHTS_API_URL,
    {
      AccessRightsRequest: {
        account: normalizedAccount,
      },
    },
    REPLY_KEYS.accessRights,
    "Tài khoản chưa có quyền truy cập.",
  );

  const allowed = readAccessAllowed(reply);
  if (!allowed) {
    throw new AccessDeniedError(
      readMessage(reply) || "Tài khoản chưa mua gói nên chưa thể xem tính năng.",
      {
        account: normalizedAccount,
        reply,
        raw: data,
      },
    );
  }

  return {
    account: normalizedAccount,
    allowed,
    reply,
    raw: data,
  };
}

export async function changePassword({ phoneNumber, password }) {
  const normalizedPhone = normalizeText(phoneNumber);

  if (!normalizedPhone || !password) {
    throw new Error("Vui lòng nhập số điện thoại và mật khẩu mới.");
  }

  const { data, reply } = await postJson(
    CHANGE_PASSWORD_API_URL,
    {
      UserChangePasswordRequest: {
        phone_number: normalizedPhone,
        password,
      },
    },
    REPLY_KEYS.changePassword,
    "Không thể đổi mật khẩu.",
  );

  return {
    phoneNumber: normalizedPhone,
    reply,
    raw: data,
  };
}
