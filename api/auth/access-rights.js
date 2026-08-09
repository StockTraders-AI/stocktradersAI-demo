import { postStocktradersJson, readJsonBody } from "../_otp.js";
import { setAuthSessionCookie, setSameOriginCors } from "../_auth.js";

const DEFAULT_ACCESS_RIGHTS_URL = "https://stocktraders.vn/service/data/getAccessRights";
const SUCCESS_CODE = "S0000";

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

function readReply(data) {
  return data?.AccessRightsReply || data?.AccessRightsRequest || data || {};
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
  const statusDecision = toStatusAccessDecision(
    findByLooseKey(reply, new Set(["status", "accessstatus", "rightstatus", "packagestatus"])),
  );
  if (statusDecision !== undefined) return statusDecision;

  const accessDecision = toAccessDecision(
    findByLooseKey(
      reply,
      new Set([
        "access",
        "allow",
        "allowed",
        "hasaccess",
        "hasright",
        "hasrights",
        "isaccess",
        "isallowed",
        "ispaid",
        "isright",
        "isrights",
        "paid",
        "premium",
        "permission",
        "right",
        "rights",
      ]),
    ),
  );
  if (accessDecision !== undefined) return accessDecision;

  const packageDecision = toAccessDecision(
    findByLooseKey(reply, new Set(["package", "packagecode", "packagename", "packageid", "plan", "level"])),
  );
  if (packageDecision !== undefined) return packageDecision;

  return false;
}

export default async function handler(req, res) {
  if (setSameOriginCors(req, res, "POST, OPTIONS")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const account = normalizeText(body?.AccessRightsRequest?.account || body?.account);
    if (!account) {
      return res.status(400).json({ error: "Missing account" });
    }

    const data = await postStocktradersJson(
      normalizeText(process.env.STOCKTRADERS_ACCESS_RIGHTS_API_URL || DEFAULT_ACCESS_RIGHTS_URL),
      {
        AccessRightsRequest: {
          account,
        },
      },
      "Tài khoản chưa có quyền truy cập.",
    );

    const reply = readReply(data);
    const code = readCode(reply);
    if (code && code !== SUCCESS_CODE) {
      return res.status(403).json({ error: readMessage(reply) || "Tài khoản chưa có quyền truy cập.", data });
    }

    if (!readAccessAllowed(reply)) {
      return res.status(403).json({ error: readMessage(reply) || "Tài khoản chưa mua gói nên chưa thể xem tính năng.", data });
    }

    setAuthSessionCookie(res, {
      account,
      access: "premium",
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ error: error?.message || "Không thể kiểm tra quyền truy cập." });
  }
}
