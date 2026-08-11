import { handleStockNoti } from "../../embedded/stocktraders-web/stockNotiCache.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/stock-noti", handleStockNoti);
