import React, { useMemo } from "react";
import "../styles/wave-detector-donut.css";

const DCOL = ["#1baf7a", "#0ca30c", "#eda100", "#e34948"];
const VALUE_COL = ["#3DD68C", "#52E88A", "#FF9F0A", "#FF2D55"];
const THEMES = {
  dark: {
    card: "var(--surf, #111520)", day: "#141926", today: "#1A1230", dayBorder: "#1E2A3E", todayBorder: "#4A2E8A",
    metric: "#171D2E", metricBorder: "#1E2A3E", ring: "#111520", ringBorder: "#242E42", title: "var(--t1, #F0F4FF)",
    text: "#A8B8D0", muted: "#5C7090", faint: "#3A4A60", todayText: "#C9B8F0", todayBadgeBg: "#2E1B52",
    pagerBg: "#171D2E", pagerText: "#F0F4FF", progressBg: "#242E42", emptyBg: "#141926", inactiveDot: "#242E42", centerText: "#F0F4FF", skBase: "#1b2130", skShine: "#2a3348",
  },
  light: {
    card: "var(--surf, #FFFFFF)", day: "#FFFFFF", today: "#F4EDFF", dayBorder: "#E0DEEA", todayBorder: "#C4B5FD",
    metric: "#F7F6FC", metricBorder: "#E0DEEA", ring: "#F7F6FC", ringBorder: "#E0DEEA", title: "var(--t1, #0A0A0A)",
    text: "#3A4250", muted: "#6B737F", faint: "#9FA5AE", todayText: "#6D28D9", todayBadgeBg: "rgba(109,40,217,.10)",
    pagerBg: "#F7F6FC", pagerText: "#0A0A0A", progressBg: "#E7E5EF", emptyBg: "#F7F6FC", inactiveDot: "#CBD5E1", centerText: "#0A0A0A", skBase: "#E7E5EF", skShine: "#F4F2FA",
  },
};
const KEYS = ["cm", "mu", "cb", "ba"];

const LEGEND = [
  { label: "Chờ mua", color: "#1baf7a" },
  { label: "Mua", color: "#0ca30c" },
  { label: "Chờ bán", color: "#eda100" },
  { label: "Bán", color: "#e34948" },
];

function buildDonut(vals) {
  const C = 80;
  const R = 68;
  const SW = 16;
  const GAP = 5;

  const sig = vals.reduce((a, b) => a + b, 0);
  const tDeg = 360 - vals.length * GAP;

  const xy = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + R * Math.cos(a), C + R * Math.sin(a)];
  };

  const arcs = [];
  const badges = [];
  let cur = 0;

  vals.forEach((v, i) => {
    if (!v || !sig) {
      cur += GAP;
      return;
    }
    const span = (v / sig) * tDeg;
    const st = cur + GAP / 2;
    const en = st + span;
    const mid = (st + en) / 2;
    const [px, py] = xy(st);
    const [qx, qy] = xy(en);
    const lg = span > 180 ? 1 : 0;

    arcs.push(
      <path
        key={`arc-${i}`}
        d={`M${px.toFixed(1)} ${py.toFixed(1)}A68 68 0 ${lg} 1 ${qx.toFixed(1)} ${qy.toFixed(1)}`}
        stroke={DCOL[i]}
        strokeWidth={SW}
        fill="none"
        strokeLinecap="round"
      />
    );

    if (span > 15) {
      const [mx, my] = xy(mid);
      const bx = Math.max(14, Math.min(146, mx));
      const by = Math.max(14, Math.min(146, my));
      const fs = v >= 100 ? 9 : v >= 10 ? 11 : 12;
      badges.push(
        <g key={`badge-${i}`}>
          <circle cx={bx.toFixed(1)} cy={by.toFixed(1)} r={12} fill={DCOL[i]} />
          <text
            x={bx.toFixed(1)}
            y={(by + 4).toFixed(1)}
            textAnchor="middle"
            fill="#fff"
            fontSize={fs}
            fontWeight={500}
          >
            {v}
          </text>
        </g>
      );
    }

    cur += span + GAP;
  });

  return { arcs, badges };
}

function Donut({ vals, total, dbg, themeTokens }) {
  const { arcs, badges } = useMemo(() => buildDonut(vals), [vals]);

  return (
    <svg
      width={124}
      height={124}
      viewBox="0 0 160 160"
      role="img"
      aria-label={`Donut ${total} mã`}
      className="lsds-donut"
      style={{ display: "block", margin: "8px auto 4px" }}
    >
      <circle cx={80} cy={80} r={68} fill={themeTokens.ring} stroke={themeTokens.ringBorder} strokeWidth={0.5} />
      {arcs}
      <circle cx={80} cy={80} r={41} fill={dbg} stroke={themeTokens.ringBorder} strokeWidth={0.5} />
      {badges}
      <text x={80} y={88} textAnchor="middle" fill={themeTokens.centerText} fontSize={22} fontWeight={700}>
        {total}
      </text>
    </svg>
  );
}

