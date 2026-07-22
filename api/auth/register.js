import {
  assertOtpSigningConfig,
  getEnvConfig,
  getRegisterUrl,
  methodNotAllowed,
  normalizePhone,
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
    const phone = normalizePhone(request.phone_number || body.phoneNumber || body.phone);
    const config = getEnvConfig();
    assertOtpSigningConfig(config);

    verifyOtpProof({
      verificationToken: body.otpVerificationToken,
      phone,
      purpose: "register",
      signingSecret: config.signingSecret,
    });

    const data = await postStocktradersJson(
      getRegisterUrl(),
      {
        UserRegisterRequest: {
          ...request,
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
