let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 3 * 1000;
const API_ACCOUNT = "thao.dtt";
const REPLY_KEYS = ["StockSignalReply", "StockSignalRequest"];

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return null;
}

async function fetchStockSignalFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getStockSignal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ StockSignalRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const reply = getReply(data);
  const code = reply?.codeReply?.codeID;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }

  return data;
}

async function refreshCache() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetchStockSignalFromSource()
    .then((data) => {
      serverCache = data;
      lastFetched = Date.now();
      return data;
    })
    .catch((error) => {
      console.error("Failed to refresh stock signal cache from source:", error);
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
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3, stale-while-revalidate=30");

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

  return res.status(200).json(serverCache);
}
