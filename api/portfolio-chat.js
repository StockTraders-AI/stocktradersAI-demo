import { requireAuth, setSameOriginCors } from "./_auth.js";
import { withSecureData } from "./_secure.js";

const DEFAULT_PORTFOLIO_CHAT_URL = "http://112.213.91.235:8000/api/portfolio-chat";

function normalizeText(value) {
  return String(value || "").trim();
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handler(req, res) {
  if (setSameOriginCors(req, res, "POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const response = await fetch(
      normalizeText(process.env.PORTFOLIO_CHAT_API_URL || DEFAULT_PORTFOLIO_CHAT_URL),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Failed to load portfolio chat", details: error.message });
  }
}

export default withSecureData(handler, { methods: "POST, OPTIONS" });
