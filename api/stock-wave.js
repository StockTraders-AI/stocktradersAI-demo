let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 3 * 1000;
const API_ACCOUNT = "thao.dtt";
const STOCK_WAVE_REPLY_KEYS = ["StockWaveReply", "StockWaveRequest"];

function parseLimit(value) {
  if (value == null || value === "" || value === "all" || value === "full") return null;
  const limit = parseInt(value, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 150;
}

async function fetchStockWaveFromSource() {
  const payload = { StockWaveRequest: { account: API_ACCOUNT } };

  const response = await fetch("https://stocktraders.vn/service/data/getStockWave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const reply = getStockWaveReply(data);
  const code = reply?.codeReply?.codeID;
  const waveDatas = reply?.stockWaves?.waveDatas;
  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(waveDatas)) {
    throw new Error("API response missing waveDatas");
  }
  return data;
}

function getStockWaveReply(data) {
  for (const key of STOCK_WAVE_REPLY_KEYS) {
    if (data?.[key]) {
      return data[key];
    }
  }
  return null;
}

function sliceReply(data, limit) {
  const replyKey = STOCK_WAVE_REPLY_KEYS.find((key) => data?.[key]) || "StockWaveReply";
  const sourceReply = getStockWaveReply(data) || {};
  const stockWaves = sourceReply.stockWaves || {};
  const waveDatas = Array.isArray(stockWaves.waveDatas) ? stockWaves.waveDatas : [];

  return {
    [replyKey]: {
      codeReply: sourceReply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
      stockWaves: {
        ...stockWaves,
        waveDatas: limit ? waveDatas.slice(-limit) : waveDatas,
      },
    },
  };
}

async function refreshCache() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetchStockWaveFromSource()
    .then((data) => {
      serverCache = data;
      lastFetched = Date.now();
      return data;
    })
    .catch((error) => {
      console.error("Failed to refresh stock wave cache from source:", error);
      if (!serverCache) throw error;
      return serverCache;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function getStockWaveData() {
  const isStale = !serverCache || Date.now() - lastFetched > CACHE_DURATION;

  if (!serverCache) {
    await refreshCache();
  } else if (isStale) {
    refreshCache();
  }

  return serverCache;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=120");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const limit = parseLimit(req.query.limit);

  try {
    const data = await getStockWaveData();
    return res.status(200).json(sliceReply(data, limit));
  } catch (error) {
    return res.status(502).json({
      error: "Failed to load data from source",
      details: error.message,
    });
  }
}
