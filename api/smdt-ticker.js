let serverCache = null;
let lastFetched = 0;
const CACHE_DURATION = 3 * 1000;
const API_ACCOUNT = "thao.dtt";
const REPLY_KEYS = ["SMDTTickerReply", "SMDTTickerRequest"];

function parseLimit(value) {
  if (value == null || value === "" || value === "all" || value === "full") return null;
  const limit = parseInt(value, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 150;
}

function getReply(data) {
  for (const key of REPLY_KEYS) {
    if (data?.[key]) return data[key];
  }
  return null;
}

async function fetchSMDTTickerFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getSMDTTicker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ SMDTTickerRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const reply = getReply(data);
  const code = reply?.codeReply?.codeID;
  const datas = reply?.SMDTDatas;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(datas)) {
    throw new Error("API response missing SMDTDatas");
  }

  return data;
}

function sliceReply(data, limit) {
  const replyKey = REPLY_KEYS.find((key) => data?.[key]) || "SMDTTickerReply";
  const sourceReply = getReply(data) || {};
  const datas = Array.isArray(sourceReply.SMDTDatas) ? sourceReply.SMDTDatas : [];

  return {
    [replyKey]: {
      codeReply: sourceReply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
      SMDTDatas: datas.map((d) => ({
        ...d,
        smdts: Array.isArray(d.smdts) ? (limit ? d.smdts.slice(-limit) : d.smdts) : [],
      })),
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
      serverCache = await fetchSMDTTickerFromSource();
      lastFetched = now;
    } catch (error) {
      console.error("Failed to refresh SMDT ticker cache from source:", error);
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
