let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
let totalTradeTickerCache = null;
let totalTradeLastFetched = 0;
let totalTradeRefreshPromise = null;
const CACHE_DURATION = 3 * 1000;
const TOTAL_TRADE_CACHE_DURATION = 5 * 60 * 1000;
const API_ACCOUNT = "thao.dtt";
const REPLY_KEYS = ["CashFlowTickerReply", "CashFlowTickerRequest"];

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return null;
}

async function fetchCashFlowTickerFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getCashFlowTicker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ CashFlowTickerRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const reply = getReply(data);
  const code = reply?.codeReply?.codeID;
  const buckets = reply?.cashFlowTickers;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(buckets)) {
    throw new Error("API response missing cashFlowTickers");
  }

  return data;
}

async function refreshCashFlowTickerCache() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetchCashFlowTickerFromSource()
    .then((data) => {
      serverCache = data;
      lastFetched = Date.now();
      return data;
    })
    .catch((error) => {
      console.error("Failed to refresh cash flow ticker cache from source:", error);
      if (!serverCache) throw error;
      return serverCache;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function fetchTotalTradeTickersFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getTotalTrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TotalTradeRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`TotalTrade API returned status ${response.status}`);
  }

  const data = await response.json();
  const reply = data?.TotalTradeReply || data?.TotalTradeRequest || {};
  const code = reply?.codeReply?.codeID;
  const stockTotals = reply?.stockTotals;

  if (code && code !== "S0000") {
    throw new Error(`TotalTrade API response code ${code}`);
  }
  if (!Array.isArray(stockTotals)) {
    throw new Error("TotalTrade API response missing stockTotals");
  }

  return stockTotals
    .map((item) => item?.ticker || item?.code || item?.symbol)
    .filter(Boolean)
    .map((ticker) => String(ticker).trim().toUpperCase());
}

async function refreshTotalTradeTickersCache() {
  if (totalTradeRefreshPromise) return totalTradeRefreshPromise;

  totalTradeRefreshPromise = fetchTotalTradeTickersFromSource()
    .then((tickers) => {
      totalTradeTickerCache = tickers;
      totalTradeLastFetched = Date.now();
      return tickers;
    })
    .catch((error) => {
      console.error("Failed to refresh total trade ticker cache from source:", error);
      return totalTradeTickerCache || [];
    })
    .finally(() => {
      totalTradeRefreshPromise = null;
    });

  return totalTradeRefreshPromise;
}

async function getTotalTradeTickers({ fresh = false, waitForInitial = false } = {}) {
  const now = Date.now();
  if (!fresh && totalTradeTickerCache && now - totalTradeLastFetched <= TOTAL_TRADE_CACHE_DURATION) {
    return totalTradeTickerCache;
  }

  if (fresh || waitForInitial || !totalTradeTickerCache) {
    return refreshTotalTradeTickersCache();
  }

  refreshTotalTradeTickersCache();
  return totalTradeTickerCache || [];
}

function filterCashTickerDatas(datas, allowedTickerSet) {
  if (!Array.isArray(datas)) return [];
  return datas
    .filter((item) => {
      const ticker = item?.ticker || item?.code || item?.symbol;
      return ticker && allowedTickerSet.has(String(ticker).trim().toUpperCase());
    })
    .map((item) => {
      const ticker = item?.ticker || item?.code || item?.symbol;
      const normalizedTicker = String(ticker || "").trim().toUpperCase();
      return { ...item, ticker: normalizedTicker };
    });
}

function filterBucket(bucket, allowedTickerSet) {
  const filtered = { ...bucket };
  if (Array.isArray(bucket?.cashTickerDatas)) {
    filtered.cashTickerDatas = filterCashTickerDatas(bucket.cashTickerDatas, allowedTickerSet);
  }
  if (Array.isArray(bucket?.cashFlowTickerDatas)) {
    filtered.cashFlowTickerDatas = filterCashTickerDatas(bucket.cashFlowTickerDatas, allowedTickerSet);
  }
  return filtered;
}

function sliceReply(data, limit, allowedTickers) {
  const replyKey = REPLY_KEYS.find((key) => data?.[key]) || "CashFlowTickerReply";
  const sourceReply = getReply(data) || {};
  const buckets = Array.isArray(sourceReply.cashFlowTickers) ? sourceReply.cashFlowTickers : [];
  const allowedTickerSet = new Set(allowedTickers);
  const useAllowedFilter = allowedTickerSet.size > 0;

  return {
    [replyKey]: {
      codeReply: sourceReply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
      allowedTickers,
      cashFlowTickers: useAllowedFilter ? buckets.slice(-limit).map((bucket) => filterBucket(bucket, allowedTickerSet)) : buckets.slice(-limit),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3, stale-while-revalidate=30");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const now = Date.now();
  let limit = parseInt(req.query.limit || "150", 10);
  if (isNaN(limit) || limit <= 0) {
    limit = 150;
  }
  const wantsFresh = req.query.fresh === "1" || req.query.fresh === "true";
  if (wantsFresh) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
  }

  // Khi thiếu snapshot hoặc danh sách mã, nạp song song để first paint nhanh nhất.
  const needSnapshot = !serverCache || wantsFresh;
  const needTickers = !totalTradeTickerCache || wantsFresh;

  let allowedTickers;
  try {
    if (needSnapshot || needTickers) {
      [, allowedTickers] = await Promise.all([
        needSnapshot ? refreshCashFlowTickerCache() : Promise.resolve(serverCache),
        getTotalTradeTickers({ fresh: wantsFresh, waitForInitial: true }),
      ]);
    } else {
      // Cache nóng: trả ngay, làm tươi snapshot/danh sách mã ở nền nếu đã cũ (stale-while-revalidate).
      if (now - lastFetched > CACHE_DURATION) refreshCashFlowTickerCache();
      allowedTickers = await getTotalTradeTickers({ fresh: false, waitForInitial: false });
    }
  } catch (error) {
    if (!serverCache) {
      return res.status(502).json({
        error: "Failed to load data from source",
        details: error.message,
      });
    }
    return res.status(500).json({ error: "Failed to process filtered data", details: error.message });
  }

  try {
    return res.status(200).json(sliceReply(serverCache, limit, allowedTickers));
  } catch (error) {
    return res.status(500).json({ error: "Failed to process filtered data", details: error.message });
  }
}
