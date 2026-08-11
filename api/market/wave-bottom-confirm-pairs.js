import { handleWaveBottomConfirmPairs } from "../../embedded/stocktraders-web/waveBottomConfirmPairsCache.js";
import { createMarketGetHandler } from "./_helpers.js";

export default createMarketGetHandler("/api/wave-bottom-confirm-pairs", handleWaveBottomConfirmPairs);
