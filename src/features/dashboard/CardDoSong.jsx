import { useEffect } from "react";

const toRad = (deg) => (deg * Math.PI) / 180;

function buildArcs(data, cx, cy, r, gap) {
  const total = data.reduce((sum, item) => sum + item.n, 0);
  if (!total) return { arcs: [], total };

  const totalDeg = 360 - data.length * gap;
  let cur = 0;
  const arcs = data.map((item) => {
    if (!item.n) {
      cur += gap;
      return null;
    }

    const span = (item.n / total) * totalDeg;
    const start = cur + gap / 2;
    const end = start + span;
    const mid = (start + end) / 2;
    const a1 = toRad(start);
    const a2 = toRad(end);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const large = span > 180 ? 1 : 0;
    const bx = Math.max(17, Math.min(203, cx + r * Math.cos(toRad(mid))));
    const by = Math.max(17, Math.min(203, cy + r * Math.sin(toRad(mid))));

    cur += span + gap;
    return {
      path: `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      c: item.c,
      n: item.n,
      bx,
      by,
      span,
    };
  }).filter(Boolean);

  return { arcs, total };
}

const CSS = `
.ds-card{
  background:var(--surf,#111520);border:.5px solid var(--bdr,#242E42);
  border-radius:12px;padding:16px;display:flex;flex-direction:column;
  align-items:center;gap:12px;cursor:pointer;transition:background .2s;
}
.ds-card:hover{background:var(--elev,#171D2E)}
.ds-hdr{width:100%;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.ds-title{font-size:12px;font-weight:750;color:var(--t1,#F0F4FF);white-space:nowrap}
.ds-rel{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}
.ds-rel-lbl{font-size:10px;color:var(--t3,#5C7090)}
.ds-rel-pct{font-size:11px;font-weight:750}
.ds-badge{
  font-size:9px;font-weight:750;padding:1px 7px;border-radius:8px;
  background:rgba(12,163,12,.15);color:#0ca30c;
  border:.5px solid rgba(12,163,12,.3);display:inline-flex;align-items:center;gap:3px;
}
.ds-link{font-size:12px;color:var(--B,#7C3AED);font-weight:650;cursor:pointer;white-space:nowrap}
.ds-lgd{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.ds-lgd-item{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--t2,#A8B8D0)}
.ds-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
`;

const LEGEND = [
  { label: "Chờ mua", c: "#1baf7a" },
  { label: "Mua", c: "#0ca30c" },
  { label: "Chờ bán", c: "#eda100" },
  { label: "Bán", c: "#e34948" },
];

export default function CardDoSong({
  data = [],
  maCount = 0,
  reliability = 0,
  onDetail,
}) {
  useEffect(() => {
    if (document.getElementById("ds-card-css")) return;
    const el = document.createElement("style");
    el.id = "ds-card-css";
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const cx = 110;
  const cy = 110;
  const r = 95;
  const gap = 5;
  const sw = 22;
  const { arcs } = buildArcs(data, cx, cy, r, gap);
  const safeReliability = Number.isFinite(reliability) ? Math.round(reliability) : 0;
  const bigWave = safeReliability >= 70;
  const relColor = bigWave ? "#0ca30c" : "#eda100";

  return (
    <div className="ds-card" onClick={onDetail}>
      <div className="ds-hdr">
        <div>
          <div className="ds-title">Vòng tròn dò sóng</div>
          <div className="ds-rel">
            <span className="ds-rel-lbl">Tin cậy</span>
            <span className="ds-rel-pct" style={{ color: relColor }}>{safeReliability}%</span>
            {bigWave && <span className="ds-badge"><span>★</span> SÓNG LỚN</span>}
          </div>
        </div>
        <span
          className="ds-link"
          onClick={(event) => {
            event.stopPropagation();
            onDetail?.();
          }}
        >
          Chi tiết ›
        </span>
      </div>

      <svg viewBox="0 0 220 220" width="100%" style={{ maxWidth: 180 }}>
        <circle cx={cx} cy={cy} r={r} fill="var(--elev,#171D2E)" stroke="var(--bdr,#242E42)" strokeWidth={0.5} />
        {arcs.map((arc, index) => (
          <path key={index} d={arc.path} stroke={arc.c} strokeWidth={sw} fill="none" strokeLinecap="round" />
        ))}
        <circle cx={cx} cy={cy} r={r - sw + 5} fill="var(--surf,#111520)" stroke="var(--bdr,#242E42)" strokeWidth={0.5} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight={700} fill="var(--t1,#F0F4FF)" fontFamily="inherit">
          {maCount}
        </text>
        {arcs.filter((arc) => arc.span > 15).map((arc, index) => {
          const fs = arc.n >= 100 ? 10 : arc.n >= 10 ? 13 : 15;
          return (
            <g key={index}>
              <circle cx={arc.bx.toFixed(1)} cy={arc.by.toFixed(1)} r={15} fill={arc.c} />
              <text x={arc.bx.toFixed(1)} y={arc.by.toFixed(1)} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={650} fill="white" fontFamily="inherit">
                {arc.n}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="ds-lgd">
        {LEGEND.map((item) => (
          <span key={item.label} className="ds-lgd-item">
            <span className="ds-dot" style={{ background: item.c }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