function LoadingDayCard({ themeTokens }) {
  return (
    <div className="lsds-loading-card" style={{ ...styles.loadingCard, background: themeTokens.emptyBg, borderColor: themeTokens.dayBorder }}>
      <div style={styles.loadingDateRow}>
        <span className="wtds-sk wtds-sk-pill" style={{ width: 46, height: 13 }} />
        <span className="wtds-sk wtds-sk-pill" style={{ width: 24, height: 10, marginTop: 5 }} />
      </div>

      <div className="wtds-donut-wrap lsds-loading-donut-wrap" style={styles.loadingDonutWrap}>
        <svg className="lsds-loading-donut" width={124} height={124} viewBox="0 0 160 160" aria-hidden="true" style={styles.loadingDonut}>
          <circle className="wtds-donut-stroke-sk" cx={80} cy={80} r={68} fill="none" stroke={themeTokens.skBase} strokeWidth={16} />
          <circle cx={80} cy={80} r={41} fill={themeTokens.emptyBg} />
        </svg>
        <div className="wtds-donut-center">
          <span className="wtds-sk wtds-sk-pill" style={{ width: 40, height: 22, display: "block" }} />
        </div>
      </div>

      <div className="lsds-loading-metric-grid" style={styles.loadingMetricGrid}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="lsds-loading-metric" style={{ ...styles.loadingMetric, background: themeTokens.metric, borderColor: themeTokens.metricBorder }}>
            <span className="wtds-sk wtds-sk-pill" style={{ width: 58, height: 14 }} />
          </div>
        ))}
      </div>

      <div style={styles.loadingTrustRow}>
        <span className="wtds-sk wtds-sk-pill" style={{ width: 18, height: 10 }} />
        <span className="wtds-sk wtds-sk-pill" style={{ flex: 1, height: 4 }} />
        <span className="wtds-sk wtds-sk-pill" style={{ width: 28, height: 10 }} />
      </div>
    </div>
  );
}

