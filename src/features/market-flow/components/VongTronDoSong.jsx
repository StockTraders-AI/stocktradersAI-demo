import React from "react";

const ORDER = ["cm", "mu", "cb", "ba"];
const LABELS = { cm: "Chờ mua", mu: "Mua", cb: "Chờ bán", ba: "Bán" };
// Bảng màu donut theo dashboard
const DCOL = { cm: "#1baf7a", mu: "#0ca30c", cb: "#eda100", ba: "#e34948" };

// ── Token 2 theme (theo stocktraders_pc) ──
const THEMES = {
  dark: {
    surf: "#111520", elev: "#171D2E", bdr: "#242E42", cardBdr: "#1E2A3E",
    t1: "#F0F4FF", t4: "#3A4A60", icon: "#5C7090", iconAcc: "#3DD68C",
    trust: {
      good: { bg: "#0D2B1A", border: "#1A5C2A", color: "#3DD68C" }, // >= 70%
      low: { bg: "#2B1800", border: "#4A2E00", color: "#FF9F0A" },  // < 70% (bộ màu Chờ bán)
    },
    box: {
      cm: { bg: "#0A2318", border: "#0F3D22", label: "#3DD68C", num: "#3DD68C", pct: "#3DD68C" },
      mu: { bg: "#0F3D1A", border: "#1A6628", label: "#52E88A", num: "#fff", pct: "rgba(255,255,255,.65)" },
      cb: { bg: "#2B1800", border: "#4A2E00", label: "#FF9F0A", num: "#FF9F0A", pct: "#FF9F0A" },
      ba: { bg: "#200A0E", border: "#3D1018", label: "#FF2D55", num: "#FF2D55", pct: "#FF2D55" },
    },
  },
  light: {
    surf: "#fff", elev: "#F7F6FC", bdr: "#E0DEEA", cardBdr: "#E0DEEA",
    t1: "#0A0A0A", t4: "#9FA5AE", icon: "#6B737F", iconAcc: "#16A34A",
    trust: {
      good: { bg: "#F0FDF4", border: "#A7F3C4", color: "#16A34A" },
      low: { bg: "#FFFBEB", border: "#FCD34D", color: "#D97706" },
    },
    box: {
      cm: { bg: "#F0FDF4", border: "#A7F3C4", label: "#16A34A", num: "#16A34A", pct: "#16A34A" },
      mu: { bg: "#DCFCE7", border: "#86EFAC", label: "#15803D", num: "#0A0A0A", pct: "rgba(0,0,0,.55)" },
      cb: { bg: "#FFFBEB", border: "#FCD34D", label: "#D97706", num: "#D97706", pct: "#D97706" },
      ba: { bg: "#FFF1F2", border: "#FECDD3", label: "#E11D48", num: "#E11D48", pct: "#E11D48" },
    },
  },
};

// Hình học dashboard
const CX = 110, CY = 110, R = 95, SW = 22, GAP = 5;

