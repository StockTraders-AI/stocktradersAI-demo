import {
  assertContactOtpRateLimit,
  assertSmsConfig,
  assertOtpRateLimit,
  assertStocktradersSuccess,
  createOtpCode,
  createRequestId,
  getEnvConfig,
  getOtpPurpose,
  getRequestIp,
  getSendEmailOtpUrl,
  methodNotAllowed,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  postStocktradersJson,
  readJsonBody,
  renderOtpMessage,
  requestFptAccessToken,
  sendFptOtpMessage,
  setCors,
  signOtpChallenge,
  verifyTurnstileToken,
} from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJsonBody(req);
    const purpose = getOtpPurpose(body.purpose);
    const config = getEnvConfig();
    const ip = getRequestIp(req);
    const contactType = normalizeText(body.contactType || body.channel).toLowerCase();
    const emailInput = body.email || body.identifier;
    const shouldUseEmail = contactType === "email" || (contactType !== "phone" && normalizeText(emailInput).includes("@"));

    if (shouldUseEmail) {
      if (purpose !== "register") throw new Error("Xác thực email hiện chỉ dùng cho đăng ký tài khoản.");
      const email = normalizeEmail(emailInput);
      await verifyTurnstileToken({ config, token: body.turnstileToken, remoteIp: ip });
      assertContactOtpRateLimit({ config, contact: email, contactKind: "email", purpose, ip });

      const data = await postStocktradersJson(
        getSendEmailOtpUrl(),
        {
          UserSendOtpRequest: {
            email,
          },
        },
        "Không thể gửi OTP qua email.",
      );
      assertStocktradersSuccess(data, ["UserSendOtpReply", "UserSendOtpRequest"], "Không thể gửi OTP qua email.");

      return res.status(200).json({
        channel: "email",
        email,
        expiresIn: config.otpTtlSeconds,
      });
    }

    const phone = normalizePhone(body.phoneNumber || body.phone || body.identifier);
    assertSmsConfig(config);
    await verifyTurnstileToken({ config, token: body.turnstileToken, remoteIp: ip });
    assertOtpRateLimit({ config, phone, purpose, ip });

    const otp = createOtpCode();
    const requestId = createRequestId(purpose, phone);
    const message = renderOtpMessage(config.otpTemplate, otp, config.otpTtlSeconds);
    const challengeToken = signOtpChallenge({
      phone,
      purpose,
      otp,
      ttlSeconds: config.otpTtlSeconds,
      signingSecret: config.signingSecret,
    });

    const { accessToken } = await requestFptAccessToken(config);
    let smsResult;
    try {
      smsResult = await sendFptOtpMessage({ config, accessToken, phone, message, requestId });
    } catch (error) {
      if (!error?.retryToken) throw error;
      const retry = await requestFptAccessToken(config);
      smsResult = await sendFptOtpMessage({ config, accessToken: retry.accessToken, phone, message, requestId });
    }

    return res.status(200).json({
      challengeToken,
      messageId: smsResult.messageId,
      requestId,
      expiresIn: config.otpTtlSeconds,
      ...(config.exposeDebugOtp ? { debugOtp: otp } : null),
    });
  } catch (error) {
    console.error("request-otp error:", error);
    return res.status(400).json({
      error: error?.message || "Không thể gửi OTP.",
      code: error?.code || undefined,
    });
  }
}
