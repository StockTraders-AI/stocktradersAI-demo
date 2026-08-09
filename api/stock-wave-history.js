import { handleStockWaveHistory } from "../server/do-song/stockWaveHistoryCache.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  await handleStockWaveHistory(req, res, req.url);
}

export default withSecureData(handler, { methods: "GET, OPTIONS" });
