import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme";
import { mono } from "../../styles/tokens";
import { useNarrow } from "../../app/useNarrow";
import { fmtFull, fmtNum, pct } from "../../app/formatters";
import { useSMDTTicker } from "../../data/useSMDTTicker";
import { useCashFlowTicker, tickerContentToSig } from "../../data/useCashFlowTicker";
import { useSMDT } from "../../data/useSMDT";
import { useCashFlowBranch, contentToSig } from "../../data/useCashFlowBranch";
import { useBranchPath } from "../../data/useBranchPath";
import { useTotalTrade } from "../../data/useTotalTrade";
import { useStockSignal } from "../../data/useStockSignal";
import { Banner, Card } from "../../components/ui";
import { CfBadge } from "../cash-flow-ticker/CfBadge";

const MAX_CODES = 15;
const STORAGE_KEY = "portfolio_analysis_state_v1";
const INDUSTRY_ALIAS_GROUPS = [
  ["Môi giới chứng khoán", "Chứng khoán"],
  ["Ngân hàng thương mại truyền thống", "Ngân hàng", "Ngân hàng TM truyền thống"],
  ["Bất động sản dân cư", "BĐS Dân cư", "BĐS dân cư", "Bất động sản Dân cư", "Bất động sản"],
  ["Sản xuất, chế biến thép", "Thép"],
  ["Sóng ngành Vin", "Sóng Vin", "Vin", "Vingroup"],
  ["Xây dựng"],
  ["Sản xuất và Khai thác dầu khí", "Dầu khí"],
];

function normalizeName(name) {
  return String(name || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function aliasesOf(name) {
  const normalized = normalizeName(name);
  const group = INDUSTRY_ALIAS_GROUPS.find((items) => items.some((item) => normalizeName(item) === normalized));
  return group || [name];
}

function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return date.slice(0, 10);
}

function sortDatesDesc(dates) {
  return [...dates].sort((a, b) => toDateInputValue(b).localeCompare(toDateInputValue(a)));
}

function findDateIndex(datesDesc, dateValue) {
  if (!dateValue || datesDesc.length === 0) return -1;
  const exactIndex = datesDesc.findIndex((date) => toDateInputValue(date) === dateValue);
  if (exactIndex >= 0) return exactIndex;
  const previousIndex = datesDesc.findIndex((date) => toDateInputValue(date) <= dateValue);
  return previousIndex === -1 ? datesDesc.length - 1 : previousIndex;
}

function makeIndustryLookup(branches, matrix, date, valueOf) {
  const map = new Map();
  for (const branch of branches) {
    const value = valueOf(matrix[branch.key]?.[date]);
    for (const name of [branch.key, branch.label, ...aliasesOf(branch.key), ...aliasesOf(branch.label)]) {
      map.set(normalizeName(name), value);
    }
  }
  return map;
}

function lookupIndustry(map, industry) {
  for (const name of aliasesOf(industry)) {
    const value = map.get(normalizeName(name));
    if (value != null) return value;
  }
  return map.get(normalizeName(industry)) ?? null;
}

function findTradePoint(tradeRow, dateValue) {
  if (!tradeRow || !dateValue) return null;
  const dates = Object.keys(tradeRow).sort().reverse();
  const target = dates.find((date) => toDateInputValue(date) <= dateValue);
  return target ? tradeRow[target] : null;
}

function parseCodes(input) {
  const seen = new Set();
  return input
    .split(/[,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .flatMap((code) => {
      if (seen.has(code)) return [];
      seen.add(code);
      return [code];
    })
    .slice(0, MAX_CODES);
}

function loadSavedPortfolio() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const input = typeof parsed?.input === "string" ? parsed.input : "";
    const analyzedCodes = Array.isArray(parsed?.analyzedCodes)
      ? parsed.analyzedCodes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean).slice(0, MAX_CODES)
      : [];
    return { input, analyzedCodes };
  } catch {
    return { input: "", analyzedCodes: [] };
  }
}

