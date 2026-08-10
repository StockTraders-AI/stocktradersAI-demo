import { requireAuth, setSameOriginCors } from "./_auth.js";
import { isTruthyParam, readRequestParams } from "./_request.js";
import { withSecureData } from "./_secure.js";

let serverCache = null;
let lastFetched = 0;
let refreshPromise = null;
const CACHE_DURATION = 30 * 1000;
const SOURCE_URL = "https://stocktradersai.vn/service/data/getIndexDailyChanges";

async function fetchIndexDailyChangesFromSource() {
  const response = await fetch(SOURCE_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  const indices = Array.isArray(data?.indices) ? data.indices : null;
  if (!indices) {
    throw new Error("API response missing indices");
  }

  return data;
}

async function refreshCache() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetchIndexDailyChangesFromSource()
    .then((data) => {
      serverCache = data;
      lastFetched = Date.now();
      return data;
    })
    .catch((error) => {
      console.error("Failed to refresh index daily changes cache:", error);
      if (!serverCache) throw error;
      return serverCache;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;

  const now = Date.now();
  const params = await readRequestParams(req);
  const wantsFresh = isTruthyParam(params.fresh);
  if (wantsFresh) res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (!serverCache || wantsFresh) {
    try {
      await refreshCache();
    } catch (error) {
      return res.status(502).json({
        error: "Failed to load index daily changes from source",
        details: error.message,
      });
    }
  } else if (now - lastFetched > CACHE_DURATION) {
    refreshCache();
  }

  return res.status(200).json({
    IndexDailyChangesReply: {
      codeReply: { codeID: "S0000", codeName: "SUCSESS" },
      indices: Array.isArray(serverCache?.indices) ? serverCache.indices : [],
    },
  });
}

export default withSecureData(handler, { methods: "GET, POST, OPTIONS" });
