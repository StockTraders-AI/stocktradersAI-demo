import { handleConditionSignalLatest } from "../server/do-song/conditionSignalApi.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  await handleConditionSignalLatest(req, res, req.url);
}
