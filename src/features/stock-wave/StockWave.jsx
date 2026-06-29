import { useMemo, useState } from "react";
import { useTheme } from "../../theme";
import { mono } from "../../styles/tokens";
import { useStockWave, useRealtimeStockWaveFeed } from "../../data/useStockWave";
import { fmtDay, fmtFull, fmtNum, pct, signed } from "../../app/formatters";
import { Card, CardHeader, TableWrap, THead, Pagination, Banner, LiveFooter } from "../../components/ui";
import { linkBtn } from "../../components/ui/ModuleControls";
import { WaveDonut } from "./WaveDonut";

/* ─────────────────────────── HIST NAVIGATOR (dò sóng) ───────────────────── */
function HistDonut({ row, active }) {
  const { t } = useTheme();
  const tc = row.reliability;
  const tcColor = tc >= 70 ? t.G : tc >= 55 ? t.MU : t.t4;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: active ? t.Bs : "var(--elev)",
        border: `0.5px solid ${active ? t.Bb : "var(--bdr)"}`,
        borderRadius: 10,
        padding: "12px 8px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textAlign: "center", lineHeight: 1.4 }}>
        {fmtDay(row.date)}
        {active && <span style={{ fontSize: 8, background: t.Bs, color: t.B, borderRadius: 3, padding: "1px 5px", marginLeft: 4 }}>Mới nhất</span>}
      </div>
      <WaveDonut row={row} size={90} sw={13} fontSize={16} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px", width: "100%" }}>
        {[[row.waitbuy, t.G, "C.MUA"], [row.buy, t.MU, "MUA"], [row.waitsell, t.A, "C.BÁN"], [row.sell, t.R, "BÁN"]].map(([v, c, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: c, lineHeight: 1.3, ...mono }}>{fmtNum(v)}</div>
            <div style={{ fontSize: 9, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".03em" }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", marginTop: 4 }}>
        <span style={{ fontSize: 9, color: "var(--t4)" }}>TC</span>
        <div style={{ flex: 1, height: 3, background: "var(--bdr)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${tc}%`, background: tcColor, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: tcColor, ...mono }}>{tc.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function HistNavigator({ rowsDesc }) {
  const [off, setOff] = useState(0);
  const PER = 3;
  const slice = rowsDesc.slice(off, off + PER);
  return (
    <Card>
      <CardHeader
        icon="ti-clock"
        title="Lịch sử dò sóng"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <NavBtn icon="ti-chevron-left" disabled={off === 0} onClick={() => setOff((o) => Math.max(0, o - PER))} />
            <span style={{ fontSize: 11, color: "var(--t4)" }}>{off + 1}–{off + slice.length}/{rowsDesc.length}</span>
            <NavBtn icon="ti-chevron-right" disabled={off + PER >= rowsDesc.length} onClick={() => setOff((o) => Math.min(Math.max(0, rowsDesc.length - PER), o + PER))} />
          </div>
        }
      />
      <div style={{ display: "flex", gap: 10 }}>
        {slice.map((row, i) => <HistDonut key={row.date} row={row} active={off === 0 && i === 0} />)}
      </div>
    </Card>
  );
}

function NavBtn({ icon, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 30, height: 30, borderRadius: 7, background: "var(--elev)", border: "0.5px solid var(--bdr)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer",
        color: "var(--t2)", opacity: disabled ? 0.3 : 1, fontSize: 14, fontFamily: "inherit",
      }}
    >
      <i className={`ti ${icon}`} />
    </button>
  );
}

function WaveMetric({ label, value, sub, color }) {
  return (
    <div style={{ background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 10, color: "var(--t4)", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 800, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color, ...mono }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 6, ...mono }}>{sub}</div>}
    </div>
  );
}

function ReliabilityPill({ value, t }) {
  const tone = value >= 70
    ? { fg: t.G, bg: t.Gs, border: t.Gb, icon: "ti-shield-check" }
    : value >= 55
      ? { fg: t.A, bg: t.As, border: t.Ab, icon: "ti-shield-half" }
      : { fg: "var(--t3)", bg: "var(--elev)", border: "var(--bdr)", icon: "ti-shield" };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 5, minWidth: 66, padding: "5px 8px", borderRadius: 999, background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.fg, fontSize: 11, fontWeight: 800, ...mono }}>
      <i className={`ti ${tone.icon}`} style={{ fontSize: 13 }} />
      {value.toFixed(0)}%
    </span>
  );
}

function HistoryValue({ value, color, bg }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", minWidth: 56, padding: "5px 8px", borderRadius: 7, background: bg, color, fontSize: 12, fontWeight: 800, ...mono }}>
      {fmtNum(value)}
    </span>
  );
}