function savePortfolio(input, analyzedCodes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, analyzedCodes }));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}

function isPositiveSig(sig) {
  return sig === "si" || sig === "sn";
}

function calcSignal(row) {
  const strongTicker = Number.isFinite(row.smdt) && row.smdt >= 70;
  const supportedFlow = isPositiveSig(row.tickerSig);
  const branchSupport = isPositiveSig(row.branchSig) && Number.isFinite(row.branchSmdt) && row.branchSmdt >= 55;
  return strongTicker && (supportedFlow || branchSupport) ? "MUA" : "BAN";
}

function calcEval(row) {
  const buy = row.signal === "MUA";
  const tickerIn = isPositiveSig(row.tickerSig);
  const branchIn = isPositiveSig(row.branchSig);
  if (buy && tickerIn && branchIn) return "DS_DN";
  if (buy && tickerIn && !branchIn) return "DS_SN";
  return "SS";
}

function scoreCalc(rows) {
  const n = rows.length || 1;
  const dn = rows.filter((row) => row.evalKey === "DS_DN").length;
  const sn = rows.filter((row) => row.evalKey === "DS_SN").length;
  const ss = rows.filter((row) => row.evalKey === "SS").length;
  return { dn, sn, ss, score: Math.round((dn / n) * 85 + (sn / n) * 45 + (ss / n) * 15) };
}

function scoreLabel(score) {
  if (score >= 85) return ["Xuất sắc", "var(--G)"];
  if (score >= 70) return ["Tốt", "var(--G)"];
  if (score >= 55) return ["Trung bình khá", "var(--B)"];
  if (score >= 40) return ["Trung bình", "var(--A)"];
  return ["Cần cải thiện", "var(--R)"];
}

function getTip(dn, sn, ss, total) {
  const pS = ss / total;
  const pSN = sn / total;
  const pD = dn / total;
  if (pS > 0.5) return "Phần lớn mã đang ngược sóng. Ưu tiên cắt giảm và tái cơ cấu sang ngành có dòng tiền đổ vào.";
  if (pSN > 0.4) return "Nhiều mã chưa thuộc ngành dẫn sóng. Cân nhắc chuyển dịch sang ngành có dòng tiền đổ vào mạnh hơn.";
  if (pD >= 0.6) return "Danh mục đang tốt, hầu hết mã đúng sóng đúng ngành. Duy trì và theo dõi chặt stop-loss.";
  return "Danh mục ở mức trung bình. Tăng tỷ trọng các mã đúng ngành dẫn dắt.";
}

