import { requireAuth, setSameOriginCors } from "../_auth.js";
import { enforceRateLimit } from "../_ratelimit.js";
import { currentEpoch, deriveDataKey, epochExpiresAt, isSecurePayloadEnabled } from "../_secure.js";

/* Cấp khoá giải mã cho phiên hiện tại.
 *
 * Đây là endpoint duy nhất trả khoá ở dạng đọc được, nên nó nằm sau cookie phiên
 * HttpOnly và có hạn mức riêng chặt hơn các endpoint dữ liệu. Client giữ khoá
 * trong bộ nhớ và xin lại khi hết hạn. */
export default async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, OPTIONS")) return;

  const session = requireAuth(req, res);
  if (!session) return;

  if (!enforceRateLimit(req, res, session, 30)) return;

  if (!isSecurePayloadEnabled()) {
    return res.status(200).json({ enabled: false });
  }

  const epoch = currentEpoch();
  try {
    return res.status(200).json({
      enabled: true,
      epoch,
      key: deriveDataKey(session, epoch).toString("base64url"),
      expiresAt: epochExpiresAt(epoch),
    });
  } catch (error) {
    return res.status(500).json({ error: "Không cấp được khoá dữ liệu.", details: error.message });
  }
}
