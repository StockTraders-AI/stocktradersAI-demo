const API_ACCOUNT = "thao.dtt";
const SOURCE_URL = "https://stocktraders.vn/service/data/getStockNoti";
const CACHE_DURATION = 15 * 1000;
const REPLY_KEYS = ["StockNotiReply", "StockNotiRequest"];
const cacheByDate = new Map();

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return data || {};
}

function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y
      ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
      : "";
  }
  return date.slice(0, 10);
}

async function fetchStockNotiFromSource(date) {
  const response = await fetch(SOURCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ StockNotiRequest: { account: API_ACCOUNT, date } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const code = getReply(data)?.codeReply?.codeID;
  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=15, stale-while-revalidate=120",
  );

  if (req.method === "OPTIONS") return res.status(200).end();

  const date = toDateInputValue(String(req.query.date || ""));
  if (!date) return res.status(400).json({ error: "Missing date" });

  const now = Date.now();
  const cached = cacheByDate.get(date);
  const wantsFresh = req.query.fresh === "1" || req.query.fresh === "true";
  if (wantsFresh) res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!cached || wantsFresh || now - cached.lastFetched > CACHE_DURATION) {
    try {
      const request =
        !wantsFresh && cached?.promise
          ? cached.promise
          : fetchStockNotiFromSource(date)
              .then((data) => {
                cacheByDate.set(date, { data, lastFetched: Date.now() });
                return data;
              })
              .catch((error) => {
                const fallback = cacheByDate.get(date);
                if (fallback?.data) return fallback.data;
                throw error;
              })
              .finally(() => {
                const latest = cacheByDate.get(date);
                if (latest?.promise === request) {
                  const { promise, ...rest } = latest;
                  cacheByDate.set(date, rest);
                }
              });
      cacheByDate.set(date, {
        ...(cached || {}),
        promise: request,
        lastFetched: cached?.lastFetched || 0,
      });
      await request;
    } catch (error) {
      console.error("Failed to refresh stock noti cache from source:", error);
      if (!cached) {
        return res
          .status(502)
          .json({
            error: "Failed to load data from source",
            details: error.message,
          });
      }
    }
  }

  return res.status(200).json(cacheByDate.get(date)?.data || cached.data);
}