function priceText(point) {
  const close = point?.close;
  if (!Number.isFinite(close)) return "—";
  return close.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function changePct(point) {
  if (!point || !Number.isFinite(point.close) || !Number.isFinite(point.open) || point.open === 0) return null;
  return ((point.close - point.open) / point.open) * 100;
}

function getStockSignalForDate(stockSig, dateValue) {
  const points = Array.isArray(stockSig?.points) ? stockSig.points : [];
  if (!points.length) return stockSig;
  const eligible = points.filter((point) => !dateValue || toDateInputValue(point.date) <= dateValue);
  const latestHoldPoint = eligible[eligible.length - 1] || points[points.length - 1] || stockSig;
  const tradePoint = dateValue ? eligible.findLast((point) => toDateInputValue(point.date) === dateValue && (point.trade === 1 || point.trade === 2)) : latestHoldPoint;
  const trade = tradePoint?.trade;
  const signal = trade === 1 ? "MUA" : trade === 2 ? "BAN" : "Nắm giữ";
  const hold = Number.isFinite(latestHoldPoint?.hold) ? latestHoldPoint.hold : Number.isFinite(latestHoldPoint?.weight) ? latestHoldPoint.weight : null;
  const percent = Number.isFinite(tradePoint?.percent) ? tradePoint.percent : null;
  const weight = trade === 1 && Number.isFinite(hold) && Number.isFinite(percent) ? hold + percent : hold;
  return { ...latestHoldPoint, signal, weight, hold, trade, tradePoint };
}

function EvalBadge({ value, full }) {
  const meta = {
    DS_DN: { label: "Đúng sóng, đúng ngành", bg: "var(--Gs)", border: "var(--Gb)", color: "var(--G)" },
    DS_SN: { label: "Đúng sóng, sai ngành", bg: "var(--As)", border: "var(--Ab)", color: "var(--A)" },
    SS: { label: "Sai sóng", bg: "var(--Rs)", border: "var(--Rb)", color: "var(--R)" },
  }[value];
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: full ? "100%" : undefined, maxWidth: "100%", minWidth: full ? 0 : 96, padding: "5px 10px", borderRadius: 7, background: meta.bg, border: `0.5px solid ${meta.border}`, color: meta.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>;
}

function SignalBadge({ value }) {
  const buy = value === "MUA";
  const sell = value === "BAN" || value === "BÁN";
  const tone = buy
    ? { bg: "var(--Gs)", border: "var(--Gb)", color: "var(--G)", label: "MUA" }
    : sell
      ? { bg: "var(--Rs)", border: "var(--Rb)", color: "var(--R)", label: "BÁN" }
      : { bg: "var(--As)", border: "var(--Ab)", color: "var(--A)", label: value || "—" };
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 58, padding: "5px 10px", borderRadius: 7, background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{tone.label}</span>;
}

function ScoreDonut({ dn, sn, ss, total, mobile }) {
  const { t } = useTheme();
  const size = mobile ? 88 : 118;
  const c = size / 2;
  const r = mobile ? 34 : 43;
  const stroke = mobile ? 12 : 15;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const items = [
    { key: "dn", value: dn, color: t.G },
    { key: "sn", value: sn, color: t.A },
    { key: "ss", value: ss, color: t.R },
  ];
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--elev)" strokeWidth={stroke} />
        {items.map((item) => {
          const len = total ? (item.value / total) * circ : 0;
          const node = <circle key={item.key} cx={c} cy={c} r={r} fill="none" stroke={item.color} strokeWidth={stroke} strokeDasharray={`${len} ${circ}`} strokeDashoffset={-offset} strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />;
          offset += len;
          return node;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: mobile ? 20 : 25, fontWeight: 900, color: "var(--t1)", lineHeight: 1, ...mono }}>{fmtNum(total)}</div>
        <div style={{ color: "var(--t4)", fontSize: 10, fontWeight: 700 }}>mã</div>
      </div>
    </div>
  );
}

