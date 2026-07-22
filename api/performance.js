const CACHE_DURATION = 30 * 1000;
const SOURCE_URL = "https://stocktradersai.vn/service/data/getPerformance";

const serverCache = new Map();

function readBranchPath(req) {
  const raw = req.query?.branch_path;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || "").trim();
}

function readDate(req) {
  const raw = req.query?.date;
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=120");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const branchPath = readBranchPath(req);
  if (!branchPath) {
    return res.status(400).json({ error: "Missing branch_path" });
  }

  const now = Date.now();
  const date = readDate(req);
  const cacheKey = `${branchPath}:${date || "latest"}`;
  const cached = serverCache.get(cacheKey);

  if (!cached || now - cached.lastFetched > CACHE_DURATION) {
    try {
      serverCache.set(cacheKey, {
        data: await fetchPerformanceFromSource(branchPath, date),
        lastFetched: now,
      });
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
