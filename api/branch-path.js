let serverCache = null;
let lastFetched = 0;
const CACHE_DURATION = 5 * 60 * 1000; // Thành phần ngành/mã ít đổi trong phiên → cache dài hơn cash flow.
const API_ACCOUNT = "thao.dtt";

async function fetchBranchPathFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getBranchPath", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ BranchPathRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const code = data?.BranchPathReply?.codeReply?.codeID;
  const branchs = data?.BranchPathReply?.branchs;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(branchs)) {
    throw new Error("API response missing branchs");
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const now = Date.now();

  if (!serverCache || now - lastFetched > CACHE_DURATION) {
    try {
      serverCache = await fetchBranchPathFromSource();
      lastFetched = now;
    } catch (error) {
      console.error("Failed to refresh branch path cache from source:", error);
      if (!serverCache) {
        return res.status(502).json({
          error: "Failed to load data from source",
          details: error.message,
        });
      }
    }
  }

  try {
    const reply = serverCache?.BranchPathReply || {};
    return res.status(200).json({
      BranchPathReply: {
        codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
        branchs: Array.isArray(reply.branchs) ? reply.branchs : [],
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to process data", details: error.message });
  }
}