function DayCard({ x, themeTokens }) {
  const tv = x.tc >= 70 ? "#3DD68C" : "#FF9F0A";
  const dbg = x.tdy ? themeTokens.today : themeTokens.day;

  return (
    <div
      className="lsds-day"
      style={{
        borderRadius: 14,
        padding: "13px 11px",
        background: dbg,
        border: `1px solid ${x.tdy ? themeTokens.todayBorder : themeTokens.dayBorder}`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: x.tdy ? themeTokens.todayText : themeTokens.text }}>
        {x.d}
        {x.tdy && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "#B788FF",
              background: themeTokens.todayBadgeBg,
              borderRadius: 6,
              padding: "2px 7px",
              verticalAlign: "middle",
              marginLeft: 6,
            }}
          >
            Hôm nay
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: themeTokens.faint, marginTop: 2 }}>{x.w}</div>

      <Donut vals={x.v} total={x.tot} dbg={dbg} themeTokens={themeTokens} />

      <div
        className="lsds-metric-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          margin: "7px 0 9px",
        }}
      >
        {x.v.map((n, i) => (
          <div
            key={KEYS[i]}
            className="lsds-metric"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 8,
              padding: "7px 9px",
              background: themeTokens.metric,
              border: `1px solid ${themeTokens.metricBorder}`,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: DCOL[i],
                display: "inline-block",
              }}
            />
            <span
              className="lsds-metric-value"
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: VALUE_COL[i],
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {n}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 11, color: themeTokens.faint, fontWeight: 500 }}>TC</span>
        <div
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: themeTokens.progressBg,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${x.tc}%`,
              background: tv,
              borderRadius: 2,
            }}
          />
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: tv }}>{x.tc}%</span>
      </div>
    </div>
  );
}

function Pager({ page, totalDays, pageCount, perPage, onPage, themeTokens }) {
  if (!totalDays || pageCount <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalDays);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
      <button
        style={{ ...styles.pbtn, background: themeTokens.pagerBg, borderColor: themeTokens.dayBorder, color: themeTokens.pagerText, opacity: page <= 1 ? 0.35 : 1, cursor: page <= 1 ? "default" : "pointer" }}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Trang trước"
      >
        ‹
      </button>
      <span style={{ fontSize: 13, color: themeTokens.muted }}>{from}-{to}/{totalDays}</span>
      <button
        style={{ ...styles.pbtn, background: themeTokens.pagerBg, borderColor: themeTokens.dayBorder, color: themeTokens.pagerText, opacity: to >= totalDays ? 0.35 : 1, cursor: to >= totalDays ? "default" : "pointer" }}
        disabled={to >= totalDays}
        onClick={() => onPage(page + 1)}
        aria-label="Trang sau"
      >
        ›
      </button>
    </div>
  );
}

export default function LichSuDoSong({
  days = [],
  page = 1,
  totalDays = 0,
  pageCount = 1,
  onPage = () => {},
  loading = false,
  theme = "dark",
  onTitleRefresh = null,
}) {
  const themeTokens = THEMES[theme] || THEMES.dark;
  const viewDays = days.map((day) => ({
    d: day.date,
    w: day.week,
    tdy: Boolean(day.today),
    tot: Number(day.total) || 0,
    tc: Math.max(0, Math.min(100, Number(day.trust) || 0)),
    v: KEYS.map((key) => Number(day.data?.[key]) || 0),
  }));
  const perPage = days.length || 3;
  const dotCount = Math.min(4, pageCount);
  const dotStart = Math.floor(Math.max(page - 1, 0) / 4) * 4;
  const dotPages = Array.from({ length: dotCount }, (_, index) => dotStart + index + 1).filter((dotPage) => dotPage <= pageCount);


  return (
    <div style={styles.outer}>
      <div className="lsds-card" style={{ ...styles.card, "--card": themeTokens.card, "--sk-base": themeTokens.skBase, "--sk-shine": themeTokens.skShine, background: themeTokens.card, color: themeTokens.title }}>
        <div style={styles.header}>
          <div style={styles.title}>
            <i className="ti ti-clock" style={{ color: themeTokens.muted }} aria-hidden="true" />
            <span onClick={onTitleRefresh || undefined} title="Tải lại lịch sử dò sóng" style={{ cursor: onTitleRefresh ? "pointer" : "inherit" }}>Lịch</span> sử dò sóng
          </div>
          <Pager page={page} totalDays={totalDays} pageCount={pageCount} perPage={perPage} onPage={onPage} themeTokens={themeTokens} />
        </div>

        <div style={{ ...styles.legend, color: themeTokens.text }}>
          {LEGEND.map((item) => (
            <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: item.color,
                  display: "inline-block",
                }}
              />
              {item.label}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="lsds-days-scroll" style={styles.daysScroll}>
            <div className="lsds-days-grid" style={styles.daysGrid}>
              {Array.from({ length: 3 }).map((_, index) => (
                <LoadingDayCard key={index} themeTokens={themeTokens} />
              ))}
            </div>
          </div>
        ) : viewDays.length ? (
          <div className="lsds-days-scroll" style={styles.daysScroll}>
            <div className="lsds-days-grid" style={styles.daysGrid}>
              {viewDays.map((x) => (
                <DayCard key={`${x.d}-${x.w}`} x={x} themeTokens={themeTokens} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ ...styles.empty, background: themeTokens.emptyBg, borderColor: themeTokens.dayBorder, color: themeTokens.muted }}>Đang chờ dữ liệu dò sóng...</div>
        )}

        {!loading && dotPages.length > 1 && (
          <div style={styles.dots}>
            {dotPages.map((dotPage) => (
              <span
                key={dotPage}
                onClick={() => onPage(dotPage)}
                style={{ ...styles.dot, background: dotPage === page ? "#7C3AED" : themeTokens.inactiveDot }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  outer: {
    width: "100%",
    minWidth: 0,
    background: "transparent",
    borderRadius: 12,
    padding: 0,
    display: "block",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: "none",
    minWidth: 0,
    background: "var(--surf, #111520)",
    border: "1px solid var(--cbdr, var(--bdr, #1E2A3E))",
    borderRadius: 16,
    padding: 18,
    fontFamily: "var(--font-sans, sans-serif)",
    color: "var(--t1, #F0F4FF)"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "'Be Vietnam Pro', Inter, sans-serif",
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: 0,
    margin: 0,
  },
  legend: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px 16px",
    marginBottom: 12,
    fontSize: 13,
    fontWeight: 500,
    color: "#A8B8D0",
  },
  daysScroll: {
    overflowX: "auto",
    overflowY: "hidden",
    WebkitOverflowScrolling: "touch",
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 12,
    minWidth: "max(100%, 590px)",
  },
  pbtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    border: "1px solid #1E2A3E",
    background: "#171D2E",
    color: "#F0F4FF",
    fontSize: 22,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    display: "flex",
    justifyContent: "center",
    gap: 9,
    marginTop: 14,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    cursor: "pointer",
  },
  loadingCard: {
    borderRadius: 14,
    padding: "13px 11px",
    background: "#141926",
    border: "1px solid #1E2A3E",
    textAlign: "center",
  },
  loadingDateRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
  },
  loadingDonutWrap: {
    width: 124,
    height: 124,
    margin: "8px auto 4px",
  },
  loadingDonut: {
    display: "block",
  },
  loadingMetricGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    margin: "7px 0 9px",
  },
  loadingMetric: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    padding: "10px 9px",
    background: "#171D2E",
    border: "1px solid #1E2A3E",
  },
  loadingTrustRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  empty: {
    borderRadius: 14,
    border: "1px solid #1E2A3E",
    background: "#141926",
    color: "#5C7090",
    padding: "28px 12px",
    textAlign: "center",
    fontSize: 13,
  },
};
