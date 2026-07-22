import { methodNotAllowed, normalizeText, readJsonBody, setCors } from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res, "POST, OPTIONS")) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const expectedKey = normalizeText(process.env.FPT_SMS_DLR_AUTHORIZATION_KEY);
    const receivedKey = normalizeText(
      req.headers.authorization ||
        req.headers["x-authorization-key"] ||
        req.headers.authorization_key,
    ).replace(/^Bearer\s+/i, "");

    if (expectedKey && receivedKey !== expectedKey) {
      return res.status(401).json({ status: 0, error: "Unauthorized" });
    }

    const body = await readJsonBody(req);
    console.info("FPT SMS DLR:", {
      smsid: body.smsid,
      status: body.status,
      telco: body.telco,
      receivedAt: new Date().toISOString(),
    });

    return res.status(200).json({ status: 1 });
  } catch (error) {
    console.error("FPT SMS DLR error:", error);
    return res.status(200).json({ status: 1 });
  }
}
