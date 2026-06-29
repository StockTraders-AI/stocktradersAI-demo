let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 5 * 60 * 1000;
const API_ACCOUNT = "thao.dtt";

async function fetchTotalTradeFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getTotalTrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TotalTradeRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const reply = data?.TotalTradeReply || data?.TotalTradeRequest || {};
  const code = reply?.codeReply?.codeID;
  const stockTotals = reply?.stockTotals;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(stockTotals)) {
    throw new Error("API response missing stockTotals");
  }

  return data;
}

async function refreshCache() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetchTotalTradeFromSource()
    .then((data) => {
      serverCache = data;
      lastFetched = Date.now();
      return data;
    })
    .catch((error) => {
      console.error("Failed to refresh total trade cache from source:", error);
      if (!serverCache) throw error;
      return serverCache;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") return res.status(200).end();

  const now = Date.now();
  const wantsFresh = req.query.fresh === "1" || req.query.fresh === "true";
  if (wantsFresh) res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!serverCache || wantsFresh || now - lastFetched > CACHE_DURATION) {
    try {
      await refreshCache();
    } catch (error) {
      return res.status(502).json({ error: "Failed to load data from source", details: error.message });
    }
  }

  const reply = serverCache?.TotalTradeReply || serverCache?.TotalTradeRequest || {};
  return res.status(200).json({
    TotalTradeReply: {
      codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
      stockTotals: Array.isArray(reply.stockTotals) ? reply.stockTotals : [],
    },
  });
}
