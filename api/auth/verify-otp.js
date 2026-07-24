import {
  assertOtpSigningConfig,
  assertStocktradersSuccess,
  getEnvConfig,
  getOtpPurpose,
  getVerifyEmailOtpUrl,
  methodNotAllowed,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  postStocktradersJson,
  readJsonBody,
  setCors,
  signOtpProof,
  verifyOtpChallenge,
} from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJsonBody(req);
    const purpose = getOtpPurpose(body.purpose);
    const otp = normalizeText(body.otp);
    const challengeToken = normalizeText(body.challengeToken);
    const config = getEnvConfig();
    assertOtpSigningConfig(config);

    if (!/^\d{6}$/.test(otp)) throw new Error("Vui lòng nhập mã OTP 6 chữ số.");
    const contactType = normalizeText(body.contactType || body.channel).toLowerCase();
    const emailInput = body.email || body.identifier;
    const shouldUseEmail = contactType === "email" || (contactType !== "phone" && normalizeText(emailInput).includes("@"));

    if (shouldUseEmail) {
      if (purpose !== "register") throw new Error("Xác thực email hiện chỉ dùng cho đăng ký tài khoản.");
      const email = normalizeEmail(emailInput);
      const data = await postStocktradersJson(
        getVerifyEmailOtpUrl(),
        {
          VerifyEmailOtpRequest: {
            email,
            otp,
          },
        },
        "Không thể xác thực OTP email.",
      );
      assertStocktradersSuccess(data, ["VerifyEmailOtpReply", "VerifyEmailOtpRequest"], "Không thể xác thực OTP email.");

      const verificationToken = signOtpProof({
        email,
        purpose,
        signingSecret: config.signingSecret,
        verifiedTtlSeconds: config.verifiedTtlSeconds,
      });

      return res.status(200).json({
        verificationToken,
        channel: "email",
        expiresIn: config.verifiedTtlSeconds,
      });
    }

    const phone = normalizePhone(body.phoneNumber || body.phone || body.identifier);
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