function FlowBalance({ row, t }) {
  const buySide = row.waitbuy + row.buy;
  const sellSide = row.waitsell + row.sell;
  const buyWidth = Math.max(0, Math.min(100, pct(buySide, row.total)));
  const tone = buySide >= sellSide ? t.G : t.R;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 150 }}>
      <span style={{ width: 42, textAlign: "right", fontSize: 11, fontWeight: 800, color: tone, ...mono }}>{buyWidth.toFixed(0)}%</span>
      <div style={{ width: 82, height: 7, borderRadius: 999, overflow: "hidden", background: t.Rs, border: "0.5px solid var(--bdr)" }}>
        <div style={{ width: `${buyWidth}%`, height: "100%", background: t.G, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function WaveHistoryTable({ rows, page, totalPages, onPageChange, totalRows, t }) {
  const cell = {
    padding: "9px 10px",
    borderBottom: "0.5px solid var(--bdrs)",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  };
  const headRight = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 9px", borderRadius: 999, background: "var(--elev)", border: "0.5px solid var(--bdr)", color: "var(--t3)", fontSize: 11, fontWeight: 700 }}>
        <i className="ti ti-database" style={{ fontSize: 13 }} />
        {fmtNum(totalRows)} phiên
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 9px", borderRadius: 999, background: t.Gs, border: `0.5px solid ${t.Gb}`, color: t.G, fontSize: 11, fontWeight: 800 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.G }} />
        Mua
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 9px", borderRadius: 999, background: t.Rs, border: `0.5px solid ${t.Rb}`, color: t.R, fontSize: 11, fontWeight: 800 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.R }} />
        Bán
      </span>
    </div>
  );

  return (
    <Card noPad>
      <div style={{ padding: "14px 16px 12px", borderBottom: "0.5px solid var(--bdr)", background: "var(--surf)" }}>
        <CardHeader icon="ti-history" title="Lịch sử phiên" right={headRight} mb={0} />
      </div>
      <TableWrap minWidth={820}>
        <THead cols={[
          { label: "Ngày", pl: 16 },
          { label: "Chờ mua", right: true },
          { label: "Mua", right: true },
          { label: "Chờ bán", right: true },
          { label: "Bán", right: true },
          { label: "Tổng", right: true },
          { label: "Cân bằng", right: true },
          { label: "Tin cậy", right: true },
        ]} />
        <tbody>
          {rows.map((row, index) => {
            const latest = page === 1 && index === 0;
            const bg = latest ? "var(--elev)" : "var(--surf)";
            return (
              <tr key={row.date} style={{ background: bg }}>
                <td style={{ ...cell, paddingLeft: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: latest ? "var(--t1)" : "var(--t2)", fontWeight: 800 }}>{fmtDay(row.date)}</span>
                    {latest && <span style={{ fontSize: 8, background: "var(--Bs)", color: "var(--B)", borderRadius: 4, padding: "2px 5px", fontWeight: 800 }}>HN</span>}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10, color: "var(--t4)" }}>{fmtFull(row.date)}</div>
                </td>
                <td style={{ ...cell, textAlign: "right" }}><HistoryValue value={row.waitbuy} color={t.G} bg={t.Gs} /></td>
                <td style={{ ...cell, textAlign: "right" }}><HistoryValue value={row.buy} color={t.MU} bg={t.MUs} /></td>
                <td style={{ ...cell, textAlign: "right" }}><HistoryValue value={row.waitsell} color={t.A} bg={t.As} /></td>
                <td style={{ ...cell, textAlign: "right" }}><HistoryValue value={row.sell} color={t.R} bg={t.Rs} /></td>
                <td style={{ ...cell, textAlign: "right", color: "var(--t1)", fontWeight: 800, ...mono }}>{fmtNum(row.total)}</td>
                <td style={{ ...cell, textAlign: "right" }}><FlowBalance row={row} t={t} /></td>
                <td style={{ ...cell, textAlign: "right", paddingRight: 16 }}><ReliabilityPill value={row.reliability} t={t} /></td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderTop: "0.5px solid var(--bdr)", background: "var(--surf)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--t4)", fontWeight: 700 }}>
            Trang {page}/{totalPages}
          </span>
          <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════ AI ADVISOR / DÒ SÓNG (REAL) ═════════════════ */
export function ModDoSong() {
  const { t } = useTheme();
  const { name, rows, status, error, updatedAt, refresh, applyTick } = useStockWave();
  const { connected: live } = useRealtimeStockWaveFeed(applyTick);

  const rowsDesc = useMemo(() => [...rows].reverse(), [rows]);
  const latest = rowsDesc[0] || null;
  const prev = rowsDesc[1] || null;

  const [page, setPage] = useState(1);
  const PER = 12;
  const totalPages = Math.max(1, Math.ceil(rowsDesc.length / PER));
  const safePage = Math.min(page, totalPages);
  const pageRows = rowsDesc.slice((safePage - 1) * PER, safePage * PER);

  if (status === "loading" && !latest) return <Banner>Đang tải dữ liệu dò sóng…</Banner>;
  if (status === "error" && !latest)
    return <Banner tone="error">Lỗi tải dữ liệu: {error} <button onClick={refresh} style={linkBtn}>Thử lại</button></Banner>;
  if (!latest) return <Banner>Chưa có dữ liệu dò sóng.</Banner>;

  const segs = [
    { key: "waitbuy", lbl: "Chờ mua", val: latest.waitbuy, prev: prev?.waitbuy, c: t.G, bg: t.Gs, bdr: t.Gb },
    { key: "buy", lbl: "Mua", val: latest.buy, prev: prev?.buy, c: t.MU, bg: t.MUs, bdr: t.MUb },
    { key: "waitsell", lbl: "Chờ bán", val: latest.waitsell, prev: prev?.waitsell, c: t.A, bg: t.As, bdr: t.Ab },
    { key: "sell", lbl: "Bán", val: latest.sell, prev: prev?.sell, c: t.R, bg: t.Rs, bdr: t.Rb },
  ];
  const dominant = segs.reduce((best, cur) => (cur.val > best.val ? cur : best), segs[0]);
  const buySide = latest.waitbuy + latest.buy;
  const sellSide = latest.waitsell + latest.sell;
  const buyPressure = pct(buySide - sellSide, latest.total);
  const totalDelta = prev ? latest.total - prev.total : 0;
  const reliabilityDelta = prev ? latest.reliability - prev.reliability : 0;
  const signalTone = buyPressure >= 15 ? t.G : buyPressure <= -15 ? t.R : t.A;
  const signalText = buyPressure >= 15 ? "Thiên mua" : buyPressure <= -15 ? "Thiên bán" : "Cân bằng";
  const tcColor = latest.reliability >= 70 ? t.G : latest.reliability >= 55 ? t.A : t.t3;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <Card>
          <CardHeader
            icon="ti-chart-donut"
            title="Sóng cổ phiếu hôm nay"
            meta={`· ${fmtFull(latest.date)} · ${name}`}
            right={
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: live ? t.Gs : "var(--elev)", border: `0.5px solid ${live ? t.Gb : "var(--bdr)"}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: live ? t.G : "var(--t3)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{live ? "Realtime" : "Định kỳ"}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: latest.reliability >= 70 ? t.Gs : t.As, border: `0.5px solid ${latest.reliability >= 70 ? t.Gb : t.Ab}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, color: tcColor }}>
                  <i className="ti ti-shield-check" style={{ fontSize: 14 }} />{latest.reliability.toFixed(0)}%
                </span>
              </div>
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, alignItems: "stretch" }}>
            <div style={{ background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240 }}>
              <WaveDonut row={latest} size={156} sw={20} fontSize={30} />
              <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 7, background: `${signalTone}20`, border: `0.5px solid ${signalTone}55`, color: signalTone, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 800 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {signalText}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--t3)", textAlign: "center" }}>
                Nhóm lớn nhất: <span style={{ color: dominant.c, fontWeight: 700 }}>{dominant.lbl}</span> · {pct(dominant.val, latest.total).toFixed(1)}%
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                <WaveMetric label="Tổng mã" value={fmtNum(latest.total)} sub={prev ? signed(totalDelta) : "Phiên mới nhất"} color="var(--t1)" />
                <WaveMetric label="Tin cậy" value={`${latest.reliability.toFixed(0)}%`} sub={prev ? signed(reliabilityDelta.toFixed(0), "%") : "Theo API"} color={tcColor} />
                <WaveMetric label="Áp lực mua" value={`${buyPressure.toFixed(1)}%`} sub={`${fmtNum(buySide)} / ${fmtNum(sellSide)}`} color={signalTone} />
                <WaveMetric label="Số phiên" value={fmtNum(rowsDesc.length)} sub={updatedAt ? updatedAt.toLocaleTimeString("vi-VN") : "Đang cập nhật"} color={t.P} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
                {segs.map((s) => {
                  const segmentPct = pct(s.val, latest.total);
                  const delta = s.prev == null ? 0 : s.val - s.prev;
                  return (
                    <div key={s.key} style={{ background: s.bg, border: `0.5px solid ${s.bdr}`, borderRadius: 10, padding: "11px 13px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: s.c }}>{s.lbl}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: delta >= 0 ? t.G : t.R, ...mono }}>{s.prev == null ? "—" : signed(delta)}</div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: s.c, ...mono }}>{fmtNum(s.val)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(0, Math.min(100, segmentPct))}%`, height: "100%", background: s.c, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 11, color: s.c, fontWeight: 800, ...mono }}>{segmentPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <HistNavigator rowsDesc={rowsDesc} />

        <WaveHistoryTable rows={pageRows} page={safePage} totalPages={totalPages} onPageChange={setPage} totalRows={rowsDesc.length} t={t} />
        <LiveFooter live={live} updatedAt={updatedAt} extra={`${rowsDesc.length} phiên`} />
      </div>
    </div>
  );
}
