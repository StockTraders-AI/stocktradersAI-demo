
// Chức năng:
// - Vòng tròn dò sóng realtime.
// - AI panel, lịch sử dò sóng, danh mục, nhật ký.
import { useState } from "react";
import {
  AIPanel,
  Card,
  CardHeader,
  FilterChips,
  TableWrap,
  Tag,
  arcPath,
} from "../../components/ui";
import { HIST } from "./waveMockData";

export default function ModDoSong({
  t,
  waveData,
  waveHistory = [],
  todayReliability,
}) {
  const [dsTab, setDsTab] = useState("cm");
  const [histOff, setHistOff] = useState(0);
  const PER = 3;
  const hasWave = !!waveData;
  const real = waveData || {};
  const reliability = Number(todayReliability || 0);
  const reliabilityText = reliability ? `${reliability}%` : "--";
  const histData = waveHistory.length ? waveHistory : HIST;

  const show = (v) => (hasWave && v !== undefined && v !== null ? v : "--");

  const total = Number(real.total || 0);
  const safeTotal = total || 1;

  const waitbuyPct = hasWave
    ? ((Number(real.waitbuy || 0) / safeTotal) * 100).toFixed(1)
    : "--";

  const buyPct = hasWave
    ? ((Number(real.buy || 0) / safeTotal) * 100).toFixed(1)
    : "--";

  const waitsellPct = hasWave
    ? ((Number(real.waitsell || 0) / safeTotal) * 100).toFixed(1)
    : "--";

  const sellPct = hasWave
    ? ((Number(real.sell || 0) / safeTotal) * 100).toFixed(1)
    : "--";

  // Donut chỉ tính theo 4 nhóm để vòng tròn luôn đầy 100%
  const donutTotal =
    Number(real.waitbuy || 0) +
      Number(real.buy || 0) +
      Number(real.waitsell || 0) +
      Number(real.sell || 0) || 1;

  const waitbuyDonutPct = (Number(real.waitbuy || 0) / donutTotal) * 100;
  const buyDonutPct = (Number(real.buy || 0) / donutTotal) * 100;
  const waitsellDonutPct = (Number(real.waitsell || 0) / donutTotal) * 100;
  const sellDonutPct = (Number(real.sell || 0) / donutTotal) * 100;

  const histSlice = histData.slice(histOff, histOff + PER);
  const danh_muc = [
    { ma: "SSI", nganh: "Chứng khoán", gia: "24,850", tc: 85, color: t.G },
    { ma: "HCM", nganh: "Chứng khoán", gia: "26,100", tc: 82, color: t.G },
    { ma: "VND", nganh: "Chứng khoán", gia: "19,650", tc: 80, color: t.G },
    { ma: "VCI", nganh: "Chứng khoán", gia: "26,300", tc: 78, color: t.A },
    { ma: "ACB", nganh: "Ngân hàng", gia: "24,900", tc: 75, color: t.A },
  ];

  const chan_song = [
    {
      ngay: "09/04/2026",
      vnindex: "1,073.61",
      tc: "82%",
      bd: "+27.97%",
      diem: "+300đ",
      loai: "Sóng lớn",
      loaiCls: "tg",
    },
    {
      ngay: "20/02/2026",
      vnindex: "1,202.57",
      tc: "76%",
      bd: "+20.84%",
      diem: "+251đ",
      loai: "Sóng lớn",
      loaiCls: "tg",
    },
    {
      ngay: "10/01/2026",
      vnindex: "1,158.23",
      tc: "71%",
      bd: "+15.99%",
      diem: "+185đ",
      loai: "Sóng hồi",
      loaiCls: "tb",
    },
    {
      ngay: "12/11/2025",
      vnindex: "1,198.47",
      tc: "73%",
      bd: "+15.21%",
      diem: "+182đ",
      loai: "Sóng hồi",
      loaiCls: "tb",
    },
    {
      ngay: "19/09/2025",
      vnindex: "1,265.11",
      tc: "68%",
      bd: "+16.91%",
      diem: "+215đ",
      loai: "Sóng hồi",
      loaiCls: "tb",
    },
  ];

  return (
    <div>
      {/* Vòng tròn dò sóng */}
      <Card>
        <CardHeader
          icon="ti-chart-donut"
          title="Vòng tròn dò sóng"
          meta={`· ${show(real.date)}`}
          right={
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: t.Gs,
                border: `1px solid ${t.Gb}`,
                borderRadius: 9,
                padding: "7px 12px",
                fontSize: 14,
                fontWeight: 800,
                color: t.G,
              }}
            >
              <i className="ti ti-shield-check" style={{ fontSize: 14 }} />
              Tin cậy {reliabilityText}
            </div>
          }
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Donut */}
          <div style={{ flexShrink: 0 }}>
            <svg width="130" height="130" viewBox="0 0 130 130">
              {arcPath(65, 65, 50, 18, waitbuyDonutPct, t.MU, 0)}
              {arcPath(65, 65, 50, 18, buyDonutPct, t.G, waitbuyDonutPct)}
              {arcPath(
                65,
                65,
                50,
                18,
                waitsellDonutPct,
                t.A,
                waitbuyDonutPct + buyDonutPct,
              )}
              {arcPath(
                65,
                65,
                50,
                18,
                sellDonutPct,
                t.R,
                waitbuyDonutPct + buyDonutPct + waitsellDonutPct,
              )}
              <text
                x="65"
                y="70"
                textAnchor="middle"
                fill={t.t1}
                fontSize="28"
                fontWeight="800"
                fontFamily="system-ui"
              >
                {show(real.total)}
              </text>
            </svg>
          </div>
          {/* 4 stat boxes */}
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {[
              {
                lbl: "Chờ mua",
                val: show(real.waitbuy),
                pct: hasWave ? `${waitbuyPct}%` : "--",
                bg: t.Gs,
                border: t.Gb,
                color: t.G,
              },
              {
                lbl: "Mua",
                val: show(real.buy),
                pct: hasWave ? `${buyPct}%` : "--",
                bg: t.MU,
                border: "#166534",
                color: "#fff",
                shadow: "0 4px 14px rgba(29,184,122,.35)",
              },
              {
                lbl: "Chờ bán",
                val: show(real.waitsell),
                pct: hasWave ? `${waitsellPct}%` : "--",
                bg: t.As,
                border: t.Ab,
                color: t.A,
              },
              {
                lbl: "Bán",
                val: show(real.sell),
                pct: hasWave ? `${sellPct}%` : "--",
                bg: t.Rs,
                border: t.Rb,
                color: t.R,
              },
            ].map((s) => (
              <div
                key={s.lbl}
                style={{
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  boxShadow: s.shadow,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: s.lbl === "Mua" ? "rgba(255,255,255,.80)" : s.color,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 3,
                  }}
                >
                  {s.lbl}
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: s.color,
                    lineHeight: 1,
                  }}
                >
                  {s.val}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: s.lbl === "Mua" ? "rgba(255,255,255,.80)" : s.color,
                    opacity: s.lbl === "Mua" ? 1 : 0.85,
                    marginTop: 2,
                  }}
                >
                  {s.pct}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* AI Panel */}
      <AIPanel
        headline="Khả năng tạo đáy cao — Chờ xác nhận !"
        body={`Tỷ trọng Chờ mua ${waitbuyPct}% — dòng tiền bắt đầu quay lại, thị trường đang ở vùng đỡ đáy.`}
        rec="Giải ngân thăm dò 30% và chờ xác nhận chân sóng."
      />

      {/* Xem lại tình huống */}
      <div
        style={{
          background: t.elev,
          border: `1px solid ${t.Pb}`,
          borderRadius: 12,
          padding: "13px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 9,
            background: t.Ps,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: t.P,
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          <i className="ti ti-sparkles" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.t1 }}>
            Xem lại tình huống tương tự
          </div>
          <div style={{ fontSize: 12, color: t.t2, marginTop: 2 }}>
            Phát hiện 3 chân sóng tương tự giai đoạn hiện tại
          </div>
          <div
            style={{ fontSize: 15, fontWeight: 800, color: t.G, marginTop: 4 }}
          >
            +217 điểm (82% thành công)
          </div>
        </div>
        <button
          style={{
            background: t.P,
            border: "none",
            borderRadius: 8,
            padding: "7px 11px",
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Xem →
        </button>
      </div>

      {/* Lịch sử dò sóng */}
      <Card>
        <CardHeader
          icon="ti-clock"
          title="Lịch sử dò sóng"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setHistOff((h) => Math.max(0, h - PER))}
                disabled={histOff === 0}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: t.elev,
                  border: `1px solid ${t.bdr}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: t.t2,
                  opacity: histOff === 0 ? 0.3 : 1,
                }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 15 }} />
              </button>
              <span style={{ fontSize: 11, color: t.t4 }}>
                {histOff + 1}–{histOff + histSlice.length}/{histData.length}
              </span>
              <button
                onClick={() =>
                  setHistOff((h) => Math.min(histData.length - PER, h + PER))
                }
                disabled={histOff + PER >= histData.length}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: t.elev,
                  border: `1px solid ${t.bdr}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: t.t2,
                  opacity: histOff + PER >= histData.length ? 0.3 : 1,
                }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 15 }} />
              </button>
            </div>
          }
        />
        <div style={{ display: "flex", gap: 8 }}>
          {histSlice.map((d, i) => (
            <HistDonut
              key={d.date}
              d={d}
              active={i === 0 && histOff === 0}
              t={t}
            />
          ))}
        </div>
      </Card>

      {/* Danh mục */}
      <Card>
        <CardHeader
          icon="ti-list"
          title="Danh mục dò sóng"
          right={
            <span style={{ fontSize: 13, color: t.B, fontWeight: 600 }}>
              Xem tất cả →
            </span>
          }
        />
        <FilterChips
          options={[
            { id: "cm", label: `Chờ mua (${show(real.waitbuy)})` },
            { id: "mu", label: `Mua (${show(real.buy)})` },
            { id: "cb", label: `Chờ bán (${show(real.waitsell)})` },
            { id: "ba", label: `Bán (${show(real.sell)})` },
          ]}
          active={dsTab}
          onChange={setDsTab}
        />
        <TableWrap minWidth={360}>
          <thead>
            <tr>
              {["Mã", "Ngành", "Giá", "Tin cậy"].map((h) => (
                <th
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: t.t2,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    padding: "9px 10px",
                    borderBottom: `1px solid ${t.bdr}`,
                    textAlign:
                      h === "Giá" || h === "Tin cậy" ? "right" : "left",
                    whiteSpace: "nowrap",
                    background: t.elev,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {danh_muc.map((r) => (
              <tr key={r.ma}>
                <td
                  style={{
                    padding: "11px 10px",
                    fontWeight: 700,
                    color: t.B,
                    fontSize: 14,
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.ma}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 12,
                    color: t.t2,
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.nganh}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 13,
                    color: t.t1,
                    textAlign: "right",
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.gia}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    textAlign: "right",
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontWeight: 700, color: r.color }}>
                    {r.tc}%
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 40,
                      height: 3,
                      background: t.bdr,
                      borderRadius: 2,
                      overflow: "hidden",
                      verticalAlign: "middle",
                      marginLeft: 6,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${r.tc}%`,
                        background: r.color,
                        borderRadius: 2,
                      }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      {/* Lịch sử chân sóng */}
      <Card>
        <CardHeader icon="ti-history" title="Lịch sử chân sóng tiêu biểu" />
        <TableWrap minWidth={480}>
          <thead>
            <tr>
              {[
                "Ngày đáy",
                "VNINDEX",
                "Tin cậy",
                "Biến động",
                "Điểm tăng",
                "Loại",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: t.t2,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    padding: "9px 10px",
                    borderBottom: `1px solid ${t.bdr}`,
                    textAlign: [
                      "VNINDEX",
                      "Tin cậy",
                      "Biến động",
                      "Điểm tăng",
                    ].includes(h)
                      ? "right"
                      : "left",
                    whiteSpace: "nowrap",
                    background: t.elev,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chan_song.map((r) => (
              <tr key={r.ngay}>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 13,
                    color: t.t1,
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.ngay}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 13,
                    color: t.t1,
                    textAlign: "right",
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.vnindex}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 13,
                    textAlign: "right",
                    color: t.G,
                    fontWeight: 600,
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.tc}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 13,
                    textAlign: "right",
                    color: t.G,
                    fontWeight: 600,
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.bd}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    fontSize: 13,
                    textAlign: "right",
                    color: t.G,
                    fontWeight: 700,
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.diem}
                </td>
                <td
                  style={{
                    padding: "11px 10px",
                    borderBottom: `1px solid ${t.bdrs}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Tag cls={r.loaiCls} t={t}>
                    {r.loai}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      {/* Nhật ký */}
      <Card>
        <CardHeader
          icon="ti-notes"
          title="Nhật ký tín hiệu"
          meta="· 19/06"
          right={
            <span style={{ fontSize: 13, color: t.B, fontWeight: 600 }}>
              Xem tất cả →
            </span>
          }
        />
        {[
          {
            time: "15:30",
            color: t.G,
            text: (
              <>
                <strong>AI:</strong> Mã Chờ mua hiện là {real.waitbuy} mã (
                {waitbuyPct}%). Khả năng tạo đáy cao – Chờ xác nhận.
              </>
            ),
          },
          {
            time: "13:45",
            color: t.B,
            text: (
              <>
                <strong>AI:</strong> Dòng tiền quay lại CK, NH. Giải ngân thăm
                dò 30%.
              </>
            ),
          },
          {
            time: "10:20",
            color: t.A,
            text: (
              <>
                <strong>AI:</strong> Thị trường trong vùng đỡ đáy. Theo dõi mã
                Chờ mua.
              </>
            ),
          },
          {
            time: "09:15",
            color: t.t4,
            text: (
              <>
                <strong>AI:</strong> VNINDEX về 1.210–1.220. Khả năng hồi kỹ
                thuật.
              </>
            ),
          },
        ].map((l, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              padding: "9px 0",
              borderBottom: i < 3 ? `1px solid ${t.bdrs}` : "none",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: t.t3,
                width: 38,
                flexShrink: 0,
                marginTop: 2,
                fontWeight: 500,
              }}
            >
              {l.time}
            </span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: l.color,
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: t.t2, lineHeight: 1.6 }}>
              {l.text}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function HistDonut({ d, active, t }) {
  const tot = Number(d.total || 0);
  const donutTotal = d.cm + d.mu + d.cb + d.ba || 1;
  const pC = (d.cm / donutTotal) * 100;
  const pM = (d.mu / donutTotal) * 100;
  const pCb = (d.cb / donutTotal) * 100;
  const pB = (d.ba / donutTotal) * 100;
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
        <text x="36" y="44" textAnchor="middle" fill={t.t3} fontSize="8" fontFamily="system-ui">
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
            <div style={{ fontSize: 13, fontWeight: 800, color: clr, lineHeight: 1.3 }}>
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
          <div style={{ height: "100%", width: `${d.tc}%`, background: tcColor, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: tcColor }}>{d.tc}%</span>
      </div>
    </div>
  );
}