function PortfolioInput({ input, setInput, codes, onAnalyze, loading, compact, dateLabel, mobile }) {
  const shellStyle = mobile
    ? { padding: compact ? "10px 12px" : "20px 16px 18px", borderRadius: compact ? 10 : 14 }
    : { padding: compact ? "15px 16px" : "32px 28px 26px", maxWidth: compact ? undefined : 520 };
  return (
    <Card style={{ width: "100%", ...shellStyle }}>
      <div style={{ display: compact && mobile ? "none" : "flex", alignItems: "center", gap: 8, marginBottom: 5, color: "var(--t1)", fontSize: compact ? 13 : 15, fontWeight: 800 }}>
        <i className="ti ti-clipboard-list" style={{ color: "var(--B)", fontSize: compact ? 15 : 18 }} />
        Nhập danh mục của bạn
      </div>
      <div style={{ display: compact && mobile ? "none" : "block", color: "var(--t3)", fontSize: compact ? 11 : 12, lineHeight: 1.7, marginBottom: compact ? 12 : 22 }}>
        Nhập tối đa {MAX_CODES} mã cổ phiếu, cách nhau bởi dấu phẩy.
        {!compact && <><br />Hệ thống kiểm tra SMDT ngành và mã, dòng tiền, tín hiệu từ StockTraders API.</>}
      </div>
      <div style={{ display: compact && mobile ? "flex" : "block", alignItems: "center", gap: 8 }}>
        <div style={{ minHeight: compact ? 36 : 46, display: "flex", alignItems: "center", gap: 8, background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: compact && mobile ? 8 : 9, padding: "0 13px", marginBottom: compact && mobile ? 0 : 8, flex: 1, minWidth: 0 }}>
          <i className="ti ti-writing" style={{ color: "var(--t3)", fontSize: 14, flexShrink: 0 }} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
            placeholder={compact ? "Thêm hoặc đổi mã..." : "VD: NVL, LPB, PC1, CII, PLX"}
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontSize: compact ? 13 : 13.5, padding: compact && mobile ? "8px 0" : "10px 0" }}
          />
          {input && <button type="button" onClick={() => setInput("")} style={{ border: "none", background: "transparent", color: "var(--t4)", cursor: "pointer", fontSize: 18 }}>×</button>}
        </div>
        {compact && mobile && (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={loading || !codes.length}
            style={{ minHeight: 36, border: "none", borderRadius: 8, background: "var(--B)", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: loading || !codes.length ? "not-allowed" : "pointer", opacity: loading || !codes.length ? 0.5 : 1, padding: "0 14px", flexShrink: 0 }}
          >
            {loading ? "..." : "Phân tích"}
          </button>
        )}
      </div>
      <div style={{ color: "var(--t3)", fontSize: 11, marginBottom: compact ? 10 : 22, display: compact && mobile ? "none" : "block" }}>
        {codes.length ? `${codes.length} mã đã nhập` : "Ví dụ: NVL, LPB, PC1, CII, PLX"}
      </div>
      {(!compact || !mobile) && (
        <button
          type="button"
          onClick={onAnalyze}
          disabled={loading || !codes.length}
          style={{ width: "100%", minHeight: compact ? 40 : 46, border: "none", borderRadius: 10, background: "var(--B)", color: "#fff", fontSize: compact ? 12.5 : 14, fontWeight: 800, cursor: loading || !codes.length ? "not-allowed" : "pointer", opacity: loading || !codes.length ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
        >
          <i className="ti ti-sparkles" />
          {loading ? "Đang phân tích..." : "Phân tích danh mục"}
        </button>
      )}
      <div style={{ display: compact && mobile ? "none" : "flex", alignItems: "center", gap: 5, marginTop: 10, color: "var(--t4)", fontSize: 10.5 }}>
        <i className="ti ti-clock" style={{ fontSize: 12 }} />
        Dữ liệu: StockTraders API · {dateLabel}
      </div>
    </Card>
  );
}

