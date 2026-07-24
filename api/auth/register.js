import {
  assertOtpSigningConfig,
  getEnvConfig,
  getRegisterUrl,
  methodNotAllowed,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  postStocktradersJson,
  readJsonBody,
  setCors,
  verifyOtpProof,
} from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJsonBody(req);
    const request = body.UserRegisterRequest || {};
    const otpChannel = normalizeText(body.otpChannel || body.contactType || body.channel).toLowerCase();
    const rawEmail = normalizeText(request.email || body.email || body.identifier);
    const rawPhone = normalizeText(request.phone_number || body.phoneNumber || body.phone || body.identifier);
    const shouldUseEmail = otpChannel === "email" || (otpChannel !== "phone" && rawEmail.includes("@"));
    const email = shouldUseEmail ? normalizeEmail(rawEmail) : normalizeText(request.email || body.email);
    const phone = shouldUseEmail ? normalizeText(request.phone_number || body.phoneNumber || body.phone) : normalizePhone(rawPhone);
    const config = getEnvConfig();
    assertOtpSigningConfig(config);

    verifyOtpProof({
      verificationToken: body.otpVerificationToken,
      ...(shouldUseEmail ? { email } : { phone }),
      purpose: "register",
      signingSecret: config.signingSecret,
    });

    const data = await postStocktradersJson(
      getRegisterUrl(),
      {
        UserRegisterRequest: {
          ...request,
          email,
          phone_number: phone,
        },
      },
      "Không thể tạo tài khoản.",
    );

    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ error: error?.message || "Không thể tạo tài khoản." });
  }
}
