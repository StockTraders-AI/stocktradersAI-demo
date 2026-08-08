import {
  assertStocktradersSuccess,
  getChangePasswordUrl,
  methodNotAllowed,
  normalizePhone,
  normalizeText,
  postStocktradersJson,
  readJsonBody,
  setCors,
} from "../_otp.js";

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJsonBody(req);
    const request = body.UserChangePasswordRequest || {};
    const phone = normalizePhone(request.phone_number || body.phoneNumber || body.phone);
    const password = normalizeText(request.password || body.password);
    const otp = normalizeText(request.otp || body.otp);
    if (!password || !otp) throw new Error("Vui lòng nhập OTP và mật khẩu mới.");

    const data = await postStocktradersJson(
      getChangePasswordUrl(),
      {
        UserChangePasswordRequest: {
          ...request,
          phone_number: phone,
          password,
          otp,
        },
      },
      "Không thể đổi mật khẩu.",
    );
    assertStocktradersSuccess(data, ["UserChangePasswordReply", "UserChangePasswordRequest"], "Không thể đổi mật khẩu.");

    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ error: error?.message || "Không thể đổi mật khẩu." });
  }
}
