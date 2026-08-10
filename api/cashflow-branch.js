import { requireAuth, setSameOriginCors } from "./_auth.js";
import { readRequestParams } from "./_request.js";
import { withSecureData } from "./_secure.js";

let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 15 * 1000;
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

async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;

  const now = Date.now();
  const params = await readRequestParams(req);
  const limit = parseLimit(params.limit);

  async function refreshCache() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetchCashFlowBranchFromSource()
      .then((data) => {
        serverCache = data;
        lastFetched = Date.now();
        return data;
      })
      .catch((error) => {
        console.error("Failed to refresh cash flow branch cache from source:", error);
        if (!serverCache) throw error;
        return serverCache;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  if (!serverCache || now - lastFetched > CACHE_DURATION) {
    try {
      await refreshCache();
    } catch (error) {
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

export default withSecureData(handler, { methods: "GET, POST, OPTIONS" });
