import { clearAuthSessionCookie, setSameOriginCors } from "../_auth.js";

export default async function handler(req, res) {
  if (setSameOriginCors(req, res, "POST, OPTIONS")) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  clearAuthSessionCookie(res);
  return res.status(200).json({ ok: true });
}
