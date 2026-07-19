import {
  assertSmsConfig,
  createOtpCode,
  createRequestId,
  getEnvConfig,
  getOtpPurpose,
  methodNotAllowed,
  normalizePhone,
  readJsonBody,
  renderOtpMessage,
  requestFptAccessToken,
  sendFptOtpMessage,
  setCors,
  signOtpChallenge,
} from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJsonBody(req);
    const phone = normalizePhone(body.phoneNumber || body.phone);
    const purpose = getOtpPurpose(body.purpose);
    const config = getEnvConfig();
    assertSmsConfig(config);

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
