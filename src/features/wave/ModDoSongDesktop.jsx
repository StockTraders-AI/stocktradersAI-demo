// Module Dò sóng thị trường: donut chính, AI khuyến nghị, lịch sử, danh mục và nhật ký.

import { useState } from "react";

import {
  Card,
  CardHeader,
  Clink,
  TableWrap,
  THead,
  Tag,
  AIIcon,
  arcPath,
} from "../../components/ui";
import { HIST } from "./waveMockData";

export default function ModDoSong({
  t,
  dark,
  waveData,
  waveHistory = [],
  todayReliability,
  compact = false,
}) {
  const [dsTab, setDsTab] = useState("cm");

  const hasWave = !!waveData;
  const real = waveData || {};

  const reliability = Number(todayReliability || 0);
  const reliabilityText = reliability ? `${reliability}%` : "--";

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

  // Dùng riêng cho vòng tròn: 4 nhóm này phải lấp đầy 100% vòng tròn
  // Không dùng real.total ở đây, vì real.total còn bao gồm các mã khác ngoài 4 nhóm.
  const donutTotal =
    Number(real.waitbuy || 0) +
      Number(real.buy || 0) +
      Number(real.waitsell || 0) +
      Number(real.sell || 0) || 1;
  const waitbuyDonutPct = (Number(real.waitbuy || 0) / donutTotal) * 100;
  const buyDonutPct = (Number(real.buy || 0) / donutTotal) * 100;
  const waitsellDonutPct = (Number(real.waitsell || 0) / donutTotal) * 100;
  const sellDonutPct = (Number(real.sell || 0) / donutTotal) * 100;

  const DANH_MUC = [
    { ma: "SSI", nganh: "Chứng khoán", gia: "24,850", tc: 85, c: t.G },
    { ma: "HCM", nganh: "Chứng khoán", gia: "26,100", tc: 82, c: t.G },
    { ma: "VND", nganh: "Chứng khoán", gia: "19,650", tc: 80, c: t.G },
    { ma: "VCI", nganh: "Chứng khoán", gia: "26,300", tc: 78, c: t.A },
    { ma: "ACB", nganh: "Ngân hàng", gia: "24,900", tc: 75, c: t.A },
  ];
  const CHAN_SONG = [
    {
      ngay: "09/04/2026",
      vi: "1,073.61",
      tc: "82%",
      diem: "+300.36 điểm",
      dai: "21 phiên",
      loai: "tg",
      lbl: "Sóng lớn",
    },
    {
      ngay: "20/02/2026",
      vi: "1,202.57",
      tc: "76%",
      diem: "+250.68 điểm",
      dai: "17 phiên",
      loai: "tg",
      lbl: "Sóng lớn",
    },
    {
      ngay: "10/01/2026",
      vi: "1,158.23",
      tc: "71%",
      diem: "+185.44 điểm",
      dai: "15 phiên",
      loai: "tb",
      lbl: "Sóng hồi",
    },
    {
      ngay: "12/11/2025",
      vi: "1,198.47",
      tc: "73%",
      diem: "+182.12 điểm",
      dai: "18 phiên",
      loai: "tb",
      lbl: "Sóng hồi",
    },
    {
      ngay: "19/09/2025",
      vi: "1,265.11",
      tc: "68%",
      diem: "+215.29 điểm",
      dai: "13 phiên",
      loai: "tb",
      lbl: "Sóng hồi",
    },
  ];
  const td = {
    padding: compact ? "7px 8px" : "7px 10px",
    borderBottom: `0.5px solid ${t.bdrs}`,
    whiteSpace: "nowrap",
  };
  const donutSize = compact ? 124 : 140;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "minmax(0, 1fr)" : "1fr 1fr",
        gap: compact ? 12 : 14,
        marginTop: 2,
        minWidth: 0,
      }}
    >
      {/* LEFT */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minWidth: 0,
        }}
      >
        {/* Donut chính */}
        <Card style={{ minHeight: compact ? undefined : 290 }}>
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
                  border: `0.5px solid ${t.Gb}`,
                  borderRadius: 8,
                  padding: "6px 12px",
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
          <div
            style={{
              display: "flex",
              flexDirection: compact ? "column" : "row",
              alignItems: compact ? "stretch" : "center",
              gap: compact ? 12 : 18,
            }}
          >
            <svg
              width={donutSize}
              height={donutSize}
              viewBox="0 0 140 140"
              style={{ flexShrink: 0, alignSelf: "center" }}
            >
              {arcPath(70, 70, 54, 20, waitbuyDonutPct, "#1F8F63", 0)}

              {arcPath(70, 70, 54, 20, buyDonutPct, "#1DB87A", waitbuyDonutPct)}

              {arcPath(
                70,
                70,
                54,
                20,
                waitsellDonutPct,
                "#F5A623",
                waitbuyDonutPct + buyDonutPct,
              )}

              {arcPath(
                70,
                70,
                54,
                20,
                sellDonutPct,
                "#FF3B5C",
                waitbuyDonutPct + buyDonutPct + waitsellDonutPct,
              )}

              <text
                x="70"
                y="75"
                textAnchor="middle"
                fill={t.t1}
                fontSize="28"
                fontWeight="800"
              >
                {show(real.total)}
              </text>
            </svg>
            {/* 4 stat boxes 2×2 */}
            <div
              style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: compact ? 8 : 10,
              }}
            >
              {[
                {
                  lbl: "Chờ mua",
                  val: show(real.waitbuy),
                  pct: hasWave ? `${waitbuyPct}%` : "--",
                  bg: t.Gs,
                  bdr: t.Gb,
                  c: t.G,
                },
                {
                  lbl: "Mua",
                  val: show(real.buy),
                  pct: hasWave ? `${buyPct}%` : "--",
                  bg: "#1A8A4A",
                  bdr: "#166534",
                  c: "#fff",
                  shadow: "0 4px 14px rgba(26,138,74,.35)",
                },
                {
                  lbl: "Chờ bán",
                  val: show(real.waitsell),
                  pct: hasWave ? `${waitsellPct}%` : "--",
                  bg: t.As,
                  bdr: t.Ab,
                  c: t.A,
                },
                {
                  lbl: "Bán",
                  val: show(real.sell),
                  pct: hasWave ? `${sellPct}%` : "--",
                  bg: t.Rs,
                  bdr: t.Rb,
                  c: t.R,
                },
              ].map((s) => (
                <div
                  key={s.lbl}
                  style={{
                    background: s.bg,
                    border: `0.5px solid ${s.bdr}`,
                    borderRadius: 10,
                    padding: compact ? "10px 11px" : "11px 13px",
                    boxShadow: s.shadow,
                    minHeight: 65,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      marginBottom: 4,
                      color: s.lbl === "Mua" ? "rgba(255,255,255,.80)" : s.c,
                    }}
                  >
                    {s.lbl}
                  </div>
                  <div
                    style={{
                      fontSize: compact ? 20 : 22,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: s.c,
                    }}
                  >
                    {s.val}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 3,
                      color: s.lbl === "Mua" ? "rgba(255,255,255,.75)" : s.c,
                      opacity: s.lbl === "Mua" ? 1 : 0.85,
                    }}
                  >
                    {s.pct}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Hist Navigator */}
        <HistNavigator t={t} history={waveHistory} compact={compact} />

        {/* Chân sóng - copy UI theo HTML */}
        <Card>
          <CardHeader
            icon="ti-history"
            title="Lịch sử chân sóng tiêu biểu"
            right={<Clink>Xem tất cả →</Clink>}
          />
          <TableWrap minWidth={compact ? 520 : 560}>
            <THead
              cols={[
                { label: "Ngày tạo đáy", width: "95px", center: true },
                { label: "VNINDEX đáy", width: "105px", center: true },
                { label: "Độ tin cậy", width: "80px", center: true },
                { label: "Tăng điểm", width: "130px", center: true },
                { label: "Độ dài", width: "75px", center: true },
                { label: "Loại sóng", width: "75px", center: true },
              ]}
            />
            <tbody>
              {CHAN_SONG.map((r) => (
                <tr key={r.ngay}>
                  <td style={{ ...td, width: "95px", textAlign: "center" }}>
                    {r.ngay}
                  </td>
                  <td style={{ ...td, width: "105px", textAlign: "center" }}>
                    {r.vi}
                  </td>

                  <td
                    style={{
                      ...td,
                      width: "80px",
                      textAlign: "center",
                      color: t.G,
                      fontWeight: 600,
                    }}
                  >
                    {r.tc}
                  </td>

                  <td
                    style={{
                      ...td,
                      width: "130px",
                      textAlign: "center",
                      color: t.G,
                      fontWeight: 700,
                    }}
                  >
                    {r.diem}
                  </td>

                  <td
                    style={{
                      ...td,
                      width: "75px",
                      textAlign: "center",
                      color: t.t3,
                    }}
                  >
                    {r.dai}
                  </td>

                  <td style={{ ...td, width: "75px", textAlign: "center" }}>
                    <Tag cls={r.loai} t={t}>
                      {r.lbl}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div
            style={{
              marginTop: 11,
              fontSize: 12,
              color: t.B,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Xem tất cả lịch sử chân sóng →
          </div>
        </Card>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
        }}
      >
        {/* Khuyến nghị AI */}
        <div
          style={{
            position: "relative",
            background: dark ? "#1C1040" : "#F5F0FF",
            border: `1px solid ${dark ? "#5B21B6" : "#7C3AED"}`,
            borderRadius: 12,
            padding: 15,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 17,
              right: 17,
              width: 50,
              height: 50,
              borderRadius: "50%",
              background: "rgba(61,214,140,.12)",
              border: "0.5px solid rgba(61,214,140,.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.G,
              fontSize: 25,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12h4l2-6 4 12 2-6h6"
                stroke={t.G}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
              paddingRight: compact ? 54 : 65,
            }}
          >
            <AIIcon />
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: dark ? "#C4B5FD" : "#6D28D9",
                  textTransform: "uppercase",
                  letterSpacing: ".07em",
                }}
              >
                Khuyến nghị từ AI
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: dark ? "rgba(196,181,253,.7)" : "#9333EA",
                  marginTop: 2,
                  fontWeight: 500,
                }}
              >
                StockTraders AI · {show(real.date)}
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: dark ? "#fff" : "#3B0764",
              marginBottom: 8,
              lineHeight: 1.35,
              textAlign: "left",
            }}
          >
            Khả năng tạo đáy cao – Chờ xác nhận !
          </div>

          <div
            style={{
              fontSize: 13,
              color: dark ? "#E9D5FF" : "#4C1D95",
              lineHeight: 1.65,
              textAlign: "left",
            }}
          >
            Số lượng mã Chờ mua đang chiếm tỷ trọng cao {waitbuyPct}% trên tổng
            số {show(real.total)} mã. Dòng tiền bắt đầu quay lại, thị trường
            đang ở vùng đỡ đáy.
          </div>

          <div
            style={{
              background: dark ? "rgba(0,0,0,.25)" : "rgba(109,40,217,.10)",
              border: `1px solid ${dark ? "rgba(255,255,255,.15)" : "rgba(109,40,217,.30)"}`,
              borderRadius: 9,
              padding: "9px 12px",
              marginTop: 10,
              fontSize: 12,
              fontWeight: 600,
              color: dark ? "#DDD6FE" : "#5B21B6",
              display: "flex",
              gap: 7,
              alignItems: "flex-start",
              lineHeight: 1.5,
            }}
          >
            <i
              className="ti ti-info-circle"
              style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}
            />
            <span>
              Khuyến nghị: Giải ngân thăm dò 30% và chờ xác nhận chân sóng.
            </span>
          </div>
        </div>

        {/* Xem lại tình huống - căn trái giống UI HTML */}
        {/* Xem lại tình huống tương tự trong quá khứ */}
        <div
          style={{
            position: "relative",
            background: "var(--elev)",
            border: `0.5px solid ${t.Bb}`,
            borderRadius: 12,
            padding: compact ? "18px 14px 15px" : "22px 18px 18px",
            minHeight: 150,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: compact ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: t.t1,
                textTransform: "uppercase",
                letterSpacing: ".04em",
              }}
            >
              Xem lại tình huống tương tự trong quá khứ
            </div>

            <button
              style={{
                background: t.B,
                border: "none",
                borderRadius: 7,
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                cursor: "pointer",
                minWidth: 84,
                height: 28,
                lineHeight: 1,
              }}
            >
              Đề xuất
            </button>
          </div>

          {/* Content */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: compact ? "40px minmax(0,1fr)" : "40px 1fr auto",
              alignItems: "start", // sửa center -> start
              gap: compact ? "12px 10px" : 14,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                background: "rgba(124,58,237,.18)",
              }}
            />

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: t.t2,
                  lineHeight: 1.7,
                  textAlign: "left",
                  maxWidth: 430,
                }}
              >
                Hệ thống đã ghi nhận 3 tình huống tương tự trước đây với tỷ lệ
                thành công cao.
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: t.t3,
                  lineHeight: 1.6,
                  marginTop: 4,
                  textAlign: "left",
                }}
              >
                Các thị trường đều bật tăng mạnh sau khi xác nhận chân sóng.
              </div>

              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: t.G,
                  marginTop: 10,
                  textAlign: "left",
                }}
              >
                +217 điểm (82% thành công)
              </div>
            </div>

            <button
              style={{
                background: t.P,
                border: "none",
                padding: "8px 14px",
                fontSize: 12,
                borderRadius: 8,
                fontWeight: 800,
                color: "#fff",
                cursor: "pointer",
                whiteSpace: "nowrap",
                gridColumn: compact ? "2" : undefined,
                justifySelf: compact ? "start" : undefined,
              }}
            >
              Xem ngay →
            </button>
          </div>
        </div>

        {/* Danh mục dò sóng - tab grid theo HTML */}
        <Card>
          <CardHeader
            icon="ti-list"
            title="Danh mục dò sóng"
            mb={8}
            right={<Clink>Xem tất cả →</Clink>}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: compact ? "repeat(2,1fr)" : "repeat(4,1fr)",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {[
              {
                id: "cm",
                name: "Chờ mua",
                val: show(real.waitbuy),
                bg: t.Gs,
                bdr: t.Gb,
                c: t.G,
              },
              {
                id: "mu",
                name: "Mua",
                val: show(real.buy),
                bg: "var(--elev)",
                bdr: t.bdr,
                c: t.t2,
              },
              {
                id: "cb",
                name: "Chờ bán",
                val: show(real.waitsell),
                bg: "var(--elev)",
                bdr: t.bdr,
                c: t.t2,
              },
              {
                id: "ba",
                name: "Bán",
                val: show(real.sell),
                bg: "var(--elev)",
                bdr: t.bdr,
                c: t.t2,
              },
            ].map((tab) => {
              const active = dsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setDsTab(tab.id)}
                  style={{
                    textAlign: "center",
                    padding: "5px 4px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: active
                      ? tab.id === "cm"
                        ? t.Gs
                        : t.Bs
                      : "var(--elev)",
                    border: `0.5px solid ${active ? (tab.id === "cm" ? t.Gb : t.Bb) : t.bdr}`,
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      color: active ? (tab.id === "cm" ? t.G : t.B) : t.t2,
                    }}
                  >
                    {tab.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: active ? (tab.id === "cm" ? t.G : t.B) : t.t4,
                      opacity: 0.8,
                    }}
                  >
                    ({tab.val})
                  </div>
                </button>
              );
            })}
          </div>

          <TableWrap minWidth={380}>
            <THead
              cols={[
                { label: "Mã", width: "80px", center: true },
                { label: "Ngành", width: "180px", center: true },
                { label: "Giá", width: "100px", center: true },
                { label: "Độ tin cậy", width: "140px", center: true },
              ]}
            />
            <tbody>
              {DANH_MUC.map((r) => (
                <tr key={r.ma}>
                  <td
                    style={{
                      ...td,
                      width: "80px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: t.B,
                      fontSize: 13,
                    }}
                  >
                    {r.ma}
                  </td>

                  <td
                    style={{
                      ...td,
                      width: "180px",
                      textAlign: "center",
                      color: t.t2,
                    }}
                  >
                    {r.nganh}
                  </td>

                  <td
                    style={{
                      ...td,
                      width: "100px",
                      textAlign: "center",
                    }}
                  >
                    {r.gia}
                  </td>

                  <td
                    style={{
                      ...td,
                      width: "140px",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: r.c }}>{r.tc}%</span>
                    <span
                      style={{
                        display: "inline-block",
                        width: 44,
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
                          background: r.c,
                          borderRadius: 2,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <div
            style={{
              marginTop: 11,
              fontSize: 12,
              color: t.B,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            Xem tất cả {show(real.waitbuy)} mã chờ mua →
          </div>
        </Card>

        {/* Nhật ký tín hiệu - icon tròn đầy đủ theo HTML */}
        <Card>
          <CardHeader
            icon="ti-notes"
            title="Nhật ký tín hiệu"
            meta={`(${show(real.date)})`}
            mb={8}
            right={<Clink>Xem tất cả →</Clink>}
          />

          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              {
                time: "15:30",
                bg: "rgba(29,184,122,.15)",
                icon: "ti-trending-up",
                color: t.G,
                tx: (
                  <>
                    <strong>AI:</strong> Số lượng mã Chờ mua tăng mạnh lên{" "}
                    {show(real.waitbuy)} mã ({waitbuyPct}%). Khả năng tạo đáy
                    cao – Chờ xác nhận chân sóng.
                  </>
                ),
              },
              {
                time: "13:45",
                bg: "rgba(61,214,140,.12)",
                icon: "ti-chart-line",
                color: t.G,
                tx: (
                  <>
                    <strong>AI:</strong> Dòng tiền bắt đầu quay lại nhóm Chứng
                    khoán, Ngân hàng. Khuyến nghị giải ngân thăm dò 30%.
                  </>
                ),
              },
              {
                time: "10:20",
                bg: "rgba(255,159,10,.14)",
                icon: "ti-alert-circle",
                color: t.A,
                tx: (
                  <>
                    <strong>AI:</strong> Thị trường đang trong vùng đỡ đáy. Theo
                    dõi sát số lượng mã Chờ mua.
                  </>
                ),
              },
              {
                time: "09:15",
                bg: "rgba(124,58,237,.14)",
                icon: "ti-wave-sine",
                color: t.B,
                tx: (
                  <>
                    <strong>AI:</strong> VNINDEX giảm về vùng hỗ trợ mạnh 1.210
                    – 1.220 điểm. Khả năng xuất hiện nhịp hồi kỹ thuật.
                  </>
                ),
              },
            ].map((l, i, arr) => (
              <div
                key={l.time}
                style={{
                  display: "flex",
                  gap: 9,
                  padding: "5px 0",
                  borderBottom:
                    i < arr.length - 1 ? `0.5px solid ${t.bdrs}` : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: t.t4,
                    width: 36,
                    flexShrink: 0,
                    marginTop: 2,
                    fontWeight: 600,
                  }}
                >
                  {l.time}
                </div>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: l.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <i
                    className={`ti ${l.icon}`}
                    style={{ fontSize: 13, color: l.color }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: t.t2,
                    lineHeight: 1.55,
                  }}
                >
                  {l.tx}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function HistDonut({ d, active, t, compact }) {
  const tot = Number(d.total || 0);
  const donutTotal = d.cm + d.mu + d.cb + d.ba || 1;
  const pC = (d.cm / donutTotal) * 100;
  const pM = (d.mu / donutTotal) * 100;
  const pCb = (d.cb / donutTotal) * 100;
  const pB = (d.ba / donutTotal) * 100;
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
            <div style={{ fontSize: 13, fontWeight: 800, color: c, lineHeight: 1.3 }}>
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
          <div style={{ height: "100%", width: `${d.tc}%`, background: tcColor, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: tcColor }}>{d.tc}%</span>
      </div>
    </div>
  );
}

function HistNavigator({ t, history = [], compact = false }) {
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
              {off + 1}-{off + slice.length}/{source.length}
            </span>
            <button
              onClick={() => setOff((o) => Math.min(source.length - PER, o + PER))}
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
                opacity: off + PER >= source.length ? 0.3 : 1,
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
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: i === Math.floor(off / PER) ? "var(--B)" : "var(--bdr)",
            }}
          />
        ))}
      </div>
    </Card>
  );
}
