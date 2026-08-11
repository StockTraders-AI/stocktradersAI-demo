import { handleDoSongAdvice } from "../../server/do-song/conditionSignalApi.js";
import { createMarketPostHandler } from "./_helpers.js";

export default createMarketPostHandler("/api/do-song-advice", handleDoSongAdvice);
