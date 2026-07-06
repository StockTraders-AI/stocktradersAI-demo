let serverCache = null;
let lastFetched = 0;
const CACHE_DURATION = 3 * 1000;
const API_ACCOUNT = "thao.dtt";

function parseLimit(value) {
  if (value == null || value === "" || value === "all" || value === "full") return null;
  const limit = parseInt(value, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 150;
}

async function fetchCashFlowBranchFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getCashFlowBranch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ CashFlowBranchRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const code = data?.CashFlowBranchReply?.codeReply?.codeID;
  const buckets = data?.CashFlowBranchReply?.cashFlowBranchs;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(buckets)) {
    throw new Error("API response missing cashFlowBranchs");
  }

  return data;
}

function sliceReply(data, limit) {
  const sourceReply = data?.CashFlowBranchReply || {};
  const buckets = Array.isArray(sourceReply.cashFlowBranchs) ? sourceReply.cashFlowBranchs : [];

  return {
    CashFlowBranchReply: {
      codeReply: sourceReply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
      cashFlowBranchs: limit ? buckets.slice(-limit) : buckets,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=120");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const now = Date.now();
  const limit = parseLimit(req.query.limit);

  if (!serverCache || now - lastFetched > CACHE_DURATION) {
    try {
      serverCache = await fetchCashFlowBranchFromSource();
      lastFetched = now;
    } catch (error) {
      console.error("Failed to refresh cash flow branch cache from source:", error);
      if (!serverCache) {
        return res.status(502).json({
          error: "Failed to load data from source",
          details: error.message,
        });
      }
    }
  }

  try {
    return res.status(200).json(sliceReply(serverCache, limit));
  } catch (error) {
    return res.status(500).json({ error: "Failed to process sliced data", details: error.message });
  }
}
