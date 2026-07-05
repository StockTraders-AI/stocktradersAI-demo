import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const APP_CACHE_VERSION =
  process.env.VITE_APP_CACHE_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  `${process.env.npm_package_version || "local"}-${Date.now()}`;

// Local cache variables for dev server
let devCache = null;
let devLastFetched = 0;
let stockWaveDevCache = null;
let stockWaveDevLastFetched = 0;
let cashFlowDevCache = null;
let cashFlowDevLastFetched = 0;
let cashFlowTickerDevCache = null;
let cashFlowTickerDevLastFetched = 0;
let cashFlowTickerDevRefreshPromise = null;
let totalTradeTickerDevCache = null;
let totalTradeTickerDevLastFetched = 0;
let totalTradeTickerDevRefreshPromise = null;
let totalTradeDevCache = null;
let totalTradeDevLastFetched = 0;
let totalTradeDevRefreshPromise = null;
let totalTradeRealDevCache = null;
let totalTradeRealDevLastFetched = 0;
let totalTradeRealDevRefreshPromise = null;
let smdtTickerDevCache = null;
let smdtTickerDevLastFetched = 0;
let stockSignalDevCache = null;
let stockSignalDevLastFetched = 0;
let branchPathDevCache = null;
let branchPathDevLastFetched = 0;
const BRANCH_PATH_CACHE_DURATION = 5 * 60 * 1000; // Thành phần ngành/mã ít đổi → cache dài hơn.
const TOTAL_TRADE_CACHE_DURATION = 5 * 60 * 1000;
const TOTAL_TRADE_REAL_CACHE_DURATION = 10 * 1000;
const CACHE_DURATION = 3 * 1000; // Realtime là đường chính; proxy chỉ phục vụ snapshot ban đầu + lưới dự phòng, giữ ngắn để tươi.
const API_ACCOUNT = "thao.dtt";
const STOCK_WAVE_REPLY_KEYS = ["StockWaveReply", "StockWaveRequest"];
const CASH_FLOW_TICKER_REPLY_KEYS = ["CashFlowTickerReply", "CashFlowTickerRequest"];
const SMDT_TICKER_REPLY_KEYS = ["SMDTTickerReply", "SMDTTickerRequest"];
const MARKET_INDEX_TICKERS = new Set(["VNINDEX", "HNXINDEX", "UPCOM"]);

function normalizeMarketTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function filterMarketIndexRows(data) {
  const reply = data?.TotalTradeRealReply || data?.TotalTradeRealRequest || {};
  const rows = Array.isArray(reply.stockTotalReals) ? reply.stockTotalReals : [];
  return rows.filter((row) => MARKET_INDEX_TICKERS.has(normalizeMarketTicker(row?.ticker)));
}

async function fetchStockWaveFromSource() {
  const payload = { StockWaveRequest: { account: API_ACCOUNT } };

  const response = await fetch("https://stocktraders.vn/service/data/getStockWave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const reply = getStockWaveReply(data);
  const code = reply?.codeReply?.codeID;
  const waveDatas = reply?.stockWaves?.waveDatas;
  if (code && code !== "S0000") throw new Error(`API response code ${code}`);
  if (!Array.isArray(waveDatas)) throw new Error("API response missing waveDatas");
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

function getCashFlowTickerReply(data) {
  for (const key of CASH_FLOW_TICKER_REPLY_KEYS) {
    if (data?.[key]) {
      return data[key];
    }
  }
  return null;
}

async function refreshCashFlowTickerDevCache() {
  if (cashFlowTickerDevRefreshPromise) return cashFlowTickerDevRefreshPromise;

  cashFlowTickerDevRefreshPromise = (async () => {
    const response = await fetch("https://stocktraders.vn/service/data/getCashFlowTicker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ CashFlowTickerRequest: { account: API_ACCOUNT } })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const reply = getCashFlowTickerReply(data);
    const code = reply?.codeReply?.codeID;
    if (code && code !== "S0000") throw new Error(`API response code ${code}`);
    cashFlowTickerDevCache = data;
    cashFlowTickerDevLastFetched = Date.now();
    return data;
  })()
    .catch((err) => {
      console.error("Local dev cash flow ticker proxy fetch error:", err);
      if (!cashFlowTickerDevCache) throw err;
      return cashFlowTickerDevCache;
    })
    .finally(() => {
      cashFlowTickerDevRefreshPromise = null;
    });

  return cashFlowTickerDevRefreshPromise;
}

async function fetchTotalTradeFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getTotalTrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TotalTradeRequest: { account: API_ACCOUNT } })
  });
  if (!response.ok) throw new Error(`TotalTrade HTTP ${response.status}`);

  const data = await response.json();
  const reply = data?.TotalTradeReply || data?.TotalTradeRequest || {};
  const code = reply?.codeReply?.codeID;
  const stockTotals = reply?.stockTotals;
  if (code && code !== "S0000") throw new Error(`TotalTrade API response code ${code}`);
  if (!Array.isArray(stockTotals)) throw new Error("TotalTrade API response missing stockTotals");

  return data;
}

