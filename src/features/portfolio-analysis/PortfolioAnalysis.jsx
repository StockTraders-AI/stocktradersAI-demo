import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme";
import { mono } from "../../styles/tokens";
import { useNarrow } from "../../app/useNarrow";
import { fmtFull, fmtNum, pct } from "../../app/formatters";
import { useSMDTTicker } from "../../data/useSMDTTicker";
import { useCashFlowTicker, tickerContentToSig } from "../../data/useCashFlowTicker";
import { CORE_BRANCHES, useSMDT } from "../../data/useSMDT";
import { useCashFlowBranch, contentToSig } from "../../data/useCashFlowBranch";
import { useBranchPath } from "../../data/useBranchPath";
import { useTotalTrade } from "../../data/useTotalTrade";
import { useRealtimeStockSignalFeed, useStockSignal } from "../../data/useStockSignal";
import { Banner, Card, Loading } from "../../components/ui";
import { CfBadge } from "../cash-flow-ticker/CfBadge";
import { PORTFOLIO_MAX_CODES, loadSavedPortfolio, parsePortfolioCodes, savePortfolioState, sortPortfolioCodes } from "./portfolioState";
import { FOUR_KEY_META, evaluateFourKey, fallbackEvalKey, scorePortfolio4Key, seriesFromMatrix } from "./stock4KeyEvaluator";

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

function findIndustryBranch(branches, industry) {
  if (!industry) return null;
  const targetAliases = aliasesOf(industry).map(normalizeName);
  return branches.find((branch) => {
    const branchAliases = [branch.key, branch.label, ...aliasesOf(branch.key), ...aliasesOf(branch.label)].map(normalizeName);
    return targetAliases.some((target) => branchAliases.includes(target));
  }) || null;
}

function isCoreSectorName(name) {
  const names = aliasesOf(name).map(normalizeName);
  return CORE_BRANCHES.some((branch) => {
    const branchNames = [branch.key, branch.label, ...aliasesOf(branch.key), ...aliasesOf(branch.label)].map(normalizeName);
    return names.some((item) => branchNames.includes(item));
  });
}

function findTradePoint(tradeRow, dateValue) {
  if (!tradeRow || !dateValue) return null;
  const dates = Object.keys(tradeRow).sort().reverse();
  const target = dates.find((date) => toDateInputValue(date) <= dateValue);
  return target ? tradeRow[target] : null;
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
  const branchOk = isPositiveSig(row.branchSig) && Number.isFinite(row.branchSmdt) && row.branchSmdt > 70;
  const tickerOk = isPositiveSig(row.tickerSig) && Number.isFinite(row.smdt) && row.smdt > 70;
  return fallbackEvalKey({ tickerOk, industryOk: branchOk });
}

function scoreLabel(score) {
  if (score >= 85) return ["Xuất sắc", "var(--G)"];
  if (score >= 70) return ["Tốt", "var(--G)"];
  if (score >= 55) return ["Trung bình khá", "var(--B)"];
  if (score >= 40) return ["Trung bình", "var(--A)"];
  return ["Cần cải thiện", "var(--R)"];
}

function getTip(dn, sn, ns, ss, total) {
  const pS = ss / total;
  const pSN = sn / total;
  const pNS = ns / total;
  const pD = dn / total;
  if (pS > 0.5) return "Phần lớn mã đang ngược sóng. Ưu tiên cắt giảm và tái cơ cấu sang ngành có dòng tiền đổ vào.";
  if (pSN > 0.4) return "Nhiều mã chưa thuộc ngành dẫn sóng. Cân nhắc chuyển dịch sang ngành có dòng tiền đổ vào mạnh hơn.";
  if (pNS > 0.35) return "Nhiều ngành đã thuận nhưng mã trong danh mục chưa xác nhận sóng. Theo dõi điểm kích hoạt trước khi tăng tỷ trọng.";
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
  const tradePoint = dateValue ? eligible.findLast((point) => toDateInputValue(point.date) === dateValue && (Number(point.trade) === 1 || Number(point.trade) === 2)) : latestHoldPoint;
  const trade = Number.isFinite(Number(tradePoint?.trade)) ? Number(tradePoint.trade) : null;
  const signal = trade === 1 ? "MUA" : trade === 2 ? "BAN" : "Nắm giữ";
  const hold = Number.isFinite(latestHoldPoint?.hold)
    ? latestHoldPoint.hold
    : Number.isFinite(latestHoldPoint?.weight)
      ? latestHoldPoint.weight
      : null;
  const percent = Number.isFinite(tradePoint?.percent) ? tradePoint.percent : null;
  const weight = Number.isFinite(hold) ? hold : percent;
  return { ...latestHoldPoint, signal, weight, hold, trade, tradePoint };
}

