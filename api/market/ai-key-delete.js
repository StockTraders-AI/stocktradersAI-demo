import { handleAiKeyDelete } from "../../server/do-song/aiKeyApi.js";
import { createMarketPostHandler } from "./_helpers.js";

export default createMarketPostHandler("/api/ai-key/delete", handleAiKeyDelete);
