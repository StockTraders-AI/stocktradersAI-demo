import { handleMarketPortfolioChat } from "../../server/do-song/marketPortfolioChatApi.js";
import { createMarketPostHandler } from "./_helpers.js";

export default createMarketPostHandler("/api/portfolio-chat", handleMarketPortfolioChat);
