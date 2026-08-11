import { handleStockWaveHistory } from "../../embedded/stocktraders-web/stockWaveHistoryCache.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/stock-wave-history", handleStockWaveHistory);
