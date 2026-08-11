import { handleConditionSignalLatest } from "../../server/do-song/conditionSignalApi.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/condition-signal-latest", handleConditionSignalLatest);