function EvalBadge({ value, full, title }) {
  const tone = {
    DS_DN: { bg: "var(--Gs)", border: "var(--Gb)", color: "var(--G)" },
    DS_SN: { bg: "var(--As)", border: "var(--Ab)", color: "var(--A)" },
    DN_SS: { bg: "var(--Bs)", border: "var(--Bb)", color: "var(--B)" },
    SS: { bg: "var(--Rs)", border: "var(--Rb)", color: "var(--R)" },
  }[value];
  const meta = FOUR_KEY_META[value];
  if (!meta || !tone) return <span style={{ color: "var(--t4)" }}>—</span>;
  return <span title={title} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: full ? "100%" : undefined, maxWidth: "100%", minWidth: full ? 0 : 96, padding: "5px 10px", borderRadius: 7, background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>;
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

function ScoreDonut({ dn, sn, ns, ss, total, mobile }) {
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
    { key: "ns", value: ns, color: t.B },
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

const PICKER_LEAD_THRESHOLD = 70;

function smdtBadgeStyle(value) {
  const strong = Number.isFinite(value) && value >= PICKER_LEAD_THRESHOLD;
  return {
    color: strong ? "var(--G)" : "var(--A)",
    background: strong ? "var(--Gs)" : "var(--As)",
    border: `0.5px solid ${strong ? "var(--Gb)" : "var(--Ab)"}`,
  };
}

function formatPickerSmdt(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "--";
}

function pickerSectorTag(sector) {
  if (!Number.isFinite(sector?.smdt)) return null;
  if (sector.isCore && sector.smdt >= PICKER_LEAD_THRESHOLD) return "DẪN SÓNG";
  if (!sector.isCore && sector.smdt > PICKER_LEAD_THRESHOLD) return "NGÀNH MẠNH";
  return null;
}

function PortfolioInput({ input, setInput, codes, onAnalyze, loading, compact, dateLabel, mobile, sectors = [] }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [leadOnly, setLeadOnly] = useState(false);
  const [activeSectorName, setActiveSectorName] = useState("");
  const shellStyle = mobile
    ? { padding: compact ? "12px 13px 14px" : "18px 16px", borderRadius: compact ? 12 : 14 }
    : { padding: compact ? "15px 16px" : "22px 24px", maxWidth: compact ? undefined : 600, borderRadius: 12 };
  const cleanSearch = normalizeName(search);
  const selected = new Set(codes);
  const visibleSectors = useMemo(() => {
    return sectors
      .filter((sector) => {
        if (leadOnly && (!Number.isFinite(sector.smdt) || sector.smdt < PICKER_LEAD_THRESHOLD)) return false;
        if (!cleanSearch) return true;
        return normalizeName(sector.name).includes(cleanSearch)
          || sector.stocks.some((stock) => normalizeName(`${stock.code} ${stock.name}`).includes(cleanSearch));
      })
      .sort((a, b) => (Number.isFinite(b.smdt) ? b.smdt : -1) - (Number.isFinite(a.smdt) ? a.smdt : -1) || a.name.localeCompare(b.name, "vi"));
  }, [cleanSearch, leadOnly, sectors]);
  const activeSector = visibleSectors.find((sector) => sector.name === activeSectorName) || visibleSectors[0] || null;
  const visibleStocks = useMemo(() => {
    if (!activeSector) return [];
    const sectorMatchesSearch = cleanSearch && normalizeName(activeSector.name).includes(cleanSearch);
    return [...activeSector.stocks]
      .filter((stock) => !cleanSearch || sectorMatchesSearch || normalizeName(`${stock.code} ${stock.name}`).includes(cleanSearch))
      .sort((a, b) => (Number.isFinite(b.smdt) ? b.smdt : -1) - (Number.isFinite(a.smdt) ? a.smdt : -1) || a.code.localeCompare(b.code));
  }, [activeSector, cleanSearch]);
  const strongToAdd = activeSector?.stocks.filter((stock) => Number.isFinite(stock.smdt) && stock.smdt >= PICKER_LEAD_THRESHOLD && !selected.has(stock.code)) || [];
  const isFull = codes.length >= PORTFOLIO_MAX_CODES;

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const setCodes = (nextCodes) => {
    const uniqueCodes = [...new Set(nextCodes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean))];
    setInput(sortPortfolioCodes(uniqueCodes).slice(0, PORTFOLIO_MAX_CODES).join(", "));
  };
  const removeCode = (code) => setCodes(codes.filter((item) => item !== code));
  const toggleCode = (code) => {
    if (selected.has(code)) {
      removeCode(code);
      return;
    }
    if (isFull) return;
    setCodes([...codes, code]);
  };
  const addStrong = () => {
    if (!strongToAdd.length || isFull) return;
    setCodes([...codes, ...strongToAdd.map((stock) => stock.code)]);
  };

  return (
    <>
      <Card style={{ width: "100%", ...shellStyle }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", background: "var(--Bs)", color: "var(--B)", flexShrink: 0 }}>
            <i className="ti ti-clipboard-check" style={{ fontSize: 14 }} />
          </span>
          <div style={{ color: "var(--t1)", fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}>
            Nhập danh mục của bạn
          </div>
        </div>
        <div style={{ color: "var(--t3)", fontSize: 11.5, margin: "0 0 14px 32px", lineHeight: 1.55 }}>
          Nhập tối đa {PORTFOLIO_MAX_CODES} mã cổ phiếu, hoặc chọn nhanh theo ngành.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 9, padding: "0 12px", minHeight: compact ? 40 : 44, transition: "border-color .15s" }}>
          <i className="ti ti-chart-line" style={{ color: "var(--t3)", fontSize: 15, flexShrink: 0 }} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
            placeholder="VD: VRE, NVL, HPG..."
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontSize: mobile ? 16 : 13.5, letterSpacing: 0, padding: "9px 0", fontFamily: "inherit" }}
          />
          {input && (
            <button type="button" onClick={() => setInput("")} title="Xóa hết" style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", color: "var(--t3)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <i className="ti ti-x" style={{ fontSize: 15 }} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "10px 2px 0", flexWrap: "wrap" }}>
          <span style={{ color: "var(--t3)", fontSize: 11 }}>
            <b style={{ color: "var(--B)", fontWeight: 800 }}>{codes.length}</b> / {PORTFOLIO_MAX_CODES} mã đã nhập
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", fontSize: 11, fontWeight: 750, padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
          >
            <i className="ti ti-plus" style={{ fontSize: 13 }} />
            Chọn theo ngành
          </button>
        </div>

        {!!codes.length && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {codes.map((code) => (
              <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 7, padding: "5px 7px 5px 9px", color: "var(--t1)", fontSize: 12 }}>
                <span style={{ fontWeight: 800, letterSpacing: 0, ...mono }}>{code}</span>
                <button type="button" onClick={() => removeCode(code)} title={`Xóa ${code}`} style={{ width: 18, height: 18, borderRadius: 5, border: "none", background: "rgba(255,255,255,.05)", color: "var(--t3)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <i className="ti ti-x" style={{ fontSize: 11 }} />
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onAnalyze}
          disabled={loading || !codes.length}
          style={{ width: "100%", minHeight: compact ? 40 : 46, marginTop: 14, border: "none", borderRadius: 10, background: "linear-gradient(135deg,#8B3FF0,#7C3AED)", color: "#fff", fontSize: compact ? 12.5 : 13.5, fontWeight: 800, cursor: loading || !codes.length ? "not-allowed" : "pointer", opacity: loading || !codes.length ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: codes.length ? "0 8px 22px -10px rgba(124,58,237,.55)" : "none", fontFamily: "inherit" }}
        >
          <i className="ti ti-sparkles" />
          {loading ? "Đang phân tích..." : "Phân tích danh mục"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, color: "var(--t4)", fontSize: 10.5 }}>
          <i className="ti ti-clock" style={{ fontSize: 12 }} />
          Dữ liệu: StockTraders API · {dateLabel}
        </div>
      </Card>

      {pickerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(4,6,10,.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: mobile ? 12 : 20, zIndex: 900 }} onClick={() => setPickerOpen(false)}>
          <div role="dialog" aria-label="Chọn mã theo ngành" onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 860, height: mobile ? "92dvh" : undefined, maxHeight: mobile ? "92dvh" : "88vh", background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px -20px rgba(0,0,0,.8)" }}>
            <div style={{ padding: mobile ? "15px 15px 13px" : "18px 20px 14px", borderBottom: "0.5px solid var(--bdr)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--Bs)", color: "var(--B)", flexShrink: 0 }}>
                  <i className="ti ti-filter" style={{ fontSize: 16 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0, color: "var(--t1)", fontSize: mobile ? 15 : 15.5, fontWeight: 800 }}>Chọn mã theo ngành</div>
                <button type="button" onClick={() => setPickerOpen(false)} title="Đóng" style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "rgba(255,255,255,.05)", color: "var(--t3)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <i className="ti ti-x" style={{ fontSize: 16 }} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 11, padding: "0 12px", minHeight: 44 }}>
                <i className="ti ti-search" style={{ color: "var(--t3)", fontSize: 16 }} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus={!mobile} placeholder="Tìm ngành hoặc mã cổ phiếu..." style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontFamily: "inherit", fontSize: mobile ? 16 : 13, padding: "10px 0" }} />
              </div>
              <button type="button" aria-pressed={leadOnly} onClick={() => setLeadOnly((value) => !value)} style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, border: "none", background: "transparent", color: leadOnly ? "var(--t1)" : "var(--t3)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                <span style={{ width: 46, height: 24, borderRadius: 999, background: leadOnly ? "var(--G)" : "var(--elev)", border: `0.5px solid ${leadOnly ? "var(--Gb)" : "var(--bdr)"}`, position: "relative", transition: ".18s", flexShrink: 0, boxShadow: leadOnly ? "0 0 0 3px var(--Gs)" : "inset 0 1px 2px rgba(0,0,0,.08)" }}>
                  <span style={{ position: "absolute", top: 5, left: leadOnly ? 7 : 20, color: leadOnly ? "#fff" : "var(--t4)", fontSize: 7, lineHeight: 1, fontWeight: 900, letterSpacing: ".04em", pointerEvents: "none" }}>{leadOnly ? "ON" : "OFF"}</span>
                  <span style={{ position: "absolute", top: 2, left: leadOnly ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: leadOnly ? "#fff" : "var(--surf)", border: "0.5px solid var(--bdr)", boxShadow: "0 2px 5px rgba(0,0,0,.18)", transition: ".18s" }} />
                </span>
                <span style={{ fontSize: 12 }}>Chỉ hiện ngành dẫn sóng (SMDT ≥ 70%)</span>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "300px 1fr", gridTemplateRows: mobile ? "minmax(116px, 34%) minmax(0, 1fr)" : undefined, minHeight: 0, flex: 1, overflow: "hidden" }}>
              <div style={{ overflowY: "auto", minHeight: 0, borderRight: mobile ? "none" : "0.5px solid var(--bdr)", borderBottom: mobile ? "0.5px solid var(--bdr)" : "none", padding: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--t4)", padding: "8px 10px 6px", fontWeight: 800 }}>Ngành · sắp theo SMDT</div>
                {!visibleSectors.length ? (
                  <div style={{ color: "var(--t4)", fontSize: 13, textAlign: "center", padding: "34px 16px" }}>Không có ngành phù hợp.</div>
                ) : visibleSectors.map((sector) => {
                  const selectedCount = sector.stocks.filter((stock) => selected.has(stock.code)).length;
                  const active = activeSector?.name === sector.name;
                  return (
                    <button key={sector.name} type="button" onClick={() => setActiveSectorName(sector.name)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 10, border: "none", background: active ? "var(--Bs)" : "transparent", color: "inherit", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ color: "var(--t1)", fontSize: 13, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sector.name}</span>
                          {pickerSectorTag(sector) && <span style={{ color: "var(--G)", background: "var(--Gs)", border: "0.5px solid var(--Gb)", borderRadius: 5, padding: "2px 6px", fontSize: 10, fontWeight: 850, flexShrink: 0 }}>{pickerSectorTag(sector)}</span>}
                        </span>
                        <span style={{ display: "block", color: "var(--t4)", fontSize: 11, marginTop: 1 }}>{sector.stocks.length} mã{selectedCount ? ` · đã chọn ${selectedCount}` : ""}</span>
                      </span>
                      <span style={{ ...smdtBadgeStyle(sector.smdt), fontSize: 11.5, fontWeight: 800, padding: "3px 8px", borderRadius: 7, flexShrink: 0, ...mono }}>{formatPickerSmdt(sector.smdt)}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ overflowY: "auto", minHeight: 0, padding: mobile ? "8px 8px 16px" : "8px 8px 8px 4px", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px 10px", gap: 10 }}>
                  <div style={{ color: "var(--t1)", fontSize: 13, fontWeight: 750 }}>
                    {activeSector ? activeSector.name : "Chọn một ngành"}
                    {activeSector && <small style={{ color: "var(--t3)", fontWeight: 500, marginLeft: 6 }}>SMDT {formatPickerSmdt(activeSector.smdt)}</small>}
                  </div>
                  <button type="button" onClick={addStrong} disabled={!strongToAdd.length || isFull} style={{ background: "var(--Gs)", border: "0.5px solid var(--Gb)", color: "var(--G)", fontSize: 11, fontWeight: 750, padding: "6px 10px", borderRadius: 8, cursor: strongToAdd.length && !isFull ? "pointer" : "not-allowed", whiteSpace: "nowrap", opacity: strongToAdd.length && !isFull ? 1 : 0.35, fontFamily: "inherit" }}>
                    Thêm {strongToAdd.length} mã mạnh
                  </button>
                </div>
                {!activeSector ? (
                  <div style={{ color: "var(--t4)", fontSize: 13, textAlign: "center", padding: "40px 20px" }}>Chọn một ngành ở cột bên trái để xem danh sách mã.</div>
                ) : !visibleStocks.length ? (
                  <div style={{ color: "var(--t4)", fontSize: 13, textAlign: "center", padding: "40px 20px" }}>Không có mã phù hợp.</div>
                ) : visibleStocks.map((stock) => {
                  const added = selected.has(stock.code);
                  const disabled = !added && isFull;
                  return (
                    <div key={stock.code} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) auto 30px", alignItems: "center", gap: 12, padding: "9px 11px", borderRadius: 10, minWidth: 0 }}>
                      <span style={{ width: 52, flexShrink: 0, color: "var(--t1)", fontWeight: 800, fontSize: 13, letterSpacing: 0, ...mono }}>{stock.code}</span>
                      <span style={{ flex: 1, minWidth: 0, color: "var(--t3)", fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stock.name}</span>
                      <span style={{ ...smdtBadgeStyle(stock.smdt), fontSize: 11.5, fontWeight: 800, padding: "3px 8px", borderRadius: 7, flexShrink: 0, ...mono }}>{formatPickerSmdt(stock.smdt)}</span>
                      <button type="button" onClick={() => toggleCode(stock.code)} disabled={disabled} title={added ? `Bỏ ${stock.code}` : `Thêm ${stock.code}`} style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${added ? "var(--Gb)" : "var(--bdr)"}`, background: added ? "var(--G)" : "var(--elev)", color: added ? "#04240f" : "var(--B)", cursor: disabled ? "not-allowed" : "pointer", display: "grid", placeItems: "center", opacity: disabled ? 0.3 : 1, flexShrink: 0 }}>
                        <i className={`ti ${added ? "ti-check" : "ti-plus"}`} style={{ fontSize: 15 }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: mobile ? "12px 15px calc(12px + env(safe-area-inset-bottom, 0px))" : "14px 20px", borderTop: "0.5px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0, background: "var(--surf)", position: "relative", zIndex: 1 }}>
              <span style={{ color: isFull ? "var(--A)" : "var(--t3)", fontSize: 12 }}>Đã chọn <b style={{ color: isFull ? "var(--A)" : "var(--B)" }}>{codes.length}</b> / {PORTFOLIO_MAX_CODES} mã</span>
              <button type="button" onClick={() => setPickerOpen(false)} style={{ background: "var(--B)", border: "none", color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "9px 22px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>Xong</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OverviewPanel({ foundRows, dn, sn, ns, ss, score, scoreName, mobile }) {
  const total = foundRows.length || 1;
  return (
    <Card style={{ padding: mobile ? 16 : "15px 16px", borderRadius: mobile ? 14 : 12, display: "flex", flexDirection: "column", gap: mobile ? 14 : 11 }}>
      <div style={{ color: "var(--t1)", fontSize: 13, fontWeight: 800 }}>Tổng quan danh mục</div>
      <div style={{ display: "flex", alignItems: "center", gap: mobile ? 14 : 16, flexWrap: mobile ? "nowrap" : "wrap" }}>
        <ScoreDonut dn={dn} sn={sn} ns={ns} ss={ss} total={foundRows.length} mobile={mobile} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: mobile ? 7 : 8 }}>
          {[
            { color: "var(--G)", label: FOUR_KEY_META.DS_DN.label, count: dn },
            { color: "var(--A)", label: FOUR_KEY_META.DS_SN.label, count: sn },
            { color: "var(--B)", label: FOUR_KEY_META.DN_SS.label, count: ns },
            { color: "var(--R)", label: FOUR_KEY_META.SS.label, count: ss },
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
            {getTip(dn, sn, ns, ss, total)}
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
                  <td style={{ ...td, textAlign: "center", paddingRight: 14 }}><EvalBadge value={row.evalKey} title={row.evalReason} /></td>
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
                    <EvalBadge value={row.evalKey} title={row.evalReason} />
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
  useRealtimeStockSignalFeed(stockSignal.applyTick);

  const codes = useMemo(() => parsePortfolioCodes(input), [input]);
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
  const sectorPickerData = useMemo(() => {
    const byIndustry = new Map();
    for (const tk of smdtTicker.tickers) {
      const code = tk.key;
      const smdt = smdtTicker.matrix[code]?.[activeDate];
      const industry = branchPath.tickerToBranch[code] || "";
      if (!code || !industry || !Number.isFinite(smdt)) continue;
      const key = normalizeName(industry);
      if (!byIndustry.has(key)) {
        byIndustry.set(key, {
          name: industry,
          smdt: lookupIndustry(branchSmdtLookup, industry),
          isCore: isCoreSectorName(industry),
          stocks: [],
        });
      }
      byIndustry.get(key).stocks.push({
        code,
        name: tk.name || code,
        smdt,
      });
    }

    return [...byIndustry.values()]
      .map((sector) => ({
        ...sector,
        stocks: sector.stocks.sort((a, b) => b.smdt - a.smdt || a.code.localeCompare(b.code)),
      }))
      .sort((a, b) => (Number.isFinite(b.smdt) ? b.smdt : -1) - (Number.isFinite(a.smdt) ? a.smdt : -1) || a.name.localeCompare(b.name, "vi"));
  }, [activeDate, branchPath.tickerToBranch, branchSmdtLookup, smdtTicker.matrix, smdtTicker.tickers]);

  const rows = useMemo(() => {
    const validCodes = analyzedCodes.length ? sortPortfolioCodes(analyzedCodes) : [];
    const foundCount = validCodes.filter((ticker) => Number.isFinite(smdtTicker.matrix[ticker]?.[activeDate])).length || 1;
    return validCodes.map((ticker) => {
      const smdt = smdtTicker.matrix[ticker]?.[activeDate];
      if (!Number.isFinite(smdt)) return { ticker, found: false };
      const industry = branchPath.tickerToBranch[ticker] || "";
      const cash = cashByTicker.get(ticker);
      const tickerSig = tickerContentToSig(cash?.content || "");
      const branchSig = lookupIndustry(branchSigLookup, industry);
      const branchSmdt = lookupIndustry(branchSmdtLookup, industry);
      const branch = findIndustryBranch(smdtBranch.branches, industry);
      const fourKey = evaluateFourKey({
        ticker,
        industry,
        date: activeDate,
        tickerSeries: seriesFromMatrix(smdtTicker.matrix, smdtTicker.datesAsc, ticker, activeDate),
        industrySeries: branch ? seriesFromMatrix(smdtBranch.matrix, smdtBranch.datesAsc, branch.key, branchSmdtDate || activeDate) : [],
      });
      const tradePoint = findTradePoint(totalTrade.matrix[ticker], activeDateValue);
      const stockSig = getStockSignalForDate(stockSignal.signalByTicker[ticker], activeDateValue);
      const apiSignal = stockSig?.signal || null;
      const apiWeight = Number.isFinite(stockSig?.weight) ? stockSig.weight : Number.isFinite(stockSig?.hold) ? stockSig.hold : null;
      const row = {
        ticker,
        found: true,
        name: tickerNameByKey.get(ticker) || ticker,
        industry,
        smdt,
        branchSmdt,
        tickerMomentum: fourKey?.tickerMomentum || null,
        branchMomentum: fourKey?.industryMomentum || null,
        fourKey,
        tickerSig,
        branchSig,
        tradePoint,
        weight: apiWeight ?? Math.round(100 / foundCount),
        signalSource: apiSignal ? "api" : "fallback",
      };
      row.signal = apiSignal || calcSignal(row);
      row.evalKey = fourKey?.evalKey || calcEval(row);
      row.evalReason = fourKey?.reason || "Thiếu lịch sử 3 phiên, tạm suy luận từ SMDT hiện tại và dòng tiền";
      return row;
    });
  }, [activeDate, activeDateValue, analyzedCodes, branchPath.tickerToBranch, branchSigLookup, branchSmdtDate, branchSmdtLookup, cashByTicker, smdtBranch.branches, smdtBranch.datesAsc, smdtBranch.matrix, smdtTicker.datesAsc, smdtTicker.matrix, stockSignal.signalByTicker, tickerNameByKey, totalTrade.matrix]);

  const foundRows = useMemo(() => rows.filter((row) => row.found), [rows]);
  const { dn, sn, ns, ss, score } = useMemo(() => scorePortfolio4Key(foundRows), [foundRows]);
  const scoreName = scoreLabel(score);
  const hasBlockingLoad = smdtTicker.status === "loading" && !smdtTicker.datesAsc.length;

  useEffect(() => {
    savePortfolioState(input, analyzedCodes);
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

  if (hasBlockingLoad) return <Loading label="Đang tải dữ liệu phân tích danh mục…" />;

  if (!analyzedCodes.length) {
    return (
      <div style={{ minHeight: narrow ? "auto" : "calc(100vh - 150px)", display: "flex", alignItems: "center", justifyContent: "center", padding: narrow ? "18px 0" : 0 }}>
        <PortfolioInput input={input} setInput={setInput} codes={codes} onAnalyze={analyze} loading={loading} dateLabel={dateLabel} mobile={narrow} sectors={sectorPickerData} />
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
          <OverviewPanel foundRows={foundRows} dn={dn} sn={sn} ns={ns} ss={ss} score={score} scoreName={scoreName} mobile />
          <PortfolioInput input={input} setInput={setInput} codes={codes} onAnalyze={analyze} loading={loading} compact dateLabel={dateLabel} mobile sectors={sectorPickerData} />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(360px,1fr)", gap: 12 }}>
          <PortfolioInput input={input} setInput={setInput} codes={codes} onAnalyze={analyze} loading={loading} compact dateLabel={dateLabel} sectors={sectorPickerData} />
          <OverviewPanel foundRows={foundRows} dn={dn} sn={sn} ns={ns} ss={ss} score={score} scoreName={scoreName} />
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
        Tính năng được vận hành bởi công nghệ AI độc quyền của StockTraders AI, phân tích sức mạnh dòng tiền (SMDT) của mã và ngành để đưa ra góc nhìn khách quan. Dữ liệu cập nhật liên tục theo thị trường.
      </div>
    </div>
  );
}
