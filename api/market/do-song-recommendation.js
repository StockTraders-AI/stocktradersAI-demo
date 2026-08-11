import { handleDoSongRecommendation } from "../../embedded/stocktraders-web/doSongRecommendationDb.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/do-song-recommendation", handleDoSongRecommendation);
