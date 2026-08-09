import { postStocktradersJson, readJsonBody } from "../_otp.js";
import { setSameOriginCors } from "../_auth.js";

const DEFAULT_SOCIAL_LOGIN_URL = "https://stocktraders.vn/service/data/getStockSocial";

function normalizeText(value) {
  return String(value || "").trim();
}

export default async function handler(req, res) {
  if (setSameOriginCors(req, res, "POST, OPTIONS")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const data = await postStocktradersJson(
      normalizeText(process.env.STOCKTRADERS_SOCIAL_LOGIN_API_URL || DEFAULT_SOCIAL_LOGIN_URL),
      body,
      "Không thể đăng nhập bằng mạng xã hội.",
    );
    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ error: error?.message || "Không thể đăng nhập bằng mạng xã hội." });
  }
}
