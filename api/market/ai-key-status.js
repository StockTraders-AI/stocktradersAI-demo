import { handleAiKeyStatus } from "../../server/do-song/aiKeyApi.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/ai-key/status", handleAiKeyStatus);
