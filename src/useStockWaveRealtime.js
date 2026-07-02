import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export function useStockWaveRealtime() {
  const [wave, setWave] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchLatestWave() {
      try {
        // đổi sang API lịch sử
        const res = await fetch("/api/stock-wave-history");
        const json = await res.json();

        const list =
          json?.StockWaveRequest?.stockWaves?.waveDatas || [];

        const today = new Date().toISOString().split("T")[0];

        const latest =
          [...list]
            .reverse()
            .find((x) => x.date === today) ||
          list[list.length - 1];

        if (mounted && latest) {
          setWave(latest);
        }
      } catch (error) {
        console.error("Fetch latest wave error:", error);
      }
    }

    fetchLatestWave();

    const socket = io("https://realtime.finalgo.vn/realtime", {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);

      socket.emit("message", {
        action: "subscribe",
        channels: ["wave"],
      });
    });

    socket.on("message", (payload) => {
      console.log("Realtime payload:", payload);

      if (payload?.channel === "wave") {
        setWave(payload.data);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket error:", error.message);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, []);

  return wave;
}