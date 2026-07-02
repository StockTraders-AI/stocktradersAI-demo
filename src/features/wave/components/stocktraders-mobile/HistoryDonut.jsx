
// Hiển thị 1 ngày lịch sử dò sóng trên mobile:
// - Donut chart 4 nhóm: Chờ mua / Mua / Chờ bán / Bán.
// - Thanh TC thể hiện độ tin cậy.

import { arcPath } from "./utils/chartHelpers";

export default function HistDonut({ d, active, t }) {
  const tot = Number(d.total || 0);
  const donutTotal = d.cm + d.mu + d.cb + d.ba || 1;
  const pC = (d.cm / donutTotal) * 100,
    pM = (d.mu / donutTotal) * 100,
    pCb = (d.cb / donutTotal) * 100,
    pB = (d.ba / donutTotal) * 100;
  const tcColor = d.tc >= 70 ? t.G : d.tc >= 55 ? t.B : t.t4;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        background: active ? t.Bs : t.elev,
        border: `1px solid ${active ? t.Bb : t.bdr}`,
        borderRadius: 10,
        padding: "10px 6px",
        cursor: "pointer",
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: t.t3,
          textAlign: "center",
          lineHeight: 1.3,
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
              padding: "1px 4px",
              marginLeft: 3,
            }}
          >
            Hôm nay
          </span>
        )}
        <br />
        <span style={{ fontSize: 9, color: t.t4 }}>{d.dow}</span>
      </div>
      <svg width="68" height="68" viewBox="0 0 72 72">
        {arcPath(36, 36, 27, 11, pC, t.G, 0)}
        {arcPath(36, 36, 27, 11, pM, t.MU, pC)}
        {arcPath(36, 36, 27, 11, pCb, t.A, pC + pM)}
        {arcPath(36, 36, 27, 11, pB, t.R, pC + pM + pCb)}
        <text
          x="36"
          y="33"
          textAnchor="middle"
          fill={t.t1}
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui"
        >
          {tot}
        </text>
        <text
          x="36"
          y="44"
          textAnchor="middle"
          fill={t.t3}
          fontSize="8"
          fontFamily="system-ui"
        >
          mã
        </text>
      </svg>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2px 6px",
          width: "100%",
        }}
      >
        {[
          ["C.Mua", d.cm, t.G],
          ["Mua", d.mu, t.MU],
          ["C.Bán", d.cb, t.A],
          ["Bán", d.ba, t.R],
        ].map(([lbl, val, clr]) => (
          <div key={lbl} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: clr,
                lineHeight: 1.3,
              }}
            >
              {val}
            </div>
            <div
              style={{
                fontSize: 9,
                color: t.t3,
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              {lbl}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          marginTop: 5,
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
        <span style={{ fontSize: 10, fontWeight: 600, color: tcColor }}>
          {d.tc}%
        </span>
      </div>
    </div>
  );
}
