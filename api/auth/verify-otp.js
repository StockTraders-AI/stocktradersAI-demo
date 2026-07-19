import {
  assertOtpSigningConfig,
  getEnvConfig,
  getOtpPurpose,
  methodNotAllowed,
  normalizePhone,
  normalizeText,
  readJsonBody,
  setCors,
  verifyOtpChallenge,
} from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJsonBody(req);
    const phone = normalizePhone(body.phoneNumber || body.phone);
    const purpose = getOtpPurpose(body.purpose);
    const otp = normalizeText(body.otp);
    const challengeToken = normalizeText(body.challengeToken);
    const config = getEnvConfig();
    assertOtpSigningConfig(config);

    if (!/^\d{6}$/.test(otp)) throw new Error("Vui lòng nhập mã OTP 6 chữ số.");
    if (!challengeToken) throw new Error("Thiếu phiên OTP. Vui lòng gửi lại mã.");

    const verificationToken = verifyOtpChallenge({
      challengeToken,
      phone,
      purpose,
      otp,
      signingSecret: config.signingSecret,
      verifiedTtlSeconds: config.verifiedTtlSeconds,
    });

    return res.status(200).json({
      verificationToken,
      expiresIn: config.verifiedTtlSeconds,
    });
  } catch (error) {
    return res.status(400).json({ error: error?.message || "Không thể xác thực OTP." });
  }
}
