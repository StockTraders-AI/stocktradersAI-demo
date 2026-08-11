import { handleStockWaveCurrent } from "../../embedded/stocktraders-web/stockWaveCurrentCache.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/stock-wave-current", handleStockWaveCurrent);