async function fetchTotalTradeRealFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getTotalTradeReal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TotalTradeRealRequest: { account: API_ACCOUNT } })
  });
  if (!response.ok) throw new Error(`TotalTradeReal HTTP ${response.status}`);

  const data = await response.json();
  const reply = data?.TotalTradeRealReply || data?.TotalTradeRealRequest || {};
  const code = reply?.codeReply?.codeID;
  const stockTotalReals = reply?.stockTotalReals;
  if (code && code !== "S0000") throw new Error(`TotalTradeReal API response code ${code}`);
  if (!Array.isArray(stockTotalReals)) throw new Error("TotalTradeReal API response missing stockTotalReals");

  return data;
}

async function fetchTotalTradeTickersFromSource() {
  const data = await fetchTotalTradeFromSource();
  const reply = data?.TotalTradeReply || data?.TotalTradeRequest || {};
  const stockTotals = reply?.stockTotals;
  return stockTotals
    .map((item) => item?.ticker || item?.code || item?.symbol)
    .filter(Boolean)
    .map((ticker) => String(ticker).trim().toUpperCase());
}

async function refreshTotalTradeTickersDevCache() {
  if (totalTradeTickerDevRefreshPromise) return totalTradeTickerDevRefreshPromise;

  totalTradeTickerDevRefreshPromise = fetchTotalTradeTickersFromSource()
    .then((tickers) => {
      totalTradeTickerDevCache = tickers;
      totalTradeTickerDevLastFetched = Date.now();
      return tickers;
    })
    .catch((err) => {
      console.error("Local dev total trade ticker proxy fetch error:", err);
      return totalTradeTickerDevCache || [];
    })
    .finally(() => {
      totalTradeTickerDevRefreshPromise = null;
    });

  return totalTradeTickerDevRefreshPromise;
}

async function getTotalTradeTickers({ fresh = false, waitForInitial = false } = {}) {
  const now = Date.now();
  if (!fresh && totalTradeTickerDevCache && (now - totalTradeTickerDevLastFetched <= TOTAL_TRADE_CACHE_DURATION)) {
    return totalTradeTickerDevCache;
  }

  if (fresh || waitForInitial || !totalTradeTickerDevCache) {
    return refreshTotalTradeTickersDevCache();
  }

  refreshTotalTradeTickersDevCache();
  return totalTradeTickerDevCache || [];
}

async function refreshTotalTradeDevCache() {
  if (totalTradeDevRefreshPromise) return totalTradeDevRefreshPromise;

  totalTradeDevRefreshPromise = fetchTotalTradeFromSource()
    .then((data) => {
      totalTradeDevCache = data;
      totalTradeDevLastFetched = Date.now();
      return data;
    })
    .catch((err) => {
      console.error("Local dev total trade proxy fetch error:", err);
      if (!totalTradeDevCache) throw err;
      return totalTradeDevCache;
    })
    .finally(() => {
      totalTradeDevRefreshPromise = null;
    });

  return totalTradeDevRefreshPromise;
}

