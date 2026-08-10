import {
  handleStockWaveCurrentStream,
} from "../embedded/stocktraders-web/stockWaveCurrentCache.js";
import {
  handleStockNoti,
} from "../embedded/stocktraders-web/stockNotiCache.js";
import {
  handleWaveBottomConfirmPairsStream,
} from "../embedded/stocktraders-web/waveBottomConfirmPairsCache.js";

const STREAMS = new Map([
  ["1", (req, res) => handleStockWaveCurrentStream(req, res)],
  ["2", (req, res) => handleStockNoti(req, res, "/api/stock-noti/stream")],
  ["3", (req, res) => handleWaveBottomConfirmPairsStream(req, res)],
]);

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const stream = STREAMS.get(String(url.searchParams.get("c") || ""));
  if (!stream) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Live route not found" }));
    return;
  }

  return stream(req, res);
}
