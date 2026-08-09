import { requireAuth, setSameOriginCors } from "./_auth.js";

const API_ACCOUNT = "thao.dtt";
const SOURCE_URL = "https://stocktraders.vn/service/data/getSMDTTickerCross";

export default async function handler(req, res) {
  if (setSameOriginCors(req, res, "POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const response = await fetch(SOURCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ SMDTTickerCrossRequest: { account: API_ACCOUNT } }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Failed to load data from source", details: error.message });
  }
}