function OverviewPanel({ foundRows, dn, sn, ss, score, scoreName, mobile }) {
  const total = foundRows.length || 1;
  return (
    <Card style={{ padding: mobile ? 16 : "15px 16px", borderRadius: mobile ? 14 : 12, display: "flex", flexDirection: "column", gap: mobile ? 14 : 11 }}>
      <div style={{ color: "var(--t1)", fontSize: 13, fontWeight: 800 }}>Tổng quan danh mục</div>
      <div style={{ display: "flex", alignItems: "center", gap: mobile ? 14 : 16, flexWrap: mobile ? "nowrap" : "wrap" }}>
        <ScoreDonut dn={dn} sn={sn} ss={ss} total={foundRows.length} mobile={mobile} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: mobile ? 7 : 8 }}>
          {[
            { color: "var(--G)", label: "Đúng sóng, đúng ngành", count: dn },
            { color: "var(--A)", label: "Đúng sóng, sai ngành", count: sn },
            { color: "var(--R)", label: "Sai sóng", count: ss },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, color: "var(--t2)", fontSize: mobile ? 11 : 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
              <div style={{ color: "var(--t3)", fontSize: 11, whiteSpace: "nowrap" }}>{item.count} ({Math.round(pct(item.count, total))}%)</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: mobile ? 10 : 12, background: "var(--elev)", border: mobile ? "none" : "0.5px solid var(--bdr)", borderRadius: mobile ? 10 : 9, padding: mobile ? 12 : "11px 12px" }}>
        <div style={{ minWidth: mobile ? 72 : 78, textAlign: mobile ? "center" : "left" }}>
          <div style={{ color: "var(--t3)", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Điểm phù hợp</div>
          <div style={{ color: scoreName[1], fontSize: mobile ? 26 : 28, fontWeight: 900, lineHeight: 1, ...mono }}>{score}<span style={{ color: "var(--t3)", fontSize: 13 }}>/100</span></div>
          <div style={{ color: "var(--t3)", fontSize: 10, marginTop: 4 }}>{scoreName[0]}</div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--bdr)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: "linear-gradient(135deg,#A855F7,#F59E0B)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 0 10px rgba(168,85,247,.35)" }}>
              <i className="ti ti-sparkles" style={{ fontSize: 14 }} />
            </span>
            <div>
              <div style={{ color: "var(--B)", fontSize: 11, fontWeight: 900 }}>AI Nhận xét</div>
              <div style={{ color: "var(--t4)", fontSize: 9 }}>powered by StockTraders</div>
            </div>
          </div>
          <div style={{ color: "var(--t2)", fontSize: 11.5, lineHeight: 1.7, fontStyle: "italic", paddingLeft: 9, borderLeft: "2px solid var(--Bb)" }}>
            {getTip(dn, sn, ss, total)}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DetailTable({ rows, codes, dateLabel }) {
  const th = { padding: "9px 11px", background: "var(--elev)", borderBottom: "0.5px solid var(--bdr)", color: "var(--t3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" };
  const td = { padding: "10px 11px", borderBottom: "0.5px solid var(--bdrs)", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: 12 };
  return (
    <Card noPad>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 15px", borderBottom: "0.5px solid var(--bdr)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--t1)", fontSize: 13, fontWeight: 800 }}>
          <i className="ti ti-table-column" style={{ color: "var(--B)", fontSize: 15 }} />
          Phân tích chi tiết
        </div>
        <div style={{ color: "var(--t3)", fontSize: 11 }}>{codes.length} mã · Dữ liệu thật · {dateLabel}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1040, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Mã", "Tên công ty", "Giá đóng cửa", "+/-%", "SMDT ngành", "SMDT mã", "Dòng tiền mã", "Dòng tiền ngành", "Tín hiệu", "Tỷ trọng", "Đánh giá"].map((h, index) => (
                <th key={h} style={{ ...th, textAlign: index >= 2 && index <= 5 ? "right" : index > 5 ? "center" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (!row.found) {
                return (
                  <tr key={row.ticker}>
                    <td style={{ ...td, color: "var(--B)", fontSize: 13, fontWeight: 900 }}>{row.ticker}</td>
                    <td colSpan={10} style={{ ...td, color: "var(--t4)" }}>Không tìm thấy dữ liệu cho mã này trong các API hiện có.</td>
                  </tr>
                );
              }
              const c = changePct(row.tradePoint);
              return (
                <tr key={row.ticker}>
                  <td style={{ ...td, color: "var(--B)", fontSize: 13, fontWeight: 900 }}>{row.ticker}</td>
                  <td style={{ ...td, color: "var(--t3)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }} title={row.name}>{row.name}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--G)", fontWeight: 800, ...mono }}>{priceText(row.tradePoint)}</td>
                  <td style={{ ...td, textAlign: "right", color: c == null ? "var(--t4)" : c >= 0 ? "var(--G)" : "var(--R)", fontWeight: 800, ...mono }}>{c == null ? "—" : `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--t2)", ...mono }}>{Number.isFinite(row.branchSmdt) ? row.branchSmdt.toFixed(2) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--t2)", ...mono }}>{Number.isFinite(row.smdt) ? row.smdt.toFixed(2) : "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}><CfBadge sig={row.tickerSig} compact /></td>
                  <td style={{ ...td, textAlign: "center" }}><CfBadge sig={row.branchSig} compact /></td>
                  <td style={{ ...td, textAlign: "center" }}><SignalBadge value={row.signal} /></td>
                  <td style={{ ...td, textAlign: "center", color: "var(--t2)", ...mono }}>{row.weight}%</td>
                  <td style={{ ...td, textAlign: "center", paddingRight: 14 }}><EvalBadge value={row.evalKey} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DetailCards({ rows, codes, dateLabel, expanded, onToggle }) {
  return (
    <div>
      <div style={{ color: "var(--t3)", fontSize: 11, marginBottom: 10 }}>
        {codes.length} mã · Ấn vào mã để xem chi tiết · {dateLabel}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => {
          if (!row.found) {
            return (
              <div key={row.ticker} style={{ background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--B)", fontSize: 15, fontWeight: 900 }}>{row.ticker}</span>
                <span style={{ color: "var(--t4)", fontSize: 11 }}>Không tìm thấy dữ liệu.</span>
              </div>
            );
          }
          const c = changePct(row.tradePoint);
          const open = expanded === row.ticker;
          return (
            <div key={row.ticker} style={{ background: "var(--surf)", border: `0.5px solid ${open ? "var(--Bb)" : "var(--bdr)"}`, borderRadius: 12, overflow: "hidden", transition: "border-color .18s" }}>
              <button
                type="button"
                onClick={() => onToggle(row.ticker)}
                style={{ width: "100%", border: "none", background: "transparent", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left", color: "inherit" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, marginBottom: 3 }}>
                    <span style={{ color: "var(--B)", fontSize: 15, fontWeight: 900, ...mono }}>{row.ticker}</span>
                    <EvalBadge value={row.evalKey} />
                  </div>
                  <div style={{ color: "var(--t3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                  <div style={{ color: "var(--t4)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{row.industry || "Chưa rõ ngành"}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: "var(--G)", fontSize: 15, fontWeight: 900, ...mono }}>{priceText(row.tradePoint)}</div>
                  <div style={{ color: c == null ? "var(--t4)" : c >= 0 ? "var(--G)" : "var(--R)", fontSize: 12, fontWeight: 800, ...mono }}>{c == null ? "—" : `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`}</div>
                </div>
                <SignalBadge value={row.signal} />
                <i className="ti ti-chevron-down" style={{ color: "var(--t4)", fontSize: 15, flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s" }} />
              </button>

              {open && (
                <div style={{ borderTop: "0.5px solid var(--bdr)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <MetricBox label="SMDT Ngành" value={Number.isFinite(row.branchSmdt) ? row.branchSmdt.toFixed(2) : "—"} />
                    <MetricBox label="SMDT Mã" value={Number.isFinite(row.smdt) ? row.smdt.toFixed(2) : "—"} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <MetricBox label="Dòng tiền mã"><CfBadge sig={row.tickerSig} compact /></MetricBox>
                    <MetricBox label="Dòng tiền ngành"><CfBadge sig={row.branchSig} compact /></MetricBox>
                  </div>
                  <div style={{ background: "var(--elev)", borderRadius: 8, padding: "9px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ color: "var(--t3)", fontSize: 11 }}>Tỷ trọng nắm giữ</span>
                    <span style={{ color: "var(--t1)", fontSize: 14, fontWeight: 900, ...mono }}>{row.weight}%</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricBox({ label, value, children }) {
  return (
    <div style={{ background: "var(--elev)", borderRadius: 8, padding: "9px 11px", minWidth: 0 }}>
      <div style={{ color: "var(--t4)", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>{label}</div>
      {children || <div style={{ color: "var(--t1)", fontSize: 18, fontWeight: 900, ...mono }}>{value}</div>}
    </div>
  );
}

export function ModPhanTichDanhMuc() {
  const narrow = useNarrow();
  const saved = useMemo(loadSavedPortfolio, []);
  const [input, setInput] = useState(saved.input);
  const [analyzedCodes, setAnalyzedCodes] = useState(saved.analyzedCodes);
  const [loading, setLoading] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState(null);
  const smdtTicker = useSMDTTicker();
  const cashTicker = useCashFlowTicker();
  const smdtBranch = useSMDT();
  const cashBranch = useCashFlowBranch();
  const branchPath = useBranchPath();
  const totalTrade = useTotalTrade();
  const stockSignal = useStockSignal();

  const codes = useMemo(() => parseCodes(input), [input]);
  const datesDesc = useMemo(() => sortDatesDesc(smdtTicker.datesAsc), [smdtTicker.datesAsc]);
  const activeDate = datesDesc[0] || "";
  const activeDateValue = toDateInputValue(activeDate);
  const dateLabel = activeDate ? fmtFull(activeDate) : "—";
  const cashTickerDatesDesc = useMemo(() => sortDatesDesc(cashTicker.buckets.map((bucket) => bucket.date)), [cashTicker.buckets]);
  const cashTickerIndex = useMemo(() => findDateIndex(cashTickerDatesDesc, activeDateValue), [activeDateValue, cashTickerDatesDesc]);
  const cashBucketDate = cashTickerIndex >= 0 ? cashTickerDatesDesc[cashTickerIndex] : "";
  const cashBucket = useMemo(() => cashTicker.buckets.find((bucket) => toDateInputValue(bucket.date) === toDateInputValue(cashBucketDate)) || null, [cashBucketDate, cashTicker.buckets]);
  const cashByTicker = useMemo(() => new Map((cashBucket?.rows || []).map((row) => [row.ticker, row])), [cashBucket?.rows]);
  const smdtBranchDatesDesc = useMemo(() => sortDatesDesc(smdtBranch.datesAsc), [smdtBranch.datesAsc]);
  const cashBranchDatesDesc = useMemo(() => sortDatesDesc(cashBranch.datesAsc), [cashBranch.datesAsc]);
  const branchSmdtDate = smdtBranchDatesDesc[findDateIndex(smdtBranchDatesDesc, activeDateValue)] || "";
  const branchCashDate = cashBranchDatesDesc[findDateIndex(cashBranchDatesDesc, activeDateValue)] || "";
  const branchSmdtLookup = useMemo(() => makeIndustryLookup(smdtBranch.branches, smdtBranch.matrix, branchSmdtDate, (v) => (Number.isFinite(v) ? v : null)), [branchSmdtDate, smdtBranch.branches, smdtBranch.matrix]);
  const branchSigLookup = useMemo(() => makeIndustryLookup(cashBranch.branches, cashBranch.matrix, branchCashDate, contentToSig), [branchCashDate, cashBranch.branches, cashBranch.matrix]);
  const tickerNameByKey = useMemo(() => new Map(smdtTicker.tickers.map((tk) => [tk.key, tk.name || tk.key])), [smdtTicker.tickers]);

  const rows = useMemo(() => {
    const validCodes = analyzedCodes.length ? analyzedCodes : [];
    const foundCount = validCodes.filter((ticker) => Number.isFinite(smdtTicker.matrix[ticker]?.[activeDate])).length || 1;
    return validCodes.map((ticker) => {
      const smdt = smdtTicker.matrix[ticker]?.[activeDate];
      if (!Number.isFinite(smdt)) return { ticker, found: false };
      const industry = branchPath.tickerToBranch[ticker] || "";
      const cash = cashByTicker.get(ticker);
      const tickerSig = tickerContentToSig(cash?.content || "");
      const branchSig = lookupIndustry(branchSigLookup, industry);
      const branchSmdt = lookupIndustry(branchSmdtLookup, industry);
      const tradePoint = findTradePoint(totalTrade.matrix[ticker], activeDateValue);
      const stockSig = getStockSignalForDate(stockSignal.signalByTicker[ticker], activeDateValue);
      const apiSignal = stockSig?.signal || null;
      const apiWeight = Number.isFinite(stockSig?.hold) ? stockSig.hold : Number.isFinite(stockSig?.weight) ? stockSig.weight : null;
      const row = {
        ticker,
        found: true,
        name: tickerNameByKey.get(ticker) || ticker,
        industry,
        smdt,
        branchSmdt,
        tickerSig,
        branchSig,
        tradePoint,
        weight: apiWeight ?? Math.round(100 / foundCount),
        signalSource: apiSignal ? "api" : "fallback",
      };
      row.signal = apiSignal || calcSignal(row);
      row.evalKey = calcEval(row);
      return row;
    });
  }, [activeDate, activeDateValue, analyzedCodes, branchPath.tickerToBranch, branchSigLookup, branchSmdtLookup, cashByTicker, smdtTicker.matrix, stockSignal.signalByTicker, tickerNameByKey, totalTrade.matrix]);

  const foundRows = useMemo(() => rows.filter((row) => row.found), [rows]);
  const { dn, sn, ss, score } = useMemo(() => scoreCalc(foundRows), [foundRows]);
  const scoreName = scoreLabel(score);
  const hasBlockingLoad = smdtTicker.status === "loading" && !smdtTicker.datesAsc.length;

  useEffect(() => {
    savePortfolio(input, analyzedCodes);
  }, [analyzedCodes, input]);

  const analyze = () => {
    if (!codes.length) return;
    setLoading(true);
    window.setTimeout(() => {
      setAnalyzedCodes(codes);
      setExpandedTicker(null);
      setLoading(false);
    }, 180);
  };

  if (hasBlockingLoad) return <Banner>Đang tải dữ liệu phân tích danh mục...</Banner>;

  if (!analyzedCodes.length) {
    return (
      <div style={{ minHeight: narrow ? "auto" : "calc(100vh - 150px)", display: "flex", alignItems: "center", justifyContent: "center", padding: narrow ? "18px 0" : 0 }}>
        <PortfolioInput input={input} setInput={setInput} codes={codes} onAnalyze={analyze} loading={loading} dateLabel={dateLabel} mobile={narrow} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(smdtTicker.error || cashTicker.error || smdtBranch.error || cashBranch.error || totalTrade.error || branchPath.error || stockSignal.error) && (
        <Banner tone="error">Một số nguồn dữ liệu chưa tải được, kết quả có thể thiếu ô.</Banner>
      )}
      {narrow ? (
        <>
          <OverviewPanel foundRows={foundRows} dn={dn} sn={sn} ss={ss} score={score} scoreName={scoreName} mobile />
          <PortfolioInput input={input} setInput={setInput} codes={codes} onAnalyze={analyze} loading={loading} compact dateLabel={dateLabel} mobile />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(360px,1fr)", gap: 12 }}>
          <PortfolioInput input={input} setInput={setInput} codes={codes} onAnalyze={analyze} loading={loading} compact dateLabel={dateLabel} />
          <OverviewPanel foundRows={foundRows} dn={dn} sn={sn} ss={ss} score={score} scoreName={scoreName} />
        </div>
      )}
      {narrow ? (
        <DetailCards
          rows={rows}
          codes={analyzedCodes}
          dateLabel={dateLabel}
          expanded={expandedTicker}
          onToggle={(ticker) => setExpandedTicker((current) => (current === ticker ? null : ticker))}
        />
      ) : (
        <DetailTable rows={rows} codes={analyzedCodes} dateLabel={dateLabel} />
      )}
      <div style={{ color: "var(--t4)", fontSize: 11 }}>
        Tín hiệu và tỷ trọng lấy từ StockSignal API khi có dữ liệu; các mã thiếu tín hiệu tạm dùng suy luận từ SMDT và dòng tiền.
      </div>
    </div>
  );
}
