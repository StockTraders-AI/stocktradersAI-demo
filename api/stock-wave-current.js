import stockWaveHandler from "./stock-wave.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  req.query = {
    ...(req.query || {}),
    limit: "1",
  };

  return stockWaveHandler(req, res);
}