async function refreshTotalTradeRealDevCache() {
  if (totalTradeRealDevRefreshPromise) return totalTradeRealDevRefreshPromise;

  totalTradeRealDevRefreshPromise = fetchTotalTradeRealFromSource()
    .then((data) => {
      totalTradeRealDevCache = data;
      totalTradeRealDevLastFetched = Date.now();
      return data;
    })
    .catch((err) => {
      console.error("Local dev total trade real proxy fetch error:", err);
      if (!totalTradeRealDevCache) throw err;
      return totalTradeRealDevCache;
    })
    .finally(() => {
      totalTradeRealDevRefreshPromise = null;
    });

  return totalTradeRealDevRefreshPromise;
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

function filterCashFlowTickerBucket(bucket, allowedTickerSet) {
  const filtered = { ...bucket };
  if (Array.isArray(bucket?.cashTickerDatas)) {
    filtered.cashTickerDatas = filterCashTickerDatas(bucket.cashTickerDatas, allowedTickerSet);
  }
  if (Array.isArray(bucket?.cashFlowTickerDatas)) {
    filtered.cashFlowTickerDatas = filterCashTickerDatas(bucket.cashFlowTickerDatas, allowedTickerSet);
  }
  return filtered;
}

function getSMDTTickerReply(data) {
  for (const key of SMDT_TICKER_REPLY_KEYS) {
    if (data?.[key]) {
      return data[key];
    }
  }
  return null;
}

function parseOptionalLimit(value) {
  if (value == null || value === "" || value === "all" || value === "full") return null;
  const limit = parseInt(value, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 150;
}

function smdtDevPlugin() {
  return {
    name: "smdt-dev-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Parse request URL
        const reqUrl = req.url || "";
        if (reqUrl.startsWith("/api/smdt-ticker")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          if (!smdtTickerDevCache || (now - smdtTickerDevLastFetched > CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getSMDTTicker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ SMDTTickerRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              const reply = getSMDTTickerReply(data);
              const code = reply?.codeReply?.codeID;
              if (code && code !== "S0000") throw new Error(`API response code ${code}`);
              smdtTickerDevCache = data;
              smdtTickerDevLastFetched = now;
            } catch (err) {
              console.error("Local dev smdt ticker proxy fetch error:", err);
              if (!smdtTickerDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const replyKey = SMDT_TICKER_REPLY_KEYS.find((key) => smdtTickerDevCache?.[key]) || "SMDTTickerReply";
            const reply = getSMDTTickerReply(smdtTickerDevCache) || {};
            const datas = Array.isArray(reply.SMDTDatas) ? reply.SMDTDatas : [];
            const out = {
              [replyKey]: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                SMDTDatas: datas.map((item) => ({
                  ...item,
                  smdts: Array.isArray(item.smdts) ? (limit ? item.smdts.slice(-limit) : item.smdts) : []
                }))
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/smdt")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          if (!devCache || (now - devLastFetched > CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getSMDTBranch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ SMDTBranchRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              devCache = data;
              devLastFetched = now;
            } catch (err) {
              console.error("Local dev proxy fetch error:", err);
              if (!devCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const originalDatas = devCache?.SMDTBranchReply?.SMDTDatas || [];
            const slicedDatas = originalDatas.map(branch => {
              const originalSmdts = branch.smdts || [];
              const slicedSmdts = limit ? originalSmdts.slice(-limit) : originalSmdts;
              return { ...branch, smdts: slicedSmdts };
            });

            const reply = {
              SMDTBranchReply: {
                codeReply: devCache?.SMDTBranchReply?.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                SMDTDatas: slicedDatas
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(reply));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/stock-wave")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          if (!stockWaveDevCache || (now - stockWaveDevLastFetched > CACHE_DURATION)) {
            try {
              stockWaveDevCache = await fetchStockWaveFromSource();
              stockWaveDevLastFetched = now;
            } catch (err) {
              console.error("Local dev stock wave proxy fetch error:", err);
              if (!stockWaveDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const replyKey = STOCK_WAVE_REPLY_KEYS.find((key) => stockWaveDevCache?.[key]) || "StockWaveReply";
            const stockWaveReply = getStockWaveReply(stockWaveDevCache) || {};
            const stockWaves = stockWaveReply.stockWaves || {};
            const waveDatas = Array.isArray(stockWaves.waveDatas) ? stockWaves.waveDatas : [];
            const reply = {
              [replyKey]: {
                codeReply: stockWaveReply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                stockWaves: {
                  ...stockWaves,
                  waveDatas: limit ? waveDatas.slice(-limit) : waveDatas
                }
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(reply));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/cashflow-branch")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          if (!cashFlowDevCache || (now - cashFlowDevLastFetched > CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getCashFlowBranch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ CashFlowBranchRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              cashFlowDevCache = data;
              cashFlowDevLastFetched = now;
            } catch (err) {
              console.error("Local dev cash flow proxy fetch error:", err);
              if (!cashFlowDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const reply = cashFlowDevCache?.CashFlowBranchReply || {};
            const originalBuckets = Array.isArray(reply.cashFlowBranchs) ? reply.cashFlowBranchs : [];
            const slicedBuckets = limit ? originalBuckets.slice(-limit) : originalBuckets;

            const out = {
              CashFlowBranchReply: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                cashFlowBranchs: slicedBuckets
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/total-trade-real")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const wantsFresh = parsedUrl.searchParams.get("fresh") === "1" || parsedUrl.searchParams.get("fresh") === "true";
          const now = Date.now();

          try {
            if (!totalTradeRealDevCache || wantsFresh) {
              await refreshTotalTradeRealDevCache();
            } else if (now - totalTradeRealDevLastFetched > TOTAL_TRADE_REAL_CACHE_DURATION) {
              refreshTotalTradeRealDevCache();
            }
            const reply = totalTradeRealDevCache?.TotalTradeRealReply || totalTradeRealDevCache?.TotalTradeRealRequest || {};
            const out = {
              TotalTradeRealReply: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                stockTotalReals: filterMarketIndexRows(totalTradeRealDevCache)
              }
            };
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/total-trade")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const wantsFresh = parsedUrl.searchParams.get("fresh") === "1" || parsedUrl.searchParams.get("fresh") === "true";
          const now = Date.now();

          try {
            if (!totalTradeDevCache || wantsFresh || now - totalTradeDevLastFetched > TOTAL_TRADE_CACHE_DURATION) {
              await refreshTotalTradeDevCache();
            }
            const reply = totalTradeDevCache?.TotalTradeReply || totalTradeDevCache?.TotalTradeRequest || {};
            const out = {
              TotalTradeReply: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                stockTotals: Array.isArray(reply.stockTotals) ? reply.stockTotals : []
              }
            };
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", wantsFresh ? "no-store, max-age=0" : "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/cashflow-ticker")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const wantsFresh = parsedUrl.searchParams.get("fresh") === "1" || parsedUrl.searchParams.get("fresh") === "true";
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          // Khi thiếu snapshot hoặc danh sách mã, nạp song song để first paint nhanh nhất.
          const needSnapshot = !cashFlowTickerDevCache || wantsFresh;
          const needTickers = !totalTradeTickerDevCache || wantsFresh;

          let allowedTickers;
          try {
            if (needSnapshot || needTickers) {
              [, allowedTickers] = await Promise.all([
                needSnapshot ? refreshCashFlowTickerDevCache() : Promise.resolve(cashFlowTickerDevCache),
                getTotalTradeTickers({ fresh: wantsFresh, waitForInitial: true }),
              ]);
            } else {
              // Cache nóng: trả ngay, làm tươi ở nền nếu đã cũ (stale-while-revalidate).
              if (now - cashFlowTickerDevLastFetched > CACHE_DURATION) refreshCashFlowTickerDevCache();
              allowedTickers = await getTotalTradeTickers({ fresh: false, waitForInitial: false });
            }
          } catch (err) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
            return;
          }

          try {
            const replyKey = CASH_FLOW_TICKER_REPLY_KEYS.find((key) => cashFlowTickerDevCache?.[key]) || "CashFlowTickerReply";
            const reply = getCashFlowTickerReply(cashFlowTickerDevCache) || {};
            const buckets = Array.isArray(reply.cashFlowTickers) ? reply.cashFlowTickers : [];
            const allowedTickerSet = new Set(allowedTickers);
            const out = {
              [replyKey]: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                allowedTickers,
                cashFlowTickers: (limit ? buckets.slice(-limit) : buckets).map((bucket) => allowedTickerSet.size > 0 ? filterCashFlowTickerBucket(bucket, allowedTickerSet) : bucket)
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/smdt-ticker")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          if (!smdtTickerDevCache || (now - smdtTickerDevLastFetched > CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getSMDTTicker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ SMDTTickerRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              const reply = getSMDTTickerReply(data);
              const code = reply?.codeReply?.codeID;
              if (code && code !== "S0000") throw new Error(`API response code ${code}`);
              smdtTickerDevCache = data;
              smdtTickerDevLastFetched = now;
            } catch (err) {
              console.error("Local dev smdt ticker proxy fetch error:", err);
              if (!smdtTickerDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const replyKey = SMDT_TICKER_REPLY_KEYS.find((key) => smdtTickerDevCache?.[key]) || "SMDTTickerReply";
            const reply = getSMDTTickerReply(smdtTickerDevCache) || {};
            const datas = Array.isArray(reply.SMDTDatas) ? reply.SMDTDatas : [];
            const out = {
              [replyKey]: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                // Mỗi cổ phiếu có chuỗi smdts theo ngày; slice giữ `limit` phiên gần nhất.
                SMDTDatas: datas.map((d) => ({
                  ...d,
                  smdts: Array.isArray(d.smdts) ? (limit ? d.smdts.slice(-limit) : d.smdts) : []
                }))
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/smdt-ticker")) {
          const host = req.headers.host || "localhost:3000";
          const parsedUrl = new URL(reqUrl, `http://${host}`);
          const limit = parseOptionalLimit(parsedUrl.searchParams.get("limit"));

          const now = Date.now();
          if (!smdtTickerDevCache || (now - smdtTickerDevLastFetched > CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getSMDTTicker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ SMDTTickerRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              const reply = getSMDTTickerReply(data);
              const code = reply?.codeReply?.codeID;
              if (code && code !== "S0000") throw new Error(`API response code ${code}`);
              smdtTickerDevCache = data;
              smdtTickerDevLastFetched = now;
            } catch (err) {
              console.error("Local dev SMDT ticker proxy fetch error:", err);
              if (!smdtTickerDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const replyKey = SMDT_TICKER_REPLY_KEYS.find((key) => smdtTickerDevCache?.[key]) || "SMDTTickerReply";
            const reply = getSMDTTickerReply(smdtTickerDevCache) || {};
            const datas = Array.isArray(reply.SMDTDatas) ? reply.SMDTDatas : [];
            const out = {
              [replyKey]: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                SMDTDatas: datas.map((item) => ({
                  ...item,
                  smdts: Array.isArray(item.smdts) ? (limit ? item.smdts.slice(-limit) : item.smdts) : []
                }))
              }
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (reqUrl.startsWith("/api/stock-signal")) {
          const now = Date.now();
          if (!stockSignalDevCache || (now - stockSignalDevLastFetched > CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getStockSignal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ StockSignalRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              const code = data?.StockSignalReply?.codeReply?.codeID || data?.StockSignalRequest?.codeReply?.codeID;
              if (code && code !== "S0000") throw new Error(`API response code ${code}`);
              stockSignalDevCache = data;
              stockSignalDevLastFetched = now;
            } catch (err) {
              console.error("Local dev stock signal proxy fetch error:", err);
              if (!stockSignalDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store, max-age=0");
          res.end(JSON.stringify(stockSignalDevCache));
        } else if (reqUrl.startsWith("/api/branch-path")) {
          const now = Date.now();
          if (!branchPathDevCache || (now - branchPathDevLastFetched > BRANCH_PATH_CACHE_DURATION)) {
            try {
              const response = await fetch("https://stocktraders.vn/service/data/getBranchPath", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ BranchPathRequest: { account: API_ACCOUNT } })
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              const code = data?.BranchPathReply?.codeReply?.codeID;
              if (code && code !== "S0000") throw new Error(`API response code ${code}`);
              if (!Array.isArray(data?.BranchPathReply?.branchs)) throw new Error("API response missing branchs");
              branchPathDevCache = data;
              branchPathDevLastFetched = now;
            } catch (err) {
              console.error("Local dev branch path proxy fetch error:", err);
              if (!branchPathDevCache) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }

          try {
            const reply = branchPathDevCache?.BranchPathReply || {};
            const out = {
              BranchPathReply: {
                codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
                branchs: Array.isArray(reply.branchs) ? reply.branchs : []
              }
            };
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end(JSON.stringify(out));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        } else {
          next();
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_CACHE_VERSION": JSON.stringify(APP_CACHE_VERSION),
  },
  plugins: [react(), smdtDevPlugin()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Proxy SMDT API to avoid CORS during local dev
      "/service": {
        target: "https://stocktraders.vn",
        changeOrigin: true,
        secure: true,
      },
      "/api/portfolio-chat": {
        target: "http://112.213.91.235:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
