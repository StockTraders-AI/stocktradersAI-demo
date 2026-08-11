import { handleStockWaveTickers } from "../../embedded/stocktraders-web/stockWaveTickersCache.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/stock-wave-tickers", handleStockWaveTickers);
