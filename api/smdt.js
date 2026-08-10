import { requireAuth, setSameOriginCors } from "./_auth.js";
import { readRequestParams } from "./_request.js";
import { withSecureData } from "./_secure.js";

// Global memory cache in Serverless Function
let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 15 * 1000; // Realtime là đường chính; proxy chỉ phục vụ snapshot ban đầu + lưới dự phòng.
const API_ACCOUNT = "thao.dtt";

function parseLimit(value) {
  if (value == null || value === "" || value === "all" || value === "full") return null;
  const limit = parseInt(value, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 150;
}

async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;

  const now = Date.now();
  const params = await readRequestParams(req);
  const limit = parseLimit(params.limit);

  async function refreshCache() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
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
      lastFetched = Date.now();
      return data;
    })()
      .catch((error) => {
        console.error("Failed to refresh SMDT cache from source:", error);
        if (!serverCache) throw error;
        return serverCache;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  if (!serverCache || (now - lastFetched > CACHE_DURATION)) {
    try {
      await refreshCache();
    } catch (error) {
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

export default withSecureData(handler, { methods: "GET, POST, OPTIONS" });
