import { useTheme } from "../../theme";
import { fmtNum, pct } from "../../app/formatters";
import { arcPath } from "../../components/ui";

export function WaveDonut({ row, size = 140, sw = 20, fontSize = 28 }) {
  const { t } = useTheme();
  const r = size / 2 - sw / 2 - 2;
  const c = size / 2;
  const segs = [
    [row.waitbuy, t.G],
    [row.buy, t.MU],
    [row.waitsell, t.A],
    [row.sell, t.R],
  ];
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bdr)" strokeWidth={sw} />
      {segs.map(([v, color], i) => {
        const p = pct(v, row.total);
        const node = arcPath(c, c, r, sw, p, color, off, `seg-${i}`);
        off += p;
        return node;
      })}
      <text x={c} y={c + fontSize * 0.18} textAnchor="middle" fill={t.t1} fontSize={fontSize} fontWeight="800" fontFamily="system-ui">
        {fmtNum(row.total)}
      </text>
    </svg>
  );
}
