import { requireAuth, setSameOriginCors } from "./_auth.js";
import { withSecureData } from "./_secure.js";

let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 5 * 60 * 1000; // Thành phần ngành/mã ít đổi trong phiên → cache dài hơn cash flow.
const API_ACCOUNT = "thao.dtt";

async function fetchBranchPathFromSource() {
  const response = await fetch("https://stocktraders.vn/service/data/getBranchPath", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ BranchPathRequest: { account: API_ACCOUNT } }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const code = data?.BranchPathReply?.codeReply?.codeID;
  const branchs = data?.BranchPathReply?.branchs;

  if (code && code !== "S0000") {
    throw new Error(`API response code ${code}`);
  }
  if (!Array.isArray(branchs)) {
    throw new Error("API response missing branchs");
  }

  return data;
}

async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;

  const now = Date.now();

  async function refreshCache() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetchBranchPathFromSource()
      .then((data) => {
        serverCache = data;
        lastFetched = Date.now();
        return data;
      })
      .catch((error) => {
        console.error("Failed to refresh branch path cache from source:", error);
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
    const reply = serverCache?.BranchPathReply || {};
    return res.status(200).json({
      BranchPathReply: {
        codeReply: reply.codeReply || { codeID: "S0000", codeName: "SUCSESS" },
        branchs: Array.isArray(reply.branchs) ? reply.branchs : [],
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to process data", details: error.message });
  }
}

export default withSecureData(handler, { methods: "GET, POST, OPTIONS" });
