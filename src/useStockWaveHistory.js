import { useEffect, useState } from "react";

const STOCK_WAVE_HISTORY_URL = import.meta.env.DEV
  ? "/stocktraders-api/service/data/getStockWave"
  : "/api/stock-wave-history";

function formatDate(dateString) {
  if (!dateString) return "--";
  const d = new Date(dateString);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function toDow(dateString) {
  const d = new Date(dateString);
  return ["CN", "T.2", "T.3", "T.4", "T.5", "T.6", "T.7"][d.getDay()];
}

function getTodayVietnam() {
  const now = new Date();
  const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vietnamTime.toISOString().split("T")[0];
}

export function useStockWaveHistory() {
  const [history, setHistory] = useState([]);
  const [todayReliability, setTodayReliability] = useState(null);
  const [latestWaveData, setLatestWaveData] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchHistory() {
      try {
        const res = await fetch(STOCK_WAVE_HISTORY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            StockWaveRequest: {
              account: "NAM.TT",
            },
          }),
        });

        const json = await res.json();

        const list =
          json?.StockWaveRequest?.stockWaves?.waveDatas ||
          json?.StockWaveReply?.stockWaves?.waveDatas ||
          [];

        const sortedList = [...list].sort(
          (a, b) => new Date(b.date) - new Date(a.date),
        );

        const today = getTodayVietnam();

        const todayRow =
          sortedList.find((x) => x.date === today) || sortedList[0] || null;

        const converted = sortedList
          .filter((x) => x.date !== todayRow?.date)
          .map((x) => ({
            rawDate: x.date,
            date: formatDate(x.date),
            dow: toDow(x.date),
            cm: Number(x.waitbuy || 0),
            mu: Number(x.buy || 0),
            cb: Number(x.waitsell || 0),
            ba: Number(x.sell || 0),
            total: Number(x.total || 0),
            reliability: Number(x.reliability || 0),
            tc: Number(x.reliability || 0),
            today: x.date === todayRow?.date,
          }));

        const latestReliability = Number(todayRow?.reliability || 0);

        if (mounted) {
          setHistory(converted);
          setTodayReliability(latestReliability);
          setLatestWaveData(todayRow);
        }
      } catch (err) {
        console.error("Fetch stock wave history error:", err);
      }
    }

    fetchHistory();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    history,
    todayReliability,
    latestWaveData,
  };
}
