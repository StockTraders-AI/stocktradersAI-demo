import { useMemo } from "react";
import { useTheme } from "../../theme";
import { useNarrow } from "../../app/useNarrow";
import { useRealtimeStockWaveFeed, useStockWave } from "../../data/useStockWave";
import WaveMobileModDoSong from "./components/stocktraders-mobile/modules/ModDoSong";
import WavePcModDoSong from "./components/stocktrader-pc/modules/ModDoSong";

function formatDate(dateString) {
  if (!dateString) return "--";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "--";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toDow(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "--";
  return ["CN", "T.2", "T.3", "T.4", "T.5", "T.6", "T.7"][d.getDay()];
}

function toHistoryRow(row, isToday) {
  return {
    rawDate: row.date,
    date: formatDate(row.date),
    dow: toDow(row.date),
    cm: Number(row.waitbuy || 0),
    mu: Number(row.buy || 0),
    cb: Number(row.waitsell || 0),
    ba: Number(row.sell || 0),
    total: Number(row.total || 0),
    reliability: Number(row.reliability || 0),
    tc: Number(row.reliability || 0),
    today: isToday,
  };
}

export function ModDoSong() {
  const { t, dark } = useTheme();
  const compact = useNarrow();
  const { rows, applyTick } = useStockWave();
  useRealtimeStockWaveFeed(applyTick);

  const rowsDesc = useMemo(() => [...rows].reverse(), [rows]);
  const waveData = rowsDesc[0] || null;
  const waveHistory = useMemo(
    () => rowsDesc.slice(0, 60).map((row, index) => toHistoryRow(row, index === 0)),
    [rowsDesc],
  );
  const todayReliability = Number(waveData?.reliability || 0);
  const Component = compact ? WaveMobileModDoSong : WavePcModDoSong;

  return (
    <Component
      t={t}
      dark={dark}
      waveData={waveData}
      waveHistory={waveHistory}
      todayReliability={todayReliability}
      compact={compact}
    />
  );
}