export const PORTFOLIO_MAX_CODES = 15;
export const PORTFOLIO_STORAGE_KEY = "portfolio_analysis_state_v1";

export function sortPortfolioCodes(codes) {
  return [...codes].sort((a, b) => a.localeCompare(b));
}

export function parsePortfolioCodes(input) {
  const seen = new Set();
  const codes = String(input || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .flatMap((code) => {
      if (seen.has(code)) return [];
      seen.add(code);
      return [code];
    })
    .slice(0, PORTFOLIO_MAX_CODES);
  return sortPortfolioCodes(codes);
}

export function normalizePortfolioCodes(codes) {
  if (!Array.isArray(codes)) return [];
  return sortPortfolioCodes(
    codes
      .map((code) => String(code || "").trim().toUpperCase())
      .filter(Boolean)
      .slice(0, PORTFOLIO_MAX_CODES)
  );
}

export function loadSavedPortfolio(fallbackInput = "") {
  try {
    const parsed = JSON.parse(localStorage.getItem(PORTFOLIO_STORAGE_KEY) || "null");
    const input = typeof parsed?.input === "string" ? parsed.input : fallbackInput;
    return { input, analyzedCodes: normalizePortfolioCodes(parsed?.analyzedCodes) };
  } catch {
    return { input: fallbackInput, analyzedCodes: [] };
  }
}

export function savePortfolioState(input, analyzedCodes) {
  try {
    localStorage.setItem(
      PORTFOLIO_STORAGE_KEY,
      JSON.stringify({ input: String(input || ""), analyzedCodes: normalizePortfolioCodes(analyzedCodes) })
    );
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}
