import { requireAuth, setSameOriginCors } from "./_auth.js";
import { withSecureData } from "./_secure.js";

async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, OPTIONS")) return;
  if (!requireAuth(req, res)) return;

  try {
    const response = await fetch(
      "https://stocktraders.vn/service/data/getStockWave",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          StockWaveRequest: {
            account: "NAM.TT",
          },
        }),
      },
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: "Cannot fetch stock wave history",
      message: error.message,
    });
  }
}

export default withSecureData(handler, { methods: "GET, OPTIONS" });
