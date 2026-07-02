// Global memory cache in Serverless Function
let serverCache = null;
let lastFetched = 0;
const CACHE_DURATION = 3 * 1000; // Realtime là đường chính; proxy chỉ phục vụ snapshot ban đầu + lưới dự phòng, giữ ngắn để tươi.
const API_ACCOUNT = "thao.dtt";

function parseLimit(value) {
  if (value == null || value === "" || value === "all" || value === "full") return null;
  const limit = parseInt(value, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 150;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const now = Date.now();
  const limit = parseLimit(req.query.limit);

  // Fetch from target if cache is missing or expired
  if (!serverCache || (now - lastFetched > CACHE_DURATION)) {
    try {
      const response = await fetch("https://stocktraders.vn/service/data/getSMDTBranch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ SMDTBranchRequest: { account: API_ACCOUNT } })
      });
      if (!response.ok) {
        throw new Error(`External API returned status ${response.status}`);
      }
      const data = await response.json();
      const code = data?.SMDTBranchReply?.codeReply?.codeID;
      if (code && code !== "S0000") {
        throw new Error(`API response code ${code}`);
      }

      serverCache = data;
      lastFetched = now;
    } catch (error) {
      console.error("Failed to refresh SMDT cache from source:", error);
      // Fallback to stale cache if request fails
      if (!serverCache) {
        return res.status(502).json({
          error: "Failed to load data from source",
          details: error.message
        });
      }
    }
  }

  // Slice data based on limit
  try {
    const originalDatas = serverCache?.SMDTBranchReply?.SMDTDatas || [];
    const slicedDatas = originalDatas.map(branch => {
      const originalSmdts = branch.smdts || [];
      const slicedSmdts = limit ? originalSmdts.slice(-limit) : originalSmdts;
      return {
        ...branch,
        smdts: slicedSmdts
      };
    });

    const reply = {
      SMDTBranchReply: {
        codeReply: serverCache?.SMDTBranchReply?.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
        SMDTDatas: slicedDatas
      }
    };

    return res.status(200).json(reply);
  } catch (err) {
    return res.status(500).json({ error: "Failed to process sliced data", details: err.message });
  }
}
