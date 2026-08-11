import { handlePortfolioChat } from "../../server/do-song/portfolioChatApi.js";
import { createMarketPostHandler } from "./_helpers.js";

export default createMarketPostHandler("/api/portfolio-chat", handlePortfolioChat);
