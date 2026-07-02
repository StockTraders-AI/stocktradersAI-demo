// Hiển thị các donut lịch sử dò sóng theo từng nhóm ngày.

import { useState } from "react";
import { HIST } from "./constants/mockData";
import { arcPath } from "./utils/chartHelpers";
import { Card, CardHeader } from "./common/UI";

export function HistDonut({ d, active, t, compact }) {
  const tot = Number(d.total || 0);
  const donutTotal = d.cm + d.mu + d.cb + d.ba || 1;
  const pC = (d.cm / donutTotal) * 100,
    pM = (d.mu / donutTotal) * 100,
    pCb = (d.cb / donutTotal) * 100,
    pB = (d.ba / donutTotal) * 100;
  const tcColor = d.tc >= 70 ? t.G : d.tc >= 55 ? t.MU : t.t4;
  return (
    <div
      style={{
        flex: 1,
        minWidth: compact ? 148 : 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: active ? t.Bs : t.elev,
        border: `0.5px solid ${active ? t.Bb : t.bdr}`,
        borderRadius: 10,
        padding: compact ? "10px 8px" : "12px 8px",
        minHeight: compact ? 196 : 216,
        cursor: "pointer",
        transition: "border-color .12s",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: t.t3,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {d.date}
        {d.today && (
          <span
            style={{
              fontSize: 8,
              background: t.Bs,
              color: t.B,
              borderRadius: 3,
              padding: "1px 5px",
              marginLeft: 4,
            }}
          >
            Hôm nay
          </span>
        )}
        <br />
        <span style={{ fontSize: 9, color: t.t4 }}>{d.dow}</span>
      </div>
      <svg width={compact ? 82 : 90} height={compact ? 82 : 90} viewBox="0 0 90 90">
        {arcPath(45, 45, 34, 13, pC, t.G, 0)}
        {arcPath(45, 45, 34, 13, pM, t.MU, pC)}
        {arcPath(45, 45, 34, 13, pCb, t.A, pC + pM)}
        {arcPath(45, 45, 34, 13, pB, t.R, pC + pM + pCb)}
        <text
          x="45"
          y="49"
          textAnchor="middle"
          fill={t.t1}
          fontSize="16"
          fontWeight="800"
          fontFamily="system-ui"
        >
          {tot}
        </text>
      </svg>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "3px 8px",
          width: "100%",
        }}
      >
        {[
          [d.cm, t.G, "C.MUA"],
          [d.mu, t.MU, "MUA"],
          [d.cb, t.A, "C.BÁN"],
          [d.ba, t.R, "BÁN"],
        ].map(([v, c, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: c,
                lineHeight: 1.3,
              }}
            >
              {v}
            </div>
            <div
              style={{
                fontSize: 9,
                color: t.t3,
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              {l}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 9, color: t.t4 }}>TC</span>
        <div
          style={{
            flex: 1,
            height: 3,
            background: t.bdr,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${d.tc}%`,
              background: tcColor,
              borderRadius: 2,
            }}
          />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: tcColor }}>
          {d.tc}%
        </span>
      </div>
    </div>
  );
}

export default function HistNavigator({ t, history = [], compact = false }) {
  const [off, setOff] = useState(0);
  const PER = 3;
  const source = history.length ? history : HIST;
  const slice = source.slice(off, off + PER);
  return (
    <Card>
      <CardHeader
        icon="ti-clock"
        title={
          <span>
            Lịch sử dò sóng
            <span
              style={{
                marginLeft: 8,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--t4)",
              }}
            >
              (3 ngày gần nhất)
            </span>
          </span>
        }
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <button
              onClick={() => setOff((o) => Math.max(0, o - PER))}
              disabled={off === 0}
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: "var(--elev)",
                border: "0.5px solid var(--bdr)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--t2)",
                opacity: off === 0 ? 0.3 : 1,
                fontSize: 14,
                fontFamily: "inherit",
              }}
            >
              <i className="ti ti-chevron-left" />
            </button>
            <span style={{ fontSize: 11, color: "var(--t4)" }}>
              {off + 1}–{off + slice.length}/{source.length}{" "}
            </span>
            <button
              onClick={() =>
                setOff((o) => Math.min(source.length - PER, o + PER))
              }
              disabled={off + PER >= source.length}
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: "var(--elev)",
                border: "0.5px solid var(--bdr)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--t2)",
                opacity: off + PER >= HIST.length ? 0.3 : 1,
                fontSize: 14,
                fontFamily: "inherit",
              }}
            >
              <i className="ti ti-chevron-right" />
            </button>
          </div>
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "repeat(3, 1fr)",
          gap: 10,
        }}
      >
        {slice.map((d, i) => (
          <HistDonut key={d.date} d={d} active={i === 0 && off === 0} t={t} compact={compact} />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          marginTop: 12,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                i === Math.floor(off / PER) ? "var(--B)" : "var(--bdr)",
            }}
          />
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// MODULES
// ─────────────────────────────────────────────────────────────