function xy(deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
}
function arcP(s, e) {
  const p = xy(s), q = xy(e), lg = e - s > 180 ? 1 : 0;
  return `M${p.x.toFixed(2)} ${p.y.toFixed(2)}A${R} ${R} 0 ${lg} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
}

export default function VongTronDoSong({
  data = { cm: 0, mu: 0, cb: 0, ba: 0 },
  total = 0,
  trust = 0,
  date = "",
  dateControl = null,
  theme = "dark", // "dark" | "light"
}) {
  const T = THEMES[theme] || THEMES.dark;
  const sig = ORDER.reduce((s, k) => s + data[k], 0);
  const tDeg = 360 - ORDER.length * GAP;

  // Tính cung + badge theo thuật toán drawD của dashboard
  let cur = 0;
  const segs = ORDER.map((k) => {
    if (!data[k] || !sig) {
      cur += GAP;
      return { key: k, d: null, badge: null };
    }
    const span = (data[k] / sig) * tDeg;
    const s = cur + GAP / 2, e = s + span, mid = (s + e) / 2;
    cur += span + GAP;
    let badge = null;
    if (span > 15) {
      const p = xy(mid);
      badge = {
        x: Math.max(17, Math.min(203, p.x)),
        y: Math.max(17, Math.min(203, p.y)),
        fs: data[k] >= 100 ? 10 : data[k] >= 10 ? 13 : 15,
      };
    }
    return { key: k, d: arcP(s, e), badge };
  });

  const trustStyle = trust >= 70 ? T.trust.good : T.trust.low;

  return (
    <div className="vtds-card" style={{ ...st.card, background: T.surf, border: `.5px solid ${T.cardBdr}`, color: T.t1 }}>
      {/* ===== Header ===== */}
      <div className="vtds-header" style={st.header}>
        <div className="vtds-title" style={{ ...st.htitle, color: T.t1 }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8" fill="none" stroke={T.icon} strokeWidth="1.5" />
            <circle cx="10" cy="10" r="4" fill="none" stroke={T.icon} strokeWidth="1.5" />
            <line x1="10" y1="2" x2="10" y2="6" stroke={T.icon} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 2 A8 8 0 0 1 17 6.5" stroke={T.iconAcc} strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          Vòng tròn dò sóng
          {dateControl || <span style={{ ...st.hmeta, color: T.t4 }}>· {date}</span>}
        </div>

        <div
          className="vtds-trust"
          style={{
            ...st.trust,
            background: trustStyle.bg,
            border: `1px solid ${trustStyle.border}`,
            color: trustStyle.color,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3L4 7v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V7L12 3z"
              stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"
            />
            <polyline
              points="9,12 11,14 15,10"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          Tin cậy {trust}%
        </div>
      </div>

      {/* ===== Body: donut trái + 4 thẻ phải ===== */}
      <div className="vtds-body" style={st.body}>
        <svg
          className="vtds-svg" width="190" height="190" viewBox="0 0 220 220" style={{ flexShrink: 0 }} role="img"
          aria-label={`Vòng tròn dò sóng: tổng ${total} mã theo dõi, ${sig} mã có tín hiệu — ${ORDER.map(
            (k) => `${data[k]} ${LABELS[k]}`
          ).join(", ")}`}
        >
          {/* đĩa nền 2 lớp theo style dashboard */}
          <circle cx={CX} cy={CY} r={R} fill={T.elev} stroke={T.bdr} strokeWidth="0.5" />
          {segs.map((s) =>
            s.d ? (
              <path key={s.key} d={s.d} stroke={DCOL[s.key]} strokeWidth={SW} fill="none" strokeLinecap="round" />
            ) : null
          )}
          <circle cx={CX} cy={CY} r={57} fill={T.surf} stroke={T.bdr} strokeWidth="0.5" />

          {segs.map((s) =>
            s.badge ? (
              <g key={`b-${s.key}`}>
                <circle cx={s.badge.x.toFixed(1)} cy={s.badge.y.toFixed(1)} r={15} fill={DCOL[s.key]} />
                <text
                  x={s.badge.x.toFixed(1)} y={(s.badge.y + 5).toFixed(1)} textAnchor="middle"
                  fill="#fff" fontSize={s.badge.fs} fontWeight="500" fontFamily="inherit"
                >
                  {data[s.key]}
                </text>
              </g>
            ) : null
          )}

          <text x={CX} y={CY + 11} textAnchor="middle" fill={T.t1} fontSize="30" fontWeight="700" fontFamily="inherit">
            {total}
          </text>
        </svg>

        <div className="vtds-boxes" style={st.boxes}>
          {ORDER.map((k) => {
            const b = T.box[k];
            return (
              <div key={k} className="vtds-box" style={{ ...st.box, background: b.bg, border: `1px solid ${b.border}` }}>
                <div style={{ ...st.blabel, color: b.label }}>{LABELS[k]}</div>
                <div style={{ ...st.bnum, color: b.num }}>{data[k]}</div>
                <div style={{ ...st.bpct, color: b.pct }}>
                  {total ? ((data[k] / total) * 100).toFixed(1) : "0.0"}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const st = {
  card: {
    borderRadius: 16,
    padding: "22px 24px",
    maxWidth: 1000,
    transition: "background .2s",
    fontFamily: '-apple-system,"Inter",sans-serif',
    WebkitFontSmoothing: "antialiased",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  htitle: { display: "flex", alignItems: "center", gap: 9, fontFamily: "'Be Vietnam Pro', Inter, sans-serif", fontSize: 16, fontWeight: 600, lineHeight: 1.3, letterSpacing: 0, margin: 0, whiteSpace: "nowrap" },
  hmeta: { fontSize: 10, fontWeight: 400, marginLeft: 2 },
  trust: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    borderRadius: 30,
    padding: "9px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, },
  body: { display: "flex", alignItems: "center", gap: 28, flexWrap: "nowrap", overflow: "hidden" },
  boxes: {
    flex: "1 1 0",
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  box: { borderRadius: 9, padding: "13px 18px", minHeight: 82, cursor: "pointer", transition: "opacity .15s" },
  blabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".1em",
    marginBottom: 6,
  },
  bnum: { fontSize: 30, fontWeight: 800, lineHeight: 1, letterSpacing: -1 },
  bpct: { fontSize: 12, marginTop: 6, opacity: 0.75 },
};
