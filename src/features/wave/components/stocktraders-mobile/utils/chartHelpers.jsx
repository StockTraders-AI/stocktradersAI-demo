// arcPath():
// - Tạo 1 cung tròn SVG cho donut chart.
// - pct là phần trăm độ dài cung.
// - off là vị trí bắt đầu của cung trên vòng tròn.
// ============================================================

export function arcPath(cx, cy, r, sw, pct, color, off) {
  const c = 2 * Math.PI * r,
    d = (c * pct) / 100,
    g = c - d;
  return (
    <circle
      key={color + off}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeDasharray={`${d.toFixed(1)} ${g.toFixed(1)}`}
      strokeDashoffset={`${((-c * off) / 100).toFixed(1)}`}
      strokeLinecap="butt"
      style={{
        transform: "rotate(-90deg)",
        transformOrigin: `${cx}px ${cy}px`,
      }}
    />
  );
}
