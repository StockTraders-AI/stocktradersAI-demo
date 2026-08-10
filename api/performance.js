import { requireAuth, setSameOriginCors } from "./_auth.js";
import { readRequestParams } from "./_request.js";
import { withSecureData } from "./_secure.js";

const CACHE_DURATION = 30 * 1000;
const SOURCE_URL = "https://stocktradersai.vn/service/data/getPerformance";

const serverCache = new Map();

function readBranchPath(params) {
  const raw = params?.branch_path;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || "").trim();
}

function readDate(params) {
  const raw = params?.date;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || "").trim();
}

async function fetchPerformanceFromSource(branchPath, date) {
  const params = new URLSearchParams({ branch_path: branchPath });
  if (date) params.set("date", date);
  const url = `${SOURCE_URL}?${params.toString()}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ branch_path: branchPath, ...(date ? { date } : {}) }),
  });

  if (!response.ok) {
    throw new Error(`External API returned status ${response.status}`);
  }

  const data = await response.json();
  if (data?.status && data.status !== "ok") {
    throw new Error(`API response status ${data.status}`);
  }
  if (!Array.isArray(data?.data)) {
    throw new Error("API response missing data");
  }

  return data;
}

async function handler(req, res) {
  if (setSameOriginCors(req, res, "GET, POST, OPTIONS")) return;
  if (!requireAuth(req, res)) return;

  const params = await readRequestParams(req);
  const branchPath = readBranchPath(params);
  if (!branchPath) {
    return res.status(400).json({ error: "Missing branch_path" });
  }

  const now = Date.now();
  const date = readDate(params);
  const cacheKey = `${branchPath}:${date || "latest"}`;
  const cached = serverCache.get(cacheKey);

  if (!cached || now - cached.lastFetched > CACHE_DURATION) {
    try {
      const request =
        cached?.promise ||
        fetchPerformanceFromSource(branchPath, date)
          .then((data) => {
            serverCache.set(cacheKey, { data, lastFetched: Date.now() });
            return data;
          })
          .catch((error) => {
            const fallback = serverCache.get(cacheKey);
            if (fallback?.data) return fallback.data;
            throw error;
          })
          .finally(() => {
            const latest = serverCache.get(cacheKey);
            if (latest?.promise === request) {
              const { promise, ...rest } = latest;
              serverCache.set(cacheKey, rest);
            }
          });
      serverCache.set(cacheKey, { ...(cached || {}), promise: request, lastFetched: cached?.lastFetched || 0 });
      await request;
    } catch (error) {
      console.error("Failed to refresh performance cache from source:", error);
      if (!cached) {
        return res.status(502).json({
          error: "Failed to load data from source",
          details: error.message,
        });
      }
    }
  }

  return res.status(200).json(serverCache.get(cacheKey)?.data || cached.data);
}

export default withSecureData(handler, { methods: "GET, POST, OPTIONS" });
