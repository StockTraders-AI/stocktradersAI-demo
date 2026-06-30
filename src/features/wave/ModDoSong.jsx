import { useTheme } from "../../theme";
import { useNarrow } from "../../app/useNarrow";
import { useStockWaveHistory } from "../../useStockWaveHistory";
import { useStockWaveRealtime } from "../../useStockWaveRealtime";
import WaveMobileModDoSong from "./components/stocktraders-mobile/modules/ModDoSong";
import WavePcModDoSong from "./components/stocktrader-pc/modules/ModDoSong";

export function ModDoSong() {
  const { t, dark } = useTheme();
  const compact = useNarrow();
  const waveData = useStockWaveRealtime();
  const { history: waveHistory, todayReliability } = useStockWaveHistory();
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
