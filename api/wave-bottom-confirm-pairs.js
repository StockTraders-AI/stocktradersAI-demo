import { handleWaveBottomConfirmPairs } from "../server/do-song/waveBottomConfirmPairsCache.js";

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  await handleWaveBottomConfirmPairs(req, res);
}
