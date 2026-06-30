// Helper tạo các cung SVG dùng cho donut chart.

export function arcPath(cx, cy, r, sw, pct, color, off) {
  const circumference = 2 * Math.PI * r;
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
  const safeOff = Math.max(0, Math.min(100, Number(off) || 0));
  const dash = (safePct / 100) * circumference;
  const gap = circumference - dash;

  return (
    <circle
      key={`${color}-${safeOff}`}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeDasharray={`${dash} ${gap}`}
      strokeDashoffset={`${-(safeOff / 100) * circumference}`}
      strokeLinecap="butt"
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  );
}

