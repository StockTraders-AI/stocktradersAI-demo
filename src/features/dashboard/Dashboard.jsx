import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../theme";
import { mono, sigStyle } from "../../styles/tokens";
import { useNarrow } from "../../app/useNarrow";
import { fmtFull, fmtNum } from "../../app/formatters";
import { formatTimeOfDay } from "../../app/dateUtils";
import { CORE_BRANCHES, useSMDT, useRealtimeFeed as useRealtimeSMDTBranchFeed } from "../../data/useSMDT";
import { useCashFlowBranch, useRealtimeCashFlowFeed, contentToSig } from "../../data/useCashFlowBranch";
import { useSMDTTicker, useRealtimeSMDTTickerFeed } from "../../data/useSMDTTicker";
import { useCashFlowTicker, useRealtimeCashFlowTickerFeed, tickerContentToSig } from "../../data/useCashFlowTicker";
import { useBranchPath } from "../../data/useBranchPath";
import { useRealtimeSMDTBranchCrossFeed, useSMDTBranchCross } from "../../data/useSMDTCross";
import { useRealtimeStockSignalFeed, useStockSignal } from "../../data/useStockSignal";
import { useRealtimeStockNotiFeed, useStockNoti } from "../../data/useStockNoti";
import { useStockWave, useRealtimeStockWaveFeed } from "../../data/useStockWave";
import { useMarketStockWave } from "../../data/useMarketStockWave";
import { useTotalTrade } from "../../data/useTotalTrade";
import { fetchDataPostWithClientCache } from "../../data/requestCache";
import { Card, Clink, LiveFooter, Loading, Pagination } from "../../components/ui";
import { PORTFOLIO_MAX_CODES, loadSavedPortfolio, parsePortfolioCodes, savePortfolioState } from "../portfolio-analysis/portfolioState";
import { evaluateFourKey, fallbackEvalKey, scorePortfolio4Key, seriesFromMatrix } from "../portfolio-analysis/stock4KeyEvaluator";
import { isCashFlowCoreIndustry } from "../cash-flow-ticker/cashFlowUtils";
import CardDoSong from "./CardDoSong";
import PortfolioChatPanel, { PortfolioAiLoadingStyles } from "./PortfolioChatPanel";
import "./wave-detector-donut.css";

const SIG_ORDER = ["sn", "si", "so", "st"];
const CORE_KEYS = new Set(CORE_BRANCHES.map((b) => b.key));
const CORE_LABELS = new Set(CORE_BRANCHES.flatMap((b) => [b.key, b.label]));
const TOP_LIMIT = 40;
const PAGE_SIZE = 8;
const SMDT_PREVIEW_PAGE_SIZE = 10;
const SIGNAL_PORTFOLIO_PAGE_SIZE = 5;
const PORTFOLIO_CHAT_API_URL = "/api/portfolio-chat";
const TOP_STATUS_META = {
  vm: { label: "Vừa mạnh", color: "var(--G)", icon: "ti-star-filled" },
  dt: { label: "Duy trì", color: "var(--B)", icon: "ti-circle-filled" },
  tn: { label: "Tiềm năng", color: "var(--A)", icon: "ti-bulb" },
};
const INDUSTRY_ALIAS_GROUPS = [
  ["Môi giới chứng khoán", "Chứng khoán"],
  ["Ngân hàng thương mại truyền thống", "Ngân hàng"],
  ["Bất động sản dân cư", "BĐS Dân cư", "BĐS dân cư", "Bất động sản Dân cư", "Bất động sản"],
  ["Sản xuất, chế biến thép", "Thép"],
  ["Sóng ngành Vin", "Sóng Vin", "Vin", "Vingroup"],
  ["Xây dựng"],
  ["Sản xuất và Khai thác dầu khí", "Dầu khí"],
];
const WAVE_CORE_BRANCH_NAMES = ["Ngân hàng", "Chứng khoán", "Thép", "BĐS Dân cư", "Xây dựng", "Sóng ngành Vin"];
const DONUT_COLORS = {
  si: "#0ca30c",
  sn: "#1baf7a",
  so: "#eda100",
  st: "#e34948",
  waitBuy: "#1baf7a",
  buy: "#0ca30c",
  waitSell: "#eda100",
  sell: "#e34948",
};
function nav(id) {
  window.dispatchEvent(new CustomEvent("st-nav", { detail: id }));
}

function topDate(datesAsc) {
  return datesAsc[datesAsc.length - 1] || "";
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

function findBucketByDate(buckets, date) {
  const value = toDateInputValue(date);
  if (!value) return null;
  return buckets.find((bucket) => toDateInputValue(bucket.date) === value) || null;
}

function findLatestValueAtOrBefore(row, datesDesc, dateValue) {
  if (!row || !dateValue) return null;
  const startIndex = findDateIndex(datesDesc, dateValue);
  if (startIndex < 0) return null;
  for (let index = startIndex; index < datesDesc.length; index += 1) {
    const value = row[datesDesc[index]];
    if (value != null) return value;
  }
  return null;
}

function apiNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestUpdatedAt(...items) {
  return items.filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeIndustryName(name) {
  return String(name || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function aliasesOfIndustry(name) {
  const normalized = normalizeIndustryName(name);
  const group = INDUSTRY_ALIAS_GROUPS.find((items) => items.some((item) => normalizeIndustryName(item) === normalized));
  return group || [name];
}

function setIndustryLookup(map, name, value) {
  for (const alias of aliasesOfIndustry(name)) map.set(normalizeIndustryName(alias), value);
}

function lookupIndustryValue(map, name) {
  for (const alias of aliasesOfIndustry(name)) {
    const value = map.get(normalizeIndustryName(alias));
    if (value != null) return value;
  }
  return map.get(normalizeIndustryName(name));
}

function findIndustryBranch(branches, industry) {
  if (!industry) return null;
  const targetAliases = aliasesOfIndustry(industry).map(normalizeIndustryName);
  return branches.find((branch) => {
    const branchAliases = [branch.key, branch.label, ...aliasesOfIndustry(branch.key), ...aliasesOfIndustry(branch.label)].map(normalizeIndustryName);
    return targetAliases.some((target) => branchAliases.includes(target));
  }) || null;
}

function sigWeight(sig) {
  return { si: 3, sn: 1.6, so: -1.1, st: -2.4 }[sig] || 0;
}

function isPositiveSig(sig) {
  return sig === "si" || sig === "sn";
}

function classifyStrongTicker(smdt, prevSmdt, prev2Smdt, tickerSig, branchSmdt, branchSig) {
  const hasPrev = Number.isFinite(prevSmdt);
  const momentum = Number.isFinite(prevSmdt) ? smdt - prevSmdt : 0;
  const prevMomentum = Number.isFinite(prevSmdt) && Number.isFinite(prev2Smdt) ? prevSmdt - prev2Smdt : 0;
  const crossedStrong = hasPrev && prevSmdt < 70 && smdt > 70;

  if (crossedStrong) return "vm";
  if (smdt >= 70) return "dt";

  const rising = momentum > 0;
  const risingTwoSessions = momentum > 0 && prevMomentum > 0;
  const tickerFlowSupported = isPositiveSig(tickerSig) && (smdt >= 45 || rising);
  const branchFlowSupported = Number.isFinite(branchSmdt) && branchSmdt >= 70 && isPositiveSig(branchSig) && smdt >= 45;
  if ((smdt >= 50 && rising) || risingTwoSessions || tickerFlowSupported || branchFlowSupported) return "tn";

  return null;
}

function sigLabel(sig) {
  return { si: "Đổ vào", sn: "Nhen nhóm", so: "Đang thoát", st: "Thoát ra" }[sig] || "—";
}

function strongStatusLabel(status) {
  return TOP_STATUS_META[status]?.label || "—";
}

function TopStatusBadge({ status, compact = false }) {
  const meta = TOP_STATUS_META[status] || TOP_STATUS_META.tn;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: compact ? 3 : 5, minWidth: compact ? 0 : 72, color: meta.color, fontSize: compact ? 9 : 10, fontWeight: 800, whiteSpace: "nowrap" }}>
      <i className={`ti ${meta.icon}`} style={{ fontSize: compact ? 10 : 11 }} />
      {meta.label}
    </span>
  );
}

function signalToSig(signal) {
  if (signal === "MUA") return "si";
  if (signal === "BAN") return "st";
  return null;
}

function tradeToSignal(trade) {
  const value = Number(trade);
  if (value === 1) return "MUA";
  if (value === 2) return "BAN";
  return null;
}

function getStockSignalRowForDate(row, date) {
  const points = Array.isArray(row?.points) ? row.points : [];
  const dateValue = toDateInputValue(date);
  if (!points.length) return row;

  const eligible = points.filter((point) => !dateValue || toDateInputValue(point.date) <= dateValue);
  const latestPoint = eligible[eligible.length - 1] || points[points.length - 1] || row;
  const dayPoint = dateValue
    ? eligible.findLast((point) => toDateInputValue(point.date) === dateValue)
    : latestPoint;
  const hold = toNumber(latestPoint?.hold ?? latestPoint?.weight ?? row?.hold ?? row?.weight);
  const percent = toNumber(dayPoint?.percent ?? latestPoint?.percent ?? row?.percent);
  const pointSignal = dayPoint?.signal === "MUA" || dayPoint?.signal === "BAN" ? dayPoint.signal : null;
  const signal = tradeToSignal(dayPoint?.trade) || pointSignal || "Nắm giữ";

  return {
    ...row,
    ...latestPoint,
    ...(dayPoint || {}),
    date: dayPoint?.date || latestPoint?.date || row.date,
    signal,
    weight: Number.isFinite(hold) ? hold : percent,
    hold,
    percent,
  };
}

function isCoreBranchName(name) {
  return aliasesOfIndustry(name).some((alias) => CORE_LABELS.has(alias));
}

function isResidentialRealEstateServiceName(name) {
  const normalized = normalizeIndustryName(name);
  return normalized.includes("dịch vụ") && (normalized.includes("bđs dân cư") || (normalized.includes("bất động sản") && normalized.includes("dân cư")));
}

function waveCoreOrderOfIndustry(name) {
  const names = aliasesOfIndustry(name).map(normalizeIndustryName);
  return WAVE_CORE_BRANCH_NAMES.findIndex((key) => aliasesOfIndustry(key).some((alias) => names.includes(normalizeIndustryName(alias))));
}

function getLatestTrade(totalTrade, ticker, date) {
  const row = totalTrade.matrix[ticker] || {};
  const dates = Object.keys(row).sort();
  const dateValue = toDateInputValue(date);
  const targetDate = dateValue
    ? dates.findLast((item) => toDateInputValue(item) <= dateValue)
    : dates.at(-1);
  return targetDate ? row[targetDate] : null;
}

function EmptyHint({ children }) {
  if (!children) return <Loading label="Đang tải dữ liệu…" rows={2} pillHeight={38} style={{ margin: "4px 0 6px" }} />;
  return <div style={{ padding: 18, textAlign: "center", color: "var(--t3)", fontSize: 11 }}>{children}</div>;
}

function DashHeader({ title, meta, action, onClick, rightExtra }) {
  return (
    <div style={{ width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>{title}</div>
        {meta && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        {rightExtra}
        {action && <Clink onClick={onClick}>{action}</Clink>}
      </div>
    </div>
  );
}

function DotLegend({ items, square }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
      {items.map((item) => (
        <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--t2)", whiteSpace: "nowrap" }}>
          <span style={{ width: 7, height: 7, borderRadius: square ? 2 : 999, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function Donut({ items, size = 180, badges = true }) {
  const cx = 110;
  const cy = 110;
  const r = 95;
  const gap = 5;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const totalDeg = 360 - items.length * gap;
  let cur = 0;

  const xy = (deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const arc = (start, end) => {
    const p = xy(start);
    const q = xy(end);
    return `M${p.x.toFixed(2)} ${p.y.toFixed(2)}A${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
  };

  const segs = items.map((item) => {
    if (!total || !item.value) {
      cur += gap;
      return null;
    }
    const span = (item.value / total) * totalDeg;
    const start = cur + gap / 2;
    const end = start + span;
    cur += span + gap;
    return { ...item, start, end, mid: (start + end) / 2, span };
  });

  return (
    <svg viewBox="0 0 220 220" width="100%" style={{ maxWidth: size, display: "block" }}>
      <circle cx={cx} cy={cy} r={r} fill="var(--elev)" stroke="var(--bdr)" strokeWidth="0.5" />
      {segs.map((seg, index) => seg && <path key={index} d={arc(seg.start, seg.end)} stroke={seg.color} strokeWidth="22" fill="none" strokeLinecap="round" />)}
      <circle cx={cx} cy={cy} r="57" fill="var(--surf)" stroke="var(--bdr)" strokeWidth="0.5" />
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="26" fontWeight="750" fill="var(--t1)" style={mono}>{fmtNum(total)}</text>
      {badges && segs.map((seg, index) => {
        if (!seg || seg.span <= 15) return null;
        const p = xy(seg.mid);
        const bx = Math.max(17, Math.min(203, p.x));
        const by = Math.max(17, Math.min(203, p.y));
        const fs = seg.value >= 100 ? 10 : seg.value >= 10 ? 13 : 15;
        return (
          <g key={`badge-${index}`}>
            <circle cx={bx.toFixed(1)} cy={by.toFixed(1)} r="15" fill={seg.color} />
            <text x={bx.toFixed(1)} y={(by + 5).toFixed(1)} textAnchor="middle" fontSize={fs} fontWeight="600" fill="#fff" style={mono}>{seg.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutLoading({ size = 180 }) {
  return (
    <div
      className="wtds-dashboard-donut-loading"
      aria-label="Đang tải dữ liệu"
      role="status"
      style={{ "--wtds-donut-size": `${size}px` }}
    >
      <div className="wtds-donut-sk wtds-sk" />
      <div className="wtds-donut-center">
        <span className="wtds-sk wtds-sk-pill wtds-center-value-sk" />
      </div>
    </div>
  );
}

function SplitDonuts({ leftTitle, rightTitle, leftItems, rightItems, loading = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", width: "100%", gap: 8 }}>
      <MiniDonut title={leftTitle} items={leftItems} loading={loading} />
      <div style={{ width: 1, background: "var(--bdr)", height: 100 }} />
      <MiniDonut title={rightTitle} items={rightItems} loading={loading} />
    </div>
  );
}

function MiniDonut({ title, items, loading = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)" }}>{title}</div>
      {loading ? <DonutLoading size={130} /> : <Donut items={items} size={130} />}
    </div>
  );
}

function DashboardCard({ children, onClick, style }) {
  return (
    <Card
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        cursor: onClick ? "pointer" : undefined,
        minWidth: 0,
        ...style,
      }}
    >
      <div onClick={onClick} style={{ width: "100%", display: "contents" }}>{children}</div>
    </Card>
  );
}

function smdtBadgeTone(value) {
  if (value >= 100) return { color: "#22C55E", bg: "rgba(34,197,94,.12)", border: "rgba(34,197,94,.45)", label: ">=100%" };
  if (value >= 70) return { color: "#10B981", bg: "rgba(16,185,129,.10)", border: "rgba(16,185,129,.38)", label: ">=70%" };
  if (value >= 30) return { color: "#F59E0B", bg: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.38)", label: ">=30%" };
  return { color: "#64748B", bg: "rgba(100,116,139,.10)", border: "rgba(100,116,139,.35)", label: "<30%" };
}

function SmdtScoreBadge({ value }) {
  if (!Number.isFinite(value)) return <span style={{ color: "var(--t4)" }}>—</span>;
  const tone = smdtBadgeTone(value);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 58, height: 25, padding: "0 8px", borderRadius: 8, border: `0.5px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", ...mono }}>
      {value.toFixed(1)}
    </span>
  );
}

function PriceText({ value }) {
  const price = toNumber(value);
  return (
    <span style={{ flexShrink: 0, minWidth: 54, textAlign: "right", color: "var(--t1)", fontSize: 11, fontWeight: 650, whiteSpace: "nowrap", ...mono }}>
      {Number.isFinite(price) ? fmtNum(price) : "—"}
    </span>
  );
}

function SmdtPreviewLegend() {
  return (
    <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap", paddingTop: 7, marginTop: 2, borderTop: "0.5px solid var(--bdr)" }}>
      {[100, 70, 30, -Infinity].map((value) => {
        const tone = smdtBadgeTone(value);
        return (
          <span key={tone.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--t3)", fontSize: 10, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: tone.color }} />
            {tone.label}
          </span>
        );
      })}
    </div>
  );
}

function SmdtPreview({ title, meta, leftRows, rightRows, defaultTab = "core", navId, showPrice = false, rowNameColor = "var(--t1)", leftLabel = "Chủ lực", rightLabel = "Ngành phụ", showTabs = true }) {
  const [tab, setTab] = useState(defaultTab);
  const [page, setPage] = useState(1);
  const rows = tab === "core" ? leftRows : rightRows;
  const totalPages = Math.max(1, Math.ceil(rows.length / SMDT_PREVIEW_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = rows.slice((safePage - 1) * SMDT_PREVIEW_PAGE_SIZE, safePage * SMDT_PREVIEW_PAGE_SIZE);
  const displayRows = visibleRows.length ? [...visibleRows, ...Array.from({ length: Math.max(0, SMDT_PREVIEW_PAGE_SIZE - visibleRows.length) }, (_, index) => ({ key: `placeholder-${index}`, placeholder: true }))] : [];
  const switchTab = (nextTab, event) => {
    event.stopPropagation();
    setTab(nextTab);
    setPage(1);
  };

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <Card style={{ padding: "15px 16px", display: "flex", flexDirection: "column", gap: 7, cursor: "pointer", minWidth: 0, alignSelf: "start" }} onClick={() => nav(navId)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>{title}</h3>
          {meta && <div style={{ marginTop: 2, fontSize: 10, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", marginLeft: "auto" }}>
          {showTabs && (
            <>
              <ChipButton active={tab === "core"} onClick={(event) => switchTab("core", event)}>
                ⭐ {leftLabel}
              </ChipButton>
              <ChipButton active={tab === "other"} onClick={(event) => switchTab("other", event)}>
                {rightLabel}
              </ChipButton>
            </>
          )}
          <Clink onClick={() => nav(navId)}>Chi tiết ›</Clink>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", columnGap: 18, alignContent: "start" }}>
        {displayRows.length ? displayRows.map((row) => (
          <div key={row.key} aria-hidden={row.placeholder || undefined} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, minHeight: 36, padding: "2px 0", borderBottom: `0.5px solid ${row.placeholder ? "transparent" : "var(--bdr)"}` }}>
            {!row.placeholder && (
              <>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: rowNameColor, fontSize: 11, fontWeight: 700 }}>
                  {row.name}
                </span>
                {showPrice && <PriceText value={row.price} />}
                <SmdtScoreBadge value={row.value} />
              </>
            )}
          </div>
        )) : (
          <div style={{ gridColumn: "1 / -1" }}><EmptyHint /></div>
        )}
      </div>

      <div onClick={(event) => event.stopPropagation()} style={{ minHeight: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 2, visibility: rows.length > SMDT_PREVIEW_PAGE_SIZE ? "visible" : "hidden" }}>
        <span style={{ fontSize: 10, color: "var(--t3)" }}>{(safePage - 1) * SMDT_PREVIEW_PAGE_SIZE + 1}-{Math.min(safePage * SMDT_PREVIEW_PAGE_SIZE, rows.length)} / {rows.length}</span>
        <Pagination compact page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>

      <SmdtPreviewLegend />
    </Card>
  );
}

function LegendText({ color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--t2)" }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function ChipButton({ children, active, tone = "B", onClick, style }) {
  const color = tone === "G" ? "#0ca30c" : tone === "R" ? "#e34948" : "var(--B)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10,
        padding: "2px 9px",
        borderRadius: 12,
        border: `0.5px solid ${active ? color : "var(--bdr)"}`,
        background: active ? "rgba(124,58,237,.12)" : "var(--elev)",
        color: active ? color : "var(--t2)",
        cursor: "pointer",
        fontWeight: active ? 750 : 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SignalPill({ sig, compact = false }) {
  const { t } = useTheme();
  const s = sigStyle(sig, t);
  if (!s) return <span style={{ color: "var(--t4)" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", fontSize: compact ? 9 : 10, fontWeight: 650, padding: compact ? "2px 5px" : "2px 6px", borderRadius: 3, whiteSpace: "nowrap", background: s.bg, color: s.color, border: `0.5px solid ${s.color}33` }}>
      {sigLabel(sig)}
    </span>
  );
}

function TopStrongTable({ rows, date, narrow }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const cellPadding = narrow ? "6px 5px" : "6px 8px";
  const firstCellPadding = narrow ? "6px 7px" : "6px 10px";
  const headerPadding = narrow ? "5px 5px" : "5px 8px";
  const firstHeaderPadding = narrow ? "5px 7px" : "5px 10px";
  const filtered = useMemo(() => {
    if (filter === "si") return rows.filter((row) => row.tickerSig === "si");
    if (filter === "sn") return rows.filter((row) => row.tickerSig === "sn");
    return rows;
  }, [filter, rows]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const displayCount = filter === "all" ? rows.length : filtered.length;
  const filterLabel = filter === "all" ? "Tất cả" : `Dòng tiền mã: ${sigLabel(filter)}`;

  const setNextFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  return (
    <Card noPad style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--bdr)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>Top mã mạnh</span>
          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fmtNum(displayCount)} mã · {filterLabel}{date ? ` · ${fmtFull(date)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0, minWidth: 0 }}>
          <ChipButton active={filter === "all"} onClick={() => setNextFilter("all")}>Tất cả</ChipButton>
          <ChipButton active={filter === "sn"} tone="G" onClick={() => setNextFilter("sn")}>Nhen nhóm</ChipButton>
          <ChipButton active={filter === "si"} tone="G" onClick={() => setNextFilter("si")}>Đổ vào</ChipButton>
          <Clink onClick={() => nav("top-ma-manh")}>Chi tiết ›</Clink>
        </div>
      </div>
      <div style={{ overflowX: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11 }}>
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "22%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--elev)" }}>
              {["Mã", "Giá", "TH cổ phiếu", "TH ngành", "T.thái"].map((h, i) => (
                <th key={h} style={{ padding: i === 0 ? firstHeaderPadding : headerPadding, textAlign: i === 1 ? "right" : "left", fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", borderBottom: "0.5px solid var(--bdr)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.ticker} onClick={() => nav("top-ma-manh")} style={{ borderBottom: "0.5px solid var(--bdrs)", cursor: "pointer" }}>
                <td style={{ padding: firstCellPadding, fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>{row.ticker}</td>
                <td style={{ padding: cellPadding, textAlign: "right", fontWeight: 650, color: "var(--t1)", ...mono }}>{row.price ? fmtNum(row.price) : "—"}</td>
                <td style={{ padding: cellPadding }}><SignalPill sig={row.tickerSig} /></td>
                <td style={{ padding: cellPadding }}><SignalPill sig={row.branchSig} /></td>
                <td style={{ padding: cellPadding }}><TopStatusBadge status={row.status} compact={narrow} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <EmptyHint />}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 14px", borderTop: "0.5px solid var(--bdr)", marginTop: "auto", gap: 8 }}>
        <span style={{ fontSize: 10, color: "var(--t3)" }}>{filtered.length ? `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, filtered.length)} / ${filtered.length}` : "0 / 0"}</span>
        <Pagination compact page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  );
}

function portfolioSummaryMessage({ score, counts, total, analyzed }) {
  if (!analyzed.length) return "Chưa tìm thấy dữ liệu cho các mã đang phân tích. Kiểm tra lại mã hoặc chờ dữ liệu StockTraders API cập nhật.";
  const good = analyzed.filter((row) => row.cat === "dd").map((row) => row.ticker).slice(0, 3).join(", ");
  const weak = analyzed.filter((row) => row.cat === "ss").map((row) => row.ticker).slice(0, 2).join(", ");
  if (score >= 70) return `Danh mục mạnh: ${Math.round((counts.dd / total) * 100)}% đúng sóng đúng ngành${good ? ` (${good})` : ""}. Duy trì và theo dõi tín hiệu bán.`;
  if (counts.ss > 0) return `${weak ? `${weak} ` : ""}đang sai sóng sai ngành. Cân nhắc giảm tỷ trọng và ưu tiên nhóm đúng sóng đúng ngành${good ? ` như ${good}` : ""}.`;
  return `Danh mục trung bình. Có ${counts.ds} mã đúng sóng nhưng ngành chưa xác nhận, nên theo dõi thêm 1-2 phiên.`;
}

function portfolioScoreLabel(score) {
  if (score >= 85) return "Xuất sắc";
  if (score >= 70) return "Tốt";
  if (score >= 55) return "Trung bình khá";
  if (score >= 40) return "Trung bình";
  return "Cần cải thiện";
}

function evalKeyToPortfolioCat(evalKey) {
  return { DS_DN: "dd", DS_SN: "ds", DN_SS: "sd", SS: "ss" }[evalKey] || "ss";
}

function calcPortfolioEval(row) {
  if (row?.evalKey) return row.evalKey;
  const branchOk = isPositiveSig(row?.branchSig) && Number.isFinite(row?.branchSmdt) && row.branchSmdt > 70;
  const tickerOk = isPositiveSig(row?.tickerSig || row?.sig) && Number.isFinite(row?.smdt) && row.smdt > 70;
  return fallbackEvalKey({ tickerOk, industryOk: branchOk });
}

function toPortfolioChatPosition(row) {
  return {
    ticker: row.ticker,
    industry: row.industry || "",
    smdt: apiNumber(row.smdt),
    smdtPrev: apiNumber(row.smdtPrev),
    branchSmdt: apiNumber(row.branchSmdt),
    branchSmdtPrev: apiNumber(row.branchSmdtPrev),
    cat: row.cat,
  };
}

function isPortfolioTickerQuestion(question) {
  const q = normalizeIndustryName(question);
  if (isDefinitionQuestion(q)) return false;
  const asksTickerSelection = q.includes("mã nào")
    || q.includes("ma nao")
    || q.includes("ticker nào")
    || q.includes("ticker nao")
    || q.includes("cổ phiếu nào")
    || q.includes("co phieu nao");
  const asksList = q.includes("cung cấp")
    || q.includes("cung cap")
    || q.includes("danh sách")
    || q.includes("danh sach")
    || q.includes("liệt kê")
    || q.includes("liet ke")
    || q.includes("lọc")
    || q.includes("loc")
    || q.includes("tìm mã")
    || q.includes("tim ma")
    || q.includes("tìm cổ phiếu")
    || q.includes("tim co phieu")
    || q.includes("cho tôi")
    || q.includes("cho toi");
  const hasSignal = isFourKeyPortfolioQuestion(q)
    || q.includes("chờ mua")
    || q.includes("cho mua")
    || q.includes("chờ bán")
    || q.includes("cho ban");
  return asksTickerSelection || (asksList && hasSignal) || (hasSignal && hasExplicitDateQuestion(q));
}

function isDefinitionQuestion(question) {
  const q = normalizeIndustryName(question);
  return q.includes("là gì")
    || q.includes("la gi")
    || q.includes("nghĩa là gì")
    || q.includes("nghia la gi")
    || q.includes("giải thích")
    || q.includes("giai thich")
    || q.includes("định nghĩa")
    || q.includes("dinh nghia");
}

function isFourKeyPortfolioQuestion(question) {
  const q = normalizeIndustryName(question);
  return q.includes("4-key")
    || q.includes("4 key")
    || q.includes("đúng sóng")
    || q.includes("dung song")
    || q.includes("sai sóng")
    || q.includes("sai song")
    || q.includes("đúng ngành")
    || q.includes("dung nganh")
    || q.includes("sai ngành")
    || q.includes("sai nganh");
}

function hasExplicitDateQuestion(question) {
  return /\b\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?\b/.test(String(question || ""));
}

function normalizePortfolioChatQuestion(question) {
  return String(question || "").replace(
    /\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/g,
    (_, day, month, year) => (year ? `${day}-${month}-${year}` : `${day}-${month}`)
  );
}

const NON_TICKER_ANSWER_TOKENS = new Set(["AI", "API", "HTTP", "SMDT", "KHONG", "CO", "CAC", "MA", "CUNG", "CAP", "NGAY", "DUNG", "SAI", "SONG", "NGANH", "CHO", "MUA", "BAN"]);

function tickersFromAnswer(answer) {
  return String(answer || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => /^[A-Z][A-Z0-9]{1,5}$/.test(token) && !NON_TICKER_ANSWER_TOKENS.has(token));
}

function uniqueAnswerTickers(replies) {
  return replies
    .flatMap((reply) => tickersFromAnswer(reply.answer))
    .filter(Boolean)
    .filter((ticker, index, tickers) => tickers.indexOf(ticker) === index)
    .join(", ");
}

function mentionedPortfolioPosition(question, portfolioPositions) {
  const tokens = String(question || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return portfolioPositions.find((position) => tokens.includes(String(position.ticker || "").toUpperCase())) || null;
}

function uniquePortfolioTickerAnswer(replies) {
  return replies
    .map((reply) => {
      const ticker = String(reply.position?.ticker || "").trim().toUpperCase();
      return tickersFromAnswer(reply.answer).includes(ticker) ? ticker : "";
    })
    .filter(Boolean)
    .filter((ticker, index, tickers) => tickers.indexOf(ticker) === index)
    .join(", ");
}

async function requestPortfolioChat({ question, userId, conversationId, position = null, positions = null }) {
  const body = {
    question,
    user_id: userId,
    conversation_id: conversationId,
  };
  if (position) body.portfolio = { position };
  else if (positions && positions.length) body.portfolio = { positions };
  const data = await fetchDataPostWithClientCache(PORTFOLIO_CHAT_API_URL, body);
  const answer = typeof data?.answer === "string" ? data.answer.trim() : "";
  return { answer, position, conversationId: data?.conversation_id };
}

function PortfolioBox({ rows, asOfDate }) {
  const narrow = useNarrow();
  const saved = useMemo(() => loadSavedPortfolio("STB, BVS, SSI"), []);
  const initialInput = saved.input || saved.analyzedCodes.join(", ") || "STB, BVS, SSI";
  const [input, setInput] = useState(initialInput);
  const [analyzedCodes, setAnalyzedCodes] = useState(saved.analyzedCodes);
  const [panelVal, setPanelVal] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState(() => `portfolio-dashboard-${Date.now()}`);
  const [msgs, setMsgs] = useState([]);
  const picks = useMemo(() => parsePortfolioCodes(input), [input]);
  const rowMap = useMemo(() => new Map(rows.map((row) => [row.ticker, row])), [rows]);
  const analyzed = analyzedCodes.map((ticker) => {
    const row = rowMap.get(ticker);
    const found = Boolean(row && Number.isFinite(row.smdt));
    const evalKey = found ? calcPortfolioEval(row) : null;
    const cat = found ? evalKeyToPortfolioCat(evalKey) : "ss";
    return {
      ticker,
      found,
      cat,
      evalKey,
      industry: row?.industry || "",
      smdt: row?.smdt,
      smdtPrev: row?.prevSmdt,
      branchSmdt: row?.branchSmdt,
      branchSmdtPrev: row?.branchSmdtPrev,
      tickerSig: row?.tickerSig || row?.sig,
      branchSig: row?.branchSig,
    };
  });
  const foundAnalyzed = analyzed.filter((row) => row.found);
  const hasAnalysis = analyzedCodes.length > 0;
  const isDirty = picks.join("|") !== analyzedCodes.join("|");
  const rawScore = useMemo(() => scorePortfolio4Key(foundAnalyzed), [foundAnalyzed]);
  const counts = useMemo(() => ({ dd: rawScore.dn, ds: rawScore.sn, sd: rawScore.ns, ss: rawScore.ss }), [rawScore]);
  const total = Math.max(1, foundAnalyzed.length);
  const score = foundAnalyzed.length ? rawScore.score : 0;
  const level = portfolioScoreLabel(score);
  const portfolioCtx = useMemo(() => ({ hasAnalysis, analyzed: foundAnalyzed, counts, total, score }), [foundAnalyzed, counts, hasAnalysis, score, total]);
  const portfolioPositions = useMemo(() => foundAnalyzed.map(toPortfolioChatPosition), [foundAnalyzed]);
  const portfolioSummary = hasAnalysis ? portfolioSummaryMessage(portfolioCtx) : "";
  const cats = [
    { key: "dd", color: "#0ca30c", label: "Đúng sóng - đúng ngành" },
    { key: "ds", color: "#eda100", label: "Đúng sóng - sai ngành" },
    { key: "sd", color: "#9b7cf7", label: "Đúng ngành - sai sóng" },
    { key: "ss", color: "#e34948", label: "Sai sóng - sai ngành" },
  ];

  const updateInput = (value) => {
    setInput(value);
    savePortfolioState(value, analyzedCodes);
  };
  const analyzePortfolio = () => {
    if (!picks.length) return;
    setAnalyzedCodes(picks);
    savePortfolioState(input, picks);
  };
  const openPortfolioDetail = () => {
    if (!hasAnalysis) return;
    savePortfolioState(input, analyzedCodes);
    nav("portfolio-analysis");
  };
  const sendPortfolioMsg = useCallback(async (text, panel = false) => {
    const question = text.trim();
    const apiQuestion = normalizePortfolioChatQuestion(question);
    if (!question || chatLoading) return;
    if (panel) setPanelVal("");
    setChatOpen(true);
    setChatLoading(true);
    setMsgs((prev) => [...prev, { role: "user", text: question }, { role: "typing", text: "Đang phân tích dữ liệu danh mục..." }]);

    try {
      if (!PORTFOLIO_CHAT_API_URL) throw new Error("thiếu cấu hình API portfolio chat");
      if (!portfolioPositions.length) throw new Error("chưa có mã hợp lệ trong danh mục đã phân tích");
      if (isPortfolioTickerQuestion(question)) {
        const replies = await Promise.allSettled(
          portfolioPositions.map((position) =>
            requestPortfolioChat({
              question: apiQuestion,
              userId: "u1",
              conversationId: `${conversationId}-${position.ticker}`,
              position,
            })
          )
        );
        const fulfilledReplies = replies
          .filter((reply) => reply.status === "fulfilled")
          .map((reply) => reply.value);
        const answer = isFourKeyPortfolioQuestion(question) && !hasExplicitDateQuestion(question)
          ? uniquePortfolioTickerAnswer(fulfilledReplies)
          : uniqueAnswerTickers(fulfilledReplies);
        if (!answer) throw new Error("API chưa trả về mã phù hợp");
        setMsgs((prev) => [...prev.filter((msg) => msg.role !== "typing"), { role: "ai", text: answer }]);
        return;
      }

      const mentionedPosition = mentionedPortfolioPosition(question, portfolioPositions);
      const reply = await requestPortfolioChat({
        question: apiQuestion,
        userId: "u1",
        conversationId: mentionedPosition ? `${conversationId}-${mentionedPosition.ticker}` : conversationId,
        position: null,
        positions: mentionedPosition ? null : portfolioPositions,
      });
      if (!reply.answer) throw new Error("API không trả về answer");
      if (reply.conversationId) setConversationId(reply.conversationId);
      setMsgs((prev) => [...prev.filter((msg) => msg.role !== "typing"), { role: "ai", text: reply.answer }]);
    } catch (error) {
      setMsgs((prev) => [
        ...prev.filter((msg) => msg.role !== "typing"),
        { role: "notice", text: `Chưa lấy được phản hồi từ API Chat AI${error?.message ? ` (${error.message})` : ""}.` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, conversationId, portfolioPositions]);
  const askPortfolioMsg = useCallback((text) => {
    sendPortfolioMsg(text, true);
  }, [sendPortfolioMsg]);

  return (
    <>
      <PortfolioAiLoadingStyles />
      <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)", whiteSpace: "nowrap" }}>Phân tích danh mục</span>
            <span style={{ fontSize: 10, color: "var(--t3)", whiteSpace: "nowrap" }}>tối đa {PORTFOLIO_MAX_CODES} mã</span>
          </div>
          {hasAnalysis && <Clink onClick={openPortfolioDetail}>Chi tiết ›</Clink>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => updateInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyzePortfolio()}
            style={{ flex: 1, minWidth: 0, padding: "7px 11px", borderRadius: 7, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t1)", fontSize: narrow ? 16 : 11, outline: "none" }}
            placeholder="VCG, HHV, BVS, TCB..."
          />
          <button
            type="button"
            onClick={analyzePortfolio}
            disabled={!picks.length}
            style={{ padding: "7px 12px", borderRadius: 7, background: "var(--B)", color: "white", border: "none", fontSize: 11, fontWeight: 700, cursor: picks.length ? "pointer" : "not-allowed", whiteSpace: "nowrap", opacity: picks.length ? 1 : 0.5 }}
          >
            <i className="ti ti-sparkles" style={{ marginRight: 5 }} />
            Phân tích
          </button>
        </div>
        {hasAnalysis ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Donut items={cats.map((cat) => ({ value: counts[cat.key] || 0, color: cat.color }))} size={72} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {cats.map((cat) => (
                  <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: cat.color }} />
                    <span style={{ flex: 1, minWidth: 0, color: "var(--t2)", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.label}</span>
                    <span style={{ color: cat.color, fontSize: 11, fontWeight: 750, whiteSpace: "nowrap", ...mono }}>{counts[cat.key] || 0} ({Math.round(((counts[cat.key] || 0) / total) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--elev)", borderRadius: 8, padding: "8px 12px" }}>
              <div>
                <div style={{ fontSize: 9, color: "var(--t3)", marginBottom: 2 }}>Điểm phù hợp</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: score >= 70 ? "#0ca30c" : score >= 50 ? "#eda100" : "#e34948", ...mono }}>{score}/100</div>
                <div style={{ fontSize: 9, color: "var(--t3)" }}>{level}</div>
              </div>
              <div style={{ width: 1, height: 38, background: "var(--bdr)" }} />
              <div style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.55, flex: 1 }}>
                <span style={{ fontSize: 9, fontWeight: 750, color: "#9b7cf7" }}>TÓM TẮT </span>
                {portfolioSummary}
                {isDirty && <div style={{ marginTop: 3, color: "var(--A)", fontSize: 10, fontWeight: 750 }}>Danh sách mới chưa phân tích.</div>}
              </div>
            </div>
          </>
        ) : (
          <div style={{ minHeight: 132, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 8, color: "var(--t3)", fontSize: 11, textAlign: "center", padding: "12px 14px" }}>
            <i className="ti ti-chart-donut" style={{ color: "var(--B)", fontSize: 17 }} />
            Nhập mã rồi bấm Phân tích để xem kết quả.
          </div>
        )}

        <div style={{ margin: "0 -14px", borderTop: "0.5px solid var(--bdr)", background: "var(--elev)", padding: "8px 14px 7px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 850, flexShrink: 0 }}>✦</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 750, color: "var(--t1)" }}>Tư vấn AI</div>
              <div style={{ fontSize: 9, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hỏi về danh mục, sóng ngành, chiến lược</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: chatLoading ? "var(--A)" : "var(--G)" }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: chatLoading ? "var(--A)" : "var(--G)", display: "inline-block", animation: "portfolio-ai-status-pulse 1.2s infinite" }} />
              {chatLoading ? "Đang hỏi" : "Sẵn sàng"}
            </span>
            <button type="button" onClick={() => setChatOpen(true)} style={{ border: "0.5px solid var(--bdr)", background: "var(--surf)", color: "var(--B)", borderRadius: 7, padding: "4px 8px", fontSize: 10, fontWeight: 750, cursor: "pointer", whiteSpace: "nowrap" }}>
              ↗ Mở rộng
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["Mã nào đúng sóng đúng ngành?", "Ngành nào dẫn dắt?", "Nên cắt mã nào?", "Phân bổ tỷ trọng?"].map((text) => (
            <button key={text} type="button" onClick={() => askPortfolioMsg(text)} disabled={chatLoading} style={{ border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t2)", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 650, cursor: chatLoading ? "not-allowed" : "pointer", opacity: chatLoading ? 0.55 : 1 }}>
              {text}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setChatOpen(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 32, padding: "6px 9px 6px 11px", borderRadius: 8, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t3)", fontSize: 11, cursor: "text", textAlign: "left" }}
        >
          <span>Hỏi AI về danh mục, chiến lược...</span>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--B)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</span>
        </button>
      </Card>

      <PortfolioChatPanel
        open={chatOpen}
        narrow={narrow}
        onClose={() => setChatOpen(false)}
        msgs={msgs}
        loading={chatLoading}
        value={panelVal}
        onChange={setPanelVal}
        onSend={(text) => sendPortfolioMsg(text, true)}
        hasAnalysis={hasAnalysis}
        analyzed={analyzed}
        cats={cats}
        score={score}
        counts={counts}
      />
    </>
  );
}

const WAVE_PALETTE = ["#7C3AED", "#3DD68C", "#FF9F0A", "#06B6D4", "#1A8A4A", "#FF2D55", "#EC4899", "#F59E0B", "#8B5CF6", "#14B8A6", "#84CC16", "#F97316", "#6366F1", "#0EA5E9", "#D946EF", "#22C55E"];
const WAVE_PAGE_SIZE = 6;
const WAVE_AXIS_HEIGHT = 24;
const WAVE_ROW_HEIGHT = 30;
const WAVE_PLOT_RIGHT = 90;

function monthTicks(startMs, endMs) {
  const span = Math.max(1, endMs - startMs);
  const ticks = [];
  const cursor = new Date(startMs);
  cursor.setDate(1);
  const multiYear = new Date(startMs).getFullYear() !== new Date(endMs).getFullYear();
  while (cursor.getTime() <= endMs) {
    const ms = cursor.getTime();
    if (ms >= startMs) {
      ticks.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        left: ((ms - startMs) / span) * WAVE_PLOT_RIGHT,
        label: `T${cursor.getMonth() + 1}${multiYear ? `/${String(cursor.getFullYear()).slice(2)}` : ""}`,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

function WaveTimeline({ events, recentDates, narrow }) {
  const [mode, setMode] = useState("core");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return events
      .filter((event) => (mode === "core" ? event.isCore : !event.isCore))
      .sort((a, b) => {
        if (mode === "core" && a.coreOrder !== b.coreOrder) return a.coreOrder - b.coreOrder;
        if (mode === "other" && a.isResidentialService !== b.isResidentialService) return a.isResidentialService ? 1 : -1;
        const latest = (b.points.at(-1)?.date || "").localeCompare(a.points.at(-1)?.date || "");
        return latest || b.peak - a.peak || a.name.localeCompare(b.name, "vi");
      });
  }, [events, mode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / WAVE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * WAVE_PAGE_SIZE, safePage * WAVE_PAGE_SIZE);

  const start = recentDates[0] ? new Date(recentDates[0]).getTime() : Date.now();
  const end = recentDates.at(-1) ? new Date(recentDates.at(-1)).getTime() : start + 1;
  const span = Math.max(1, end - start);
  const ticks = useMemo(() => monthTicks(start, end), [start, end]);
  const recentCut = recentDates.length ? new Date(end - 14 * 86400000).toISOString().slice(0, 10) : "";
  const nameWidth = narrow ? 82 : 110;

  const switchMode = (value) => {
    setMode(value);
    setPage(1);
  };

  return (
    <Card noPad style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>Lộ trình dẫn sóng</span>
          <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: 8 }}>{recentDates.length ? `${fmtFull(recentDates[0])} → ${fmtFull(recentDates.at(-1))}` : "30 phiên gần nhất"} </span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <ChipButton active={mode === "core"} onClick={() => switchMode("core")}>⭐ Chủ lực</ChipButton>
          <ChipButton active={mode === "other"} onClick={() => switchMode("other")}>Ngành phụ</ChipButton>
          <Clink onClick={() => nav("lo-trinh-dan-song")}>Chi tiết ›</Clink>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--bdr)", background: "var(--elev)" }}>
        <div style={{ width: nameWidth, flexShrink: 0, borderRight: "0.5px solid var(--bdr)" }} />
        <div style={{ flex: 1, position: "relative", height: WAVE_AXIS_HEIGHT }}>
          {ticks.map((tick, index) => (
            <span key={tick.key} style={{ position: "absolute", left: `${tick.left}%`, top: "50%", transform: "translateY(-50%)", paddingLeft: 4, fontSize: 9, fontWeight: index === ticks.length - 1 ? 750 : 600, color: index === ticks.length - 1 ? "#9b7cf7" : "var(--t4)", whiteSpace: "nowrap" }}>
              {tick.label}{index === ticks.length - 1 ? " ●" : ""}
            </span>
          ))}
        </div>
      </div>
      <div>
        {visible.map((event) => {
          const color = event.color || "#7C3AED";
          const lastPoint = event.points.at(-1);
          const isActive = Boolean(recentCut && lastPoint && lastPoint.date >= recentCut);
          return (
            <div key={event.key} style={{ display: "flex", alignItems: "center", minHeight: WAVE_ROW_HEIGHT, borderBottom: "0.5px solid var(--bdrs)", cursor: "pointer" }} onClick={() => nav("lo-trinh-dan-song")}>
              <div style={{ width: nameWidth, flexShrink: 0, fontSize: 10, fontWeight: event.isCore ? 750 : 550, padding: "0 8px", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderRight: "0.5px solid var(--bdr)", color: "var(--t2)" }} title={event.name}>{event.name}</div>
              <div style={{ flex: 1, position: "relative", height: WAVE_ROW_HEIGHT, minWidth: 0 }}>
                {ticks.map((tick) => <span key={tick.key} style={{ position: "absolute", top: 0, bottom: 0, left: `${tick.left}%`, width: 1, background: "var(--bdr)", opacity: 0.4 }} />)}
                {event.points.map((point) => {
                  const left = ((new Date(point.date).getTime() - start) / span) * WAVE_PLOT_RIGHT;
                  const isPeak = point.value >= 100;
                  const isLast = point === lastPoint;
                  const size = isPeak ? 13 : isLast && isActive ? 10 : 8;
                  return (
                    <span
                      key={point.date}
                      title={`${event.name} · ${fmtFull(point.date)} · ${point.value.toFixed(1)}%${isPeak ? " ★" : ""}`}
                      style={{ position: "absolute", left: `${Math.max(2, Math.min(WAVE_PLOT_RIGHT, left))}%`, top: "50%", transform: "translate(-50%,-50%)", width: size, height: size, borderRadius: 999, background: color, border: "1.5px solid rgba(0,0,0,.2)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isLast && isActive ? `0 0 0 2px ${color}35` : undefined, zIndex: isPeak ? 2 : 1 }}
                    >
                      {isPeak && <span style={{ fontSize: 6, color: "#fff", lineHeight: 1 }}>★</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!visible.length && <EmptyHint />}
      </div>
      <div style={{ padding: "6px 14px", borderTop: "0.5px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <LegendText color="#0ca30c" label=">=100%" />
          <LegendText color="#1baf7a" label="70-99%" />
          <span style={{ fontSize: 9, color: "var(--t3)" }}>★ đỉnh sóng · hover = SMDT</span>
        </div>
        <Pagination compact page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  );
}

function smdtChipTone(value) {
  if (value >= 100) return { color: "#0ca30c", bg: "rgba(12,163,12,.14)", border: "rgba(12,163,12,.36)" };
  if (value >= 70) return { color: "#1baf7a", bg: "rgba(27,175,122,.14)", border: "rgba(27,175,122,.34)" };
  if (value >= 30) return { color: "#eda100", bg: "rgba(237,161,0,.14)", border: "rgba(237,161,0,.34)" };
  return { color: "var(--t4)", bg: "var(--elev)", border: "var(--bdr)" };
}

function SmdtBarCell({ value, compact = false }) {
  if (!Number.isFinite(value)) return <span style={{ color: "var(--t4)" }}>—</span>;
  const tone = smdtChipTone(value);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: compact ? 0 : 62, padding: compact ? "3px 4px" : "4px 8px", borderRadius: 7, background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.color, fontSize: compact ? 10 : 11, fontWeight: 800, whiteSpace: "nowrap", ...mono }}>
      {value.toFixed(1)}
    </span>
  );
}

function PnlCell({ price, ave }) {
  if (!Number.isFinite(price) || !Number.isFinite(ave) || !ave) return <span style={{ color: "var(--t3)", fontSize: 10 }}>—</span>;
  const pct = ((price - ave) / ave) * 100;
  const color = pct >= 0 ? "#0ca30c" : "#e34948";
  return <span style={{ fontSize: 11, fontWeight: 650, color, ...mono }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

function SignalPortfolio({ rows, date, live }) {
  const narrow = useNarrow();
  const [tab, setTab] = useState("MUA");
  const [page, setPage] = useState(1);
  const sortByTicker = (items) => [...items].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const buyRows = useMemo(() => sortByTicker(rows.filter((row) => row.signal === "MUA")), [rows]);
  const sellRows = useMemo(() => sortByTicker(rows.filter((row) => row.signal === "BAN")), [rows]);
  const tabRows = tab === "MUA" ? buyRows : sellRows;
  const totalPages = Math.max(1, Math.ceil(tabRows.length / SIGNAL_PORTFOLIO_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = tabRows.slice((safePage - 1) * SIGNAL_PORTFOLIO_PAGE_SIZE, safePage * SIGNAL_PORTFOLIO_PAGE_SIZE);
  const cols = [
    { label: "Mã", width: "14%", align: "left" },
    { label: "DT cổ phiếu", width: "19%", align: "center" },
    { label: "SMDT mã", width: "17%", align: "center" },
    { label: "Giá", width: "16%", align: "right" },
    { label: "Giá vốn", width: "17%", align: "right" },
    { label: "Lãi / Lỗ", width: "17%", align: "right" },
  ];

  const switchTab = (value) => {
    setTab(value);
    setPage(1);
  };

  return (
    <Card noPad style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>Danh mục đầu tư giả lập</span>
          <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: 8 }}>{date ? fmtFull(date) : "—"} </span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <ChipButton active={tab === "MUA"} tone="G" onClick={() => switchTab("MUA")}>Mua <span style={{ marginLeft: 3, ...mono }}>{buyRows.length}</span></ChipButton>
          <ChipButton active={tab === "BAN"} tone="R" onClick={() => switchTab("BAN")}>Bán <span style={{ marginLeft: 3, ...mono }}>{sellRows.length}</span></ChipButton>
          <Clink onClick={() => nav("top-ma-manh")}>Xem tất cả ›</Clink>
        </div>
      </div>
      <div style={{ overflowX: narrow ? "hidden" : "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11, minWidth: narrow ? 0 : 500 }}>
          <colgroup>
            {cols.map((col) => <col key={col.label} style={{ width: col.width }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: "var(--elev)" }}>
              {cols.map((col, i) => (
                <th key={col.label} style={{ padding: narrow ? (i === 0 ? "6px 4px 6px 8px" : i === cols.length - 1 ? "6px 8px 6px 4px" : "6px 4px") : i === 0 ? "6px 12px" : "6px 8px", fontSize: narrow ? 8 : 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", borderBottom: "0.5px solid var(--bdr)", textAlign: col.align, whiteSpace: "nowrap" }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.ticker}-${row.date}`} style={{ borderBottom: "0.5px solid var(--bdrs)" }}>
                <td style={{ padding: narrow ? "7px 4px 7px 8px" : "7px 12px", fontWeight: 800, color: "var(--t1)" }}>{row.ticker}</td>
                <td style={{ padding: narrow ? "7px 4px" : "7px 8px", textAlign: "center" }}><SignalPill compact sig={row.cashSig || signalToSig(row.signal)} /></td>
                <td style={{ padding: narrow ? "7px 4px" : "7px 8px", textAlign: "center" }}><SmdtBarCell value={row.smdt} compact={narrow} /></td>
                <td style={{ padding: narrow ? "7px 4px" : "7px 8px", textAlign: "right", fontWeight: 650, color: "var(--t1)", ...mono }}>{Number.isFinite(row.price) ? fmtNum(row.price) : "—"}</td>
                <td style={{ padding: narrow ? "7px 4px" : "7px 8px", textAlign: "right", color: "var(--t2)", ...mono }}>{Number.isFinite(row.ave) ? fmtNum(row.ave) : "—"}</td>
                <td style={{ padding: narrow ? "7px 8px 7px 4px" : "7px 8px", textAlign: "right" }}><PnlCell price={row.price} ave={row.ave} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <EmptyHint>Chưa có tín hiệu {tab === "MUA" ? "mua" : "bán"}.</EmptyHint>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px", borderTop: "0.5px solid var(--bdr)", marginTop: "auto", gap: 8 }}>
        <span style={{ fontSize: 10, color: "var(--t3)" }}>{tabRows.length ? `${(safePage - 1) * SIGNAL_PORTFOLIO_PAGE_SIZE + 1}–${Math.min(safePage * SIGNAL_PORTFOLIO_PAGE_SIZE, tabRows.length)} / ${tabRows.length} mã` : "0 mã"}</span>
        <Pagination compact page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  );
}

const SIGNAL_LOG_TABS = [
  ["all", "Tất cả"],
  ["thi_truong", "Thị trường"],
  ["nganh", "Ngành"],
  ["ma", "Mã"],
];
const SIGNAL_LOG_TAG_COLORS = {
  "Cổ phiếu": "#22D3EE",
  "Ngành": "#3DD68C",
  "Thị trường": "#A78BFA",
};
const NHAT_KY_DARK_COLORS = {
  t1: "#F0F4FF",
  t2: "#A8B8D0",
  t4: "#5C7090",
  surf: "#111520",
  elev: "#171D2E",
  cbdr: "#1E2A3E",
  bdrs: "#1A2232",
  B: "#A78BFA",
  cmb: "#0A2318",
  cmd: "#0F3D22",
  cmc: "#3DD68C",
  cbb: "#2B1800",
  cbd: "#4A2E00",
  cbc: "#FF9F0A",
  bab: "#200A0E",
  bad: "#3D1018",
  bac: "#FF2D55",
  pb: "rgba(124,58,237,.16)",
  pd: "#5B21B6",
};
const NHAT_KY_LIGHT_COLORS = {
  t1: "var(--t1)",
  t2: "var(--t2)",
  t4: "var(--t3)",
  bdrs: "var(--bdrs)",
  B: "var(--B)",
  cmb: "#E7F8EF",
  cmd: "#BFEBD1",
  cmc: "#0C9F61",
  cbb: "#FFF2D8",
  cbd: "#F5D08A",
  cbc: "#B26A00",
  bab: "#FFE8EC",
  bad: "#F3B7C1",
  bac: "#E11D48",
  pb: "rgba(124,58,237,.10)",
  pd: "#C4B5FD",
};
const SIGNAL_LOG_SMDT_THRESHOLD = 70;

function signalLogKeyForSig(sig) {
  return sig === "si" || sig === "sn" ? "up" : "down";
}

function signalLogPercent(value, total) {
  const number = Number(value);
  const base = Number(total);
  if (!Number.isFinite(number) || !Number.isFinite(base) || base <= 0) return "0%";
  return `${((number / base) * 100).toFixed(1)}%`.replace(".", ",");
}

function signalLogSmdt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "—";
}

function signalLogPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "";
}

function signalLogProfit(price, ave) {
  const p = Number(price);
  const a = Number(ave);
  if (!Number.isFinite(p) || !Number.isFinite(a) || a === 0) return "0%";
  const pct = ((p - a) / a) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function signalLogSmdtBand(value, C = NHAT_KY_DARK_COLORS) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 70) return { bg: C.cmb, bd: C.cmd, sk: C.cmc };
  if (Number.isFinite(number) && number >= 20) return { bg: C.cbb, bd: C.cbd, sk: C.cbc };
  return { bg: C.bab, bd: C.bad, sk: C.bac };
}

function SignalLogIcon({ toneKey, smdtValue, colors }) {
  const C = colors || NHAT_KY_DARK_COLORS;
  const iconKey = toneKey === "smdt" ? "smdt" : toneKey;
  const smdtBand = iconKey === "smdt" ? signalLogSmdtBand(smdtValue, C) : null;
  const sk = smdtBand?.sk || (iconKey === "down" ? C.bac : iconKey === "warn" ? C.cbc : iconKey === "wave" ? C.B : C.cmc);
  const bg = smdtBand?.bg || (iconKey === "down" ? C.bab : iconKey === "warn" ? C.cbb : iconKey === "wave" ? C.pb : C.cmb);
  const bd = smdtBand?.bd || (iconKey === "down" ? C.bad : iconKey === "warn" ? C.cbd : iconKey === "wave" ? C.pd : C.cmd);
  const paths = {
    up: (
      <>
        <polyline points="3,17 9,11 13,15 21,7" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="15,7 21,7 21,13" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    down: (
      <>
        <polyline points="3,7 9,13 13,9 21,17" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="15,17 21,17 21,11" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    warn: (
      <>
        <circle cx="12" cy="12" r="9" stroke={sk} strokeWidth="2.2" />
        <line x1="12" y1="7.5" x2="12" y2="13" stroke={sk} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r="1.3" fill={sk} />
      </>
    ),
    wave: <path d="M3 12h3l2.5-6 4 12 2.5-6h6" stroke={sk} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    smdt: <path d="M12 3c3.2 3 4.5 5.4 4.5 8.2a4.5 4.5 0 0 1-9 0c0-1.3.6-2.4 1.7-3.3.1 1.2.6 1.9 1.2 2.4-.2-2.4-1-4.6 1.6-7.3Z" stroke={sk} strokeWidth="1.9" strokeLinejoin="round" fill={`${sk}22`} />,
  };

  return (
    <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: bg, border: `1px solid ${bd}` }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">{paths[iconKey] || paths.up}</svg>
    </span>
  );
}

// Giờ của một dòng nhật ký, ưu tiên theo độ tin cậy:
//   1. Giờ nằm trong chính bản ghi (field `time`, hoặc `date` dạng datetime).
//   2. Mốc cập nhật thật của feed sinh ra tín hiệu đó — chỉ dùng cho phiên mới
//      nhất của feed, vì với phiên cũ mốc này không còn ý nghĩa.
//   3. Không có gì đáng tin thì bỏ trống, không đắp giờ mặc định.
function resolveSignalTime(row, rowDate, feed) {
  const fromRow = formatTimeOfDay(row?.time) || formatTimeOfDay(row?.date);
  if (fromRow) return fromRow;
  if (!feed) return "";

  const latestValue = toDateInputValue(feed.latestDate);
  const dateValue = toDateInputValue(rowDate);
  if (!latestValue || !dateValue || dateValue !== latestValue) return "";
  return formatTimeOfDay(feed.updatedAt);
}

function SignalLog({ topRows, branchRows, smdtBranchRows, cashTickerRows, stockSignalRows, waveRows, feeds = {}, notificationRows = null, narrow = false }) {
  const { dark } = useTheme();
  const C = dark ? NHAT_KY_DARK_COLORS : NHAT_KY_LIGHT_COLORS;
  const [tab, setTab] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const logs = useMemo(() => {
    if (Array.isArray(notificationRows)) return notificationRows;

    const items = [];
    for (const row of [...waveRows].slice(-1).reverse()) {
      const total = row.total ?? (row.waitbuy || 0) + (row.buy || 0) + (row.waitsell || 0) + (row.sell || 0);
      items.push({
        cap: "thi_truong",
        capTag: "Thị trường",
        k: "wave",
        t: resolveSignalTime(row, row.date, feeds.wave),
        sortDate: toDateInputValue(row.date),
        title: "Tín hiệu thị trường",
        x: `Chờ mua ${fmtNum(row.waitbuy || 0)} mã (${signalLogPercent(row.waitbuy || 0, total)}), Mua ${fmtNum(row.buy || 0)}, Chờ bán ${fmtNum(row.waitsell || 0)}, Bán ${fmtNum(row.sell || 0)}.${Number.isFinite(row.reliability) ? ` Độ tin cậy ${fmtNum(row.reliability)}%.` : ""}`,
      });
    }

    for (const row of branchRows.filter((item) => item.sig).slice(0, 12)) {
      items.push({
        cap: "nganh",
        capTag: "Ngành",
        k: signalLogKeyForSig(row.sig),
        t: resolveSignalTime(row, feeds.cashBranch?.date, feeds.cashBranch),
        sortDate: toDateInputValue(feeds.cashBranch?.date),
        title: "Cảnh báo dòng tiền",
        x: `Dòng tiền ${sigLabel(row.sig).toLowerCase()} ở cổ phiếu ngành ${row.label}.`,
      });
    }

    for (const row of smdtBranchRows.filter((item) => Number.isFinite(item.value) && item.value >= SIGNAL_LOG_SMDT_THRESHOLD).slice(0, 12)) {
      items.push({
        cap: "nganh",
        capTag: "Ngành",
        k: "smdt",
        smdtValue: row.value,
        t: resolveSignalTime(row, feeds.smdtBranch?.date, feeds.smdtBranch),
        sortDate: toDateInputValue(feeds.smdtBranch?.date),
        title: "Cảnh báo SMDT",
        x: `Ngành ${row.label || row.name} có SMDT đạt ${signalLogSmdt(row.value)}.`,
      });
    }

    for (const row of stockSignalRows.filter((item) => item.signal === "MUA" || item.signal === "BAN").slice(0, 14)) {
      const isBuy = row.signal === "MUA";
      const hold = Number(row.hold ?? row.weight);
      const price = signalLogPrice(row.price);
      items.push({
        cap: "ma",
        capTag: "Cổ phiếu",
        k: isBuy ? "up" : "down",
        t: resolveSignalTime(row, row.date, feeds.stockSignal),
        sortDate: toDateInputValue(row.date),
        title: isBuy ? "Khuyến nghị mua" : "Khuyến nghị bán",
        x: isBuy
          ? `${row.ticker} mua ${Number.isFinite(hold) ? Math.round(hold) : 0}%${price ? ` giá ${price}` : ""} trong phiên hôm nay, SMDT đạt ${signalLogSmdt(row.smdt)}.`
          : `${row.ticker} bán ${Number.isFinite(hold) ? Math.round(hold) : 0}%${price ? ` giá ${price}` : ""} trong phiên hôm nay, lợi nhuận ${signalLogProfit(row.price, row.ave)}.`,
      });
    }

    for (const row of topRows.filter((item) => Number.isFinite(item.smdt) && item.smdt >= SIGNAL_LOG_SMDT_THRESHOLD).slice(0, 12)) {
      items.push({
        cap: "ma",
        capTag: "Cổ phiếu",
        k: "smdt",
        smdtValue: row.smdt,
        t: resolveSignalTime(row, feeds.smdtTicker?.date, feeds.smdtTicker),
        sortDate: toDateInputValue(feeds.smdtTicker?.date),
        title: "Cảnh báo SMDT",
        x: `Cổ phiếu ${row.ticker} có SMDT đạt ${signalLogSmdt(row.smdt)}.${row.industry ? ` Ngành ${row.industry}.` : ""}`,
      });
    }

    for (const row of cashTickerRows.filter((item) => item.content).slice(0, 12)) {
      const sig = tickerContentToSig(row.content);
      items.push({
        cap: "ma",
        capTag: "Cổ phiếu",
        k: signalLogKeyForSig(sig),
        t: resolveSignalTime(row, row.date, feeds.cashTicker),
        sortDate: toDateInputValue(row.date),
        title: "Cảnh báo dòng tiền",
        x: `Cổ phiếu ${row.ticker} có dòng tiền ${String(row.content).toLowerCase()}.`,
      });
    }
    return items;
  }, [branchRows, cashTickerRows, feeds, notificationRows, smdtBranchRows, stockSignalRows, topRows, waveRows]);

  const visible = useMemo(() => logs.filter((item) => tab === "all" || item.cap === tab), [logs, tab]);
  const collapsedLimit = 6;
  const displayList = expanded ? visible : visible.slice(0, collapsedLimit);
  const hasMore = visible.length > collapsedLimit;
  const dateLabel = useMemo(() => {
    const date = logs.map((item) => item.sortDate).filter(Boolean).sort((a, b) => b.localeCompare(a))[0];
    return date ? fmtFull(date) : "";
  }, [logs]);
  const countFor = (id) => id === "all" ? logs.length : logs.filter((item) => item.cap === id).length;

  useEffect(() => {
    setExpanded(false);
  }, [tab]);

  return (
    <Card id="signal-log-card" noPad style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: narrow ? "12px 14px 10px" : "10px 14px", borderBottom: "0.5px solid var(--bdr)", display: "flex", flexDirection: narrow ? "column" : "row", alignItems: narrow ? "stretch" : "center", justifyContent: "space-between", flexWrap: narrow ? "nowrap" : "wrap", gap: narrow ? 9 : 8 }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>Nhật ký tín hiệu</span>
          {dateLabel && <span style={{ fontSize: 10, color: "var(--t3)", whiteSpace: "nowrap" }}>{dateLabel}</span>}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "nowrap", overflowX: narrow ? "auto" : "visible", overflowY: "hidden", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {SIGNAL_LOG_TABS.map(([id, label]) => {
            const active = id === tab;
            return (
              <ChipButton key={id} active={active} onClick={() => setTab(id)} style={narrow ? { flexShrink: 0, padding: "2px 10px", minHeight: 22 } : null}>{label}</ChipButton>
            );
          })}
          {hasMore && <Clink onClick={() => setExpanded((value) => !value)} style={narrow ? { flexShrink: 0, marginLeft: 4, whiteSpace: "nowrap" } : null}>{expanded ? "Thu gọn ↑" : "Xem tất cả ›"}</Clink>}
        </div>
      </div>

      <div style={{ padding: "2px 18px 14px" }}>
        {displayList.map((item, index) => {
          const tagColor = SIGNAL_LOG_TAG_COLORS[item.capTag] || "var(--B)";
          return (
            <div key={`${item.cap}-${item.title}-${item.t}-${index}`} style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: index < displayList.length - 1 ? `0.5px solid ${C.bdrs}` : "none" }}>
              <SignalLogIcon toneKey={item.k} smdtValue={item.smdtValue} colors={C} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 750, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tagColor, background: `${tagColor}1A`, borderRadius: 6, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{item.capTag}</span>
                  {item.t && <span style={{ fontSize: 10, color: C.t4, marginLeft: "auto", whiteSpace: "nowrap", flexShrink: 0 }}>{item.t}</span>}
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.45, color: C.t2 }}>{item.x}</div>
              </div>
            </div>
          );
        })}
        {!visible.length && <div style={{ padding: "28px 0", textAlign: "center", color: C.t4, fontSize: 12 }}>Chưa có tín hiệu ở cấp này trong phiên.</div>}
        {expanded && hasMore && <div style={{ padding: "14px 0", textAlign: "center", fontSize: 11, color: C.t4 }}>— đã hiển thị tất cả {visible.length} dòng —</div>}
      </div>
    </Card>
  );
}

export function ModDashboard({ tradingDate }) {
  const narrow = useNarrow();
  const smdt = useSMDT();
  const cashBranch = useCashFlowBranch();
  const smdtTicker = useSMDTTicker();
  const cashTicker = useCashFlowTicker();
  const branchPath = useBranchPath();
  const branchCross = useSMDTBranchCross();
  const stockSignal = useStockSignal();
  const stockWave = useStockWave();
  const marketStockWave = useMarketStockWave();
  const totalTrade = useTotalTrade();
  const tradingDateValue = toDateInputValue(tradingDate);

  const liveSmdtBranch = useRealtimeSMDTBranchFeed(smdt.applyTick);
  const liveCashBranch = useRealtimeCashFlowFeed(cashBranch.applyTick);
  const liveSmdtTicker = useRealtimeSMDTTickerFeed(smdtTicker.applyTick);
  const liveCashTicker = useRealtimeCashFlowTickerFeed(cashTicker.applyTick);
  const liveStockSignal = useRealtimeStockSignalFeed(stockSignal.applyTick);
  const liveStockWave = useRealtimeStockWaveFeed(stockWave.applyTick);
  const liveBranchCross = useRealtimeSMDTBranchCrossFeed(branchCross.applyTick);

  const smdtBranchDatesDesc = useMemo(() => sortDatesDesc(smdt.datesAsc), [smdt.datesAsc]);
  const smdtBranchDate = smdtBranchDatesDesc[findDateIndex(smdtBranchDatesDesc, tradingDateValue)] || topDate(smdt.datesAsc);
  const smdtBranchDateIndex = useMemo(() => findDateIndex(smdtBranchDatesDesc, toDateInputValue(smdtBranchDate)), [smdtBranchDate, smdtBranchDatesDesc]);
  const prevSmdtBranchDate = smdtBranchDateIndex >= 0 ? smdtBranchDatesDesc[smdtBranchDateIndex + 1] || "" : "";
  const cashBranchDatesDesc = useMemo(() => sortDatesDesc(cashBranch.datesAsc), [cashBranch.datesAsc]);
  const cashBranchDate = cashBranchDatesDesc[findDateIndex(cashBranchDatesDesc, tradingDateValue)] || topDate(cashBranch.datesAsc);
  const smdtTickerDatesDesc = useMemo(() => sortDatesDesc(smdtTicker.datesAsc), [smdtTicker.datesAsc]);
  const smdtTickerDate = smdtTickerDatesDesc[findDateIndex(smdtTickerDatesDesc, tradingDateValue)] || topDate(smdtTicker.datesAsc);
  const stockNoti = useStockNoti(tradingDateValue || cashBranchDate || smdtTickerDate);
  const liveStockNoti = useRealtimeStockNotiFeed(stockNoti.applyTick);
  const updatedAt = latestUpdatedAt(smdt.updatedAt, cashBranch.updatedAt, smdtTicker.updatedAt, cashTicker.updatedAt, stockSignal.updatedAt, stockNoti.updatedAt, stockWave.updatedAt, marketStockWave.updatedAt, branchCross.updatedAt, totalTrade.updatedAt);
  const live =
    liveSmdtBranch.connected ||
    liveCashBranch.connected ||
    liveSmdtTicker.connected ||
    liveCashTicker.connected ||
    liveStockSignal.connected ||
    liveStockNoti.connected ||
    liveStockWave.connected ||
    liveBranchCross.connected;
  const legacyWaveLatest = useMemo(() => {
    if (!stockWave.rows.length) return null;
    if (!tradingDateValue) return stockWave.rows[stockWave.rows.length - 1] || null;
    return [...stockWave.rows].reverse().find((row) => toDateInputValue(row.date) <= tradingDateValue) || stockWave.rows[0] || null;
  }, [stockWave.rows, tradingDateValue]);
  const marketWaveLatest = useMemo(() => {
    if (!marketStockWave.rows.length) return null;
    if (!tradingDateValue) return marketStockWave.rows[marketStockWave.rows.length - 1] || null;
    return [...marketStockWave.rows].reverse().find((row) => toDateInputValue(row.date) <= tradingDateValue) || marketStockWave.rows[0] || null;
  }, [marketStockWave.rows, tradingDateValue]);
  const waveLatest = marketWaveLatest || (marketStockWave.status === "error" ? legacyWaveLatest : null);

  const branchSmdtRows = useMemo(() => {
    return smdt.branches
      .map((branch) => ({ key: branch.key, name: branch.label, label: branch.label, isCore: branch.isCore || CORE_KEYS.has(branch.key), value: smdt.matrix[branch.key]?.[smdtBranchDate] }))
      .filter((row) => Number.isFinite(row.value))
      .sort((a, b) => b.value - a.value);
  }, [smdt.branches, smdt.matrix, smdtBranchDate]);

  const branchCashRows = useMemo(() => {
    return cashBranch.branches
      .map((branch) => ({
        key: branch.key,
        label: branch.label,
        isCore: Boolean(branch.isCore),
        sig: contentToSig(findLatestValueAtOrBefore(cashBranch.matrix[branch.key], cashBranchDatesDesc, toDateInputValue(cashBranchDate))),
      }))
      .sort((a, b) => {
        const ai = a.sig ? SIG_ORDER.indexOf(a.sig) : SIG_ORDER.length;
        const bi = b.sig ? SIG_ORDER.indexOf(b.sig) : SIG_ORDER.length;
        return ai - bi || a.label.localeCompare(b.label, "vi");
      });
  }, [cashBranch.branches, cashBranch.matrix, cashBranchDate, cashBranchDatesDesc]);

  const branchCashByLabel = useMemo(() => {
    const map = new Map();
    for (const row of branchCashRows) {
      if (!row.sig) continue;
      setIndustryLookup(map, row.key, row.sig);
      setIndustryLookup(map, row.label, row.sig);
    }
    return map;
  }, [branchCashRows]);

  const branchSmdtByLabel = useMemo(() => {
    const map = new Map();
    for (const row of branchSmdtRows) {
      setIndustryLookup(map, row.key, row.value);
      setIndustryLookup(map, row.label, row.value);
    }
    return map;
  }, [branchSmdtRows]);

  const branchSmdtPrevByLabel = useMemo(() => {
    const map = new Map();
    if (!prevSmdtBranchDate) return map;
    for (const branch of smdt.branches) {
      const value = smdt.matrix[branch.key]?.[prevSmdtBranchDate];
      if (!Number.isFinite(value)) continue;
      setIndustryLookup(map, branch.key, value);
      setIndustryLookup(map, branch.label, value);
    }
    return map;
  }, [prevSmdtBranchDate, smdt.branches, smdt.matrix]);

  const cashTickerDatesDesc = useMemo(() => sortDatesDesc(cashTicker.buckets.map((bucket) => bucket.date)), [cashTicker.buckets]);
  const activeCashTickerDate = useMemo(() => {
    const index = findDateIndex(cashTickerDatesDesc, toDateInputValue(smdtTickerDate));
    return index >= 0 ? cashTickerDatesDesc[index] : cashTicker.latest?.date || "";
  }, [cashTickerDatesDesc, cashTicker.latest?.date, smdtTickerDate]);

  const activeCashBucket = useMemo(
    () => findBucketByDate(cashTicker.buckets, activeCashTickerDate) || cashTicker.latest,
    [activeCashTickerDate, cashTicker.buckets, cashTicker.latest]
  );

  const cashTickerRows = activeCashBucket?.rows || [];
  const cashTickerUniverse = useMemo(() => {
    const source = cashTicker.allowedTickers?.length ? cashTicker.allowedTickers : cashTickerRows.map((row) => row.ticker);
    return [...new Set(source)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [cashTicker.allowedTickers, cashTickerRows]);
  const cashByTicker = useMemo(() => {
    const map = new Map();
    const startIndex = findDateIndex(cashTickerDatesDesc, toDateInputValue(activeCashTickerDate));
    if (startIndex < 0) return map;
    for (let index = startIndex; index < cashTickerDatesDesc.length; index += 1) {
      const bucket = findBucketByDate(cashTicker.buckets, cashTickerDatesDesc[index]);
      for (const row of bucket?.rows || []) {
        if (!map.has(row.ticker)) map.set(row.ticker, row);
      }
      if (cashTickerUniverse.length && map.size >= cashTickerUniverse.length) break;
    }
    return map;
  }, [activeCashTickerDate, cashTicker.buckets, cashTickerDatesDesc, cashTickerUniverse]);
  const smdtTickerUniverse = useMemo(() => {
    const source = smdtTicker.tickers.length ? smdtTicker.tickers.map((tk) => tk.key) : Object.keys(smdtTicker.matrix);
    return [...new Set(source)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [smdtTicker.matrix, smdtTicker.tickers]);
  const smdtTickerByKey = useMemo(() => new Map(smdtTicker.tickers.map((tk) => [tk.key, tk])), [smdtTicker.tickers]);
  const smdtTickerPool = useMemo(() => {
    return smdtTickerUniverse.map((ticker) => {
      const tk = smdtTickerByKey.get(ticker) || { key: ticker, name: ticker };
      return { ...tk, industry: branchPath.tickerToBranch[ticker] || "" };
    });
  }, [branchPath.tickerToBranch, smdtTickerByKey, smdtTickerUniverse]);

  const cashTickerCounts = useMemo(() => {
    const byGroup = {
      core: { si: 0, sn: 0, so: 0, st: 0 },
      other: { si: 0, sn: 0, so: 0, st: 0 },
      all: { si: 0, sn: 0, so: 0, st: 0 },
    };
    for (const ticker of cashTickerUniverse) {
      const row = cashByTicker.get(ticker);
      const sig = tickerContentToSig(row?.content || "");
      if (!sig) continue;
      const branch = branchPath.tickerToBranch[ticker] || "";
      const group = isCashFlowCoreIndustry(branch) ? "core" : "other";
      byGroup[group][sig] += 1;
      byGroup.all[sig] += 1;
    }
    return byGroup;
  }, [branchPath.tickerToBranch, cashByTicker, cashTickerUniverse]);

  const branchCashCounts = useMemo(() => {
    const counts = {
      core: { si: 0, sn: 0, so: 0, st: 0 },
      other: { si: 0, sn: 0, so: 0, st: 0 },
      all: { si: 0, sn: 0, so: 0, st: 0 },
    };
    for (const row of branchCashRows) {
      if (!row.sig) continue;
      const group = row.isCore ? "core" : "other";
      counts[group][row.sig] += 1;
      counts.all[row.sig] += 1;
    }
    return counts;
  }, [branchCashRows]);

  const stockSignalByTicker = useMemo(() => new Map(stockSignal.rows.map((row) => [row.ticker, row])), [stockSignal.rows]);
  const smdtTickerDateIndex = useMemo(() => findDateIndex(smdtTickerDatesDesc, toDateInputValue(smdtTickerDate)), [smdtTickerDate, smdtTickerDatesDesc]);
  const prevSmdtTickerDate = smdtTickerDateIndex >= 0 ? smdtTickerDatesDesc[smdtTickerDateIndex + 1] || "" : "";
  const prev2SmdtTickerDate = smdtTickerDateIndex >= 0 ? smdtTickerDatesDesc[smdtTickerDateIndex + 2] || "" : "";
  const portfolioBranchSmdtDate = smdtBranchDatesDesc[findDateIndex(smdtBranchDatesDesc, toDateInputValue(smdtTickerDate))] || "";

  const allTopTickers = useMemo(() => {
    const rows = smdtTickerPool.flatMap((tk) => {
      const smdtValue = smdtTicker.matrix[tk.key]?.[smdtTickerDate];
      if (!Number.isFinite(smdtValue)) return [];
      const cash = cashByTicker.get(tk.key);
      const industry = tk.industry;
      const branchSmdt = lookupIndustryValue(branchSmdtByLabel, industry);
      const branchSmdtPrev = lookupIndustryValue(branchSmdtPrevByLabel, industry);
      const tickerSig = tickerContentToSig(cash?.content || "");
      const branchSig = lookupIndustryValue(branchCashByLabel, industry);
      const signal = stockSignalByTicker.get(tk.key);
      const trade = getLatestTrade(totalTrade, tk.key, smdtTickerDate);
      const prevSmdt = smdtTicker.matrix[tk.key]?.[prevSmdtTickerDate];
      const prev2Smdt = smdtTicker.matrix[tk.key]?.[prev2SmdtTickerDate];
      const branch = findIndustryBranch(smdt.branches, industry);
      const fourKey = evaluateFourKey({
        ticker: tk.key,
        industry,
        date: smdtTickerDate,
        tickerSeries: seriesFromMatrix(smdtTicker.matrix, smdtTicker.datesAsc, tk.key, smdtTickerDate),
        industrySeries: branch ? seriesFromMatrix(smdt.matrix, smdt.datesAsc, branch.key, portfolioBranchSmdtDate || smdtTickerDate) : [],
      });
      const evalKey = fourKey?.evalKey || fallbackEvalKey({
        tickerOk: isPositiveSig(tickerSig) && Number.isFinite(smdtValue) && smdtValue > 70,
        industryOk: isPositiveSig(branchSig) && Number.isFinite(branchSmdt) && branchSmdt > 70,
      });
      const momentum = Number.isFinite(prevSmdt) ? smdtValue - prevSmdt : 0;
      const status = classifyStrongTicker(smdtValue, prevSmdt, prev2Smdt, tickerSig, branchSmdt, branchSig);
      return [{
        ticker: tk.key,
        name: tk.name || tk.key,
        industry,
        smdt: smdtValue,
        prevSmdt,
        prev2Smdt,
        momentum,
        branchSmdt,
        branchSmdtPrev,
        sig: tickerSig,
        tickerSig,
        branchSig,
        fourKey,
        evalKey,
        status,
        price: cash?.price || trade?.price || signal?.price,
        score: smdtValue + (Number.isFinite(branchSmdt) ? branchSmdt * 0.22 : 0) + sigWeight(tickerSig) * 8 + sigWeight(branchSig) * 4 + Math.max(-12, Math.min(18, momentum * 0.7)),
      }];
    });
    return rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [branchCashByLabel, branchSmdtByLabel, branchSmdtPrevByLabel, cashByTicker, portfolioBranchSmdtDate, prev2SmdtTickerDate, prevSmdtTickerDate, smdt.branches, smdt.datesAsc, smdt.matrix, smdtTicker.datesAsc, smdtTicker.matrix, smdtTickerDate, smdtTickerPool, stockSignalByTicker, totalTrade]);

  const rankedTopTickers = useMemo(() => {
    return [...allTopTickers].sort((a, b) => b.score - a.score || b.smdt - a.smdt);
  }, [allTopTickers]);

  const rankedStrongTickers = useMemo(() => {
    return rankedTopTickers.filter((row) => row.status);
  }, [rankedTopTickers]);

  const stockSignalDatesDesc = useMemo(() => {
    const dates = stockSignal.rows.flatMap((row) => {
      const points = Array.isArray(row.points) ? row.points : [];
      return points.length ? points.map((point) => point.date).filter(Boolean) : [row.date].filter(Boolean);
    });
    return sortDatesDesc(dates);
  }, [stockSignal.rows]);

  const latestStockSignalDate = useMemo(() => {
    return stockSignalDatesDesc[findDateIndex(stockSignalDatesDesc, tradingDateValue)] || stockSignalDatesDesc[0] || "";
  }, [stockSignalDatesDesc, tradingDateValue]);

  const stockSignalRows = useMemo(() => {
    return stockSignal.rows.map((row) => {
      const signalRow = getStockSignalRowForDate(row, latestStockSignalDate);
      const smdtValue = smdtTicker.matrix[row.ticker]?.[smdtTickerDate];
      const cash = cashByTicker.get(row.ticker);
      return {
        ...signalRow,
        smdt: Number.isFinite(smdtValue) ? smdtValue : signalRow.smdt,
        cashSig: tickerContentToSig(cash?.content || ""),
      };
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [cashByTicker, latestStockSignalDate, smdtTicker.matrix, smdtTickerDate, stockSignal.rows]);

  const waveWindowDates = useMemo(() => {
    const branchCrossDatesDesc = sortDatesDesc(branchCross.datesAsc);
    const lastDate = branchCrossDatesDesc[findDateIndex(branchCrossDatesDesc, tradingDateValue)] || branchCross.datesAsc.at(-1);
    if (!lastDate) return [];
    const yearStart = `${lastDate.slice(0, 4)}-01-01`;
    return branchCross.datesAsc.filter((date) => date >= yearStart && toDateInputValue(date) <= toDateInputValue(lastDate));
  }, [branchCross.datesAsc, tradingDateValue]);

  const waveEvents = useMemo(() => {
    const windowStart = waveWindowDates[0] || "";
    return branchCross.branches.map((branch, index) => {
      const row = branchCross.matrix[branch.key] || {};
      const points = Object.keys(row)
        .filter((date) => date >= windowStart)
        .sort()
        .map((date) => ({ date, value: toNumber(row[date]) }))
        .filter((point) => Number.isFinite(point.value));
      const isResidentialService = isResidentialRealEstateServiceName(branch.key) || isResidentialRealEstateServiceName(branch.label);
      const coreOrder = isResidentialService ? -1 : Math.max(waveCoreOrderOfIndustry(branch.key), waveCoreOrderOfIndustry(branch.label));
      const isCore = coreOrder >= 0;
      return {
        key: branch.key,
        name: branch.key === "BĐS Dân cư" ? "BĐS Dân cư" : branch.label,
        color: WAVE_PALETTE[index % WAVE_PALETTE.length],
        isCore,
        isResidentialService,
        coreOrder: isCore ? coreOrder : 999,
        points,
        peak: Math.max(0, ...points.map((p) => p.value)),
      };
    }).sort((a, b) => {
      if (a.coreOrder !== b.coreOrder) return a.coreOrder - b.coreOrder;
      if (a.isResidentialService !== b.isResidentialService) return a.isResidentialService ? 1 : -1;
      return b.peak - a.peak || a.name.localeCompare(b.name, "vi");
    });
  }, [branchCross.branches, branchCross.matrix, waveWindowDates]);

  const marketWaveItems = useMemo(() => {
    if (!waveLatest) return [];
    return [
      { n: waveLatest.waitbuy || 0, c: DONUT_COLORS.waitBuy },
      { n: waveLatest.buy || 0, c: DONUT_COLORS.buy },
      { n: waveLatest.waitsell || 0, c: DONUT_COLORS.waitSell },
      { n: waveLatest.sell || 0, c: DONUT_COLORS.sell },
    ];
  }, [waveLatest]);
  const waveTotal = waveLatest?.total ?? marketWaveItems.reduce((sum, item) => sum + item.n, 0);

  const smdtBranchCore = branchSmdtRows.filter((row) => row.isCore);
  const smdtBranchOther = branchSmdtRows.filter((row) => !row.isCore);
  const tickerRows = rankedTopTickers.map((row) => ({ key: row.ticker, name: row.ticker, value: row.smdt, price: row.price, isCore: isCoreBranchName(row.industry) }));
  const sortTickerPreview = (rows) => [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const tickerCoreRows = sortTickerPreview(tickerRows.filter((row) => row.isCore));
  const tickerOtherRows = sortTickerPreview(tickerRows.filter((row) => !row.isCore));
  const signalLatestDate = latestStockSignalDate || stockSignalRows.find((row) => row.date)?.date || activeCashTickerDate;
  // Mỗi nhóm nhật ký gắn với feed sinh ra nó: ngày đang xem, phiên mới nhất feed có,
  // và mốc cập nhật thật — đủ để suy ra giờ mà không cần hằng số.
  const signalLogFeeds = useMemo(() => ({
    wave: { date: waveLatest?.date || "", latestDate: marketStockWave.rows[marketStockWave.rows.length - 1]?.date || stockWave.rows[stockWave.rows.length - 1]?.date || "", updatedAt: marketStockWave.updatedAt || stockWave.updatedAt },
    cashBranch: { date: cashBranchDate, latestDate: topDate(cashBranch.datesAsc), updatedAt: cashBranch.updatedAt },
    smdtBranch: { date: smdtBranchDate, latestDate: topDate(smdt.datesAsc), updatedAt: smdt.updatedAt },
    stockSignal: { date: latestStockSignalDate, latestDate: stockSignalDatesDesc[0] || "", updatedAt: stockSignal.updatedAt },
    smdtTicker: { date: smdtTickerDate, latestDate: topDate(smdtTicker.datesAsc), updatedAt: smdtTicker.updatedAt },
    cashTicker: { date: activeCashTickerDate, latestDate: cashTickerDatesDesc[0] || "", updatedAt: cashTicker.updatedAt },
  }), [
    activeCashTickerDate,
    cashBranch.datesAsc,
    cashBranch.updatedAt,
    cashBranchDate,
    cashTicker.updatedAt,
    cashTickerDatesDesc,
    latestStockSignalDate,
    marketStockWave.rows,
    marketStockWave.updatedAt,
    smdt.datesAsc,
    smdt.updatedAt,
    smdtBranchDate,
    smdtTicker.datesAsc,
    smdtTicker.updatedAt,
    smdtTickerDate,
    stockSignal.updatedAt,
    stockSignalDatesDesc,
    stockWave.rows,
    stockWave.updatedAt,
    waveLatest?.date,
  ]);
  const waveCircleLoading = marketStockWave.status === "loading" && !marketWaveLatest;
  const branchCashLoading = cashBranch.status === "loading" && !branchCashRows.length;
  const tickerCashLoading = cashTicker.status === "loading" && !cashTickerRows.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 14 }}>
        <CardDoSong
          data={marketWaveItems}
          maCount={waveTotal}
          reliability={waveLatest?.reliability ?? 0}
          dateLabel={waveLatest?.date ? fmtFull(waveLatest.date) : ""}
          onDetail={() => nav("dong-tien-tt")}
          loading={waveCircleLoading}
        />

        <DashboardCard onClick={() => nav("dong-tien-nganh")}>
          <DashHeader
            title="Dòng tiền ngành"
            meta={`${fmtNum(branchCashRows.length)} ngành${cashBranchDate ? ` · ${fmtFull(cashBranchDate)}` : ""}`}
            action="Chi tiết ›"
            onClick={() => nav("dong-tien-nganh")}
          />
          <SplitDonuts
            leftTitle="Chủ lực"
            rightTitle="Ngành phụ"
            leftItems={SIG_ORDER.map((sig) => ({ value: branchCashCounts.core[sig], color: DONUT_COLORS[sig] }))}
            rightItems={SIG_ORDER.map((sig) => ({ value: branchCashCounts.other[sig], color: DONUT_COLORS[sig] }))}
            loading={branchCashLoading}
          />
          <DotLegend square items={[
            { label: "Nhen nhóm", color: DONUT_COLORS.sn },
            { label: "Đổ vào", color: DONUT_COLORS.si },
            { label: "Đang thoát", color: DONUT_COLORS.so },
            { label: "Thoát ra", color: DONUT_COLORS.st },
          ]} />
        </DashboardCard>

        <DashboardCard onClick={() => nav("dong-tien-cp")}>
          <DashHeader title="Dòng tiền cổ phiếu" meta={`${fmtNum(cashTickerUniverse.length)} mã${activeCashTickerDate ? ` · ${fmtFull(activeCashTickerDate)}` : ""}`} action="Chi tiết ›" onClick={() => nav("dong-tien-cp")} />
          <SplitDonuts
            leftTitle="Chủ lực"
            rightTitle="Phụ"
            leftItems={SIG_ORDER.map((sig) => ({ value: cashTickerCounts.core[sig], color: DONUT_COLORS[sig] }))}
            rightItems={SIG_ORDER.map((sig) => ({ value: cashTickerCounts.other[sig], color: DONUT_COLORS[sig] }))}
            loading={tickerCashLoading}
          />
          <DotLegend square items={[
            { label: "Nhen nhóm", color: DONUT_COLORS.sn },
            { label: "Đổ vào", color: DONUT_COLORS.si },
            { label: "Đang thoát", color: DONUT_COLORS.so },
            { label: "Thoát ra", color: DONUT_COLORS.st },
          ]} />
        </DashboardCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(440px, 100%), 1fr))", gap: 14 }}>
        <SmdtPreview
          title="SMDT ngành"
          meta={`${fmtNum(branchSmdtRows.length)} ngành${smdtBranchDate ? ` · ${fmtFull(smdtBranchDate)}` : ""}`}
          leftRows={smdtBranchCore}
          rightRows={smdtBranchOther}
          defaultTab="other"
          navId="smdt-nganh"
          rowNameColor="var(--t2)"
        />
        <SmdtPreview
          title="SMDT cổ phiếu"
          meta={`${fmtNum(smdtTickerUniverse.length)} mã${smdtTickerDate ? ` · ${fmtFull(smdtTickerDate)}` : ""}`}
          leftRows={tickerCoreRows}
          rightRows={tickerOtherRows}
          defaultTab="core"
          navId="smdt-ma"
          showPrice
          showTabs={false}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(440px, 100%), 1fr))", gap: 14 }}>
        <TopStrongTable rows={rankedStrongTickers} date={smdtTickerDate} narrow={narrow} />
        <PortfolioBox rows={rankedTopTickers} asOfDate={smdtTickerDate} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(440px, 100%), 1fr))", gap: 14 }}>
        <WaveTimeline events={waveEvents} recentDates={waveWindowDates} narrow={narrow} />
        <SignalPortfolio rows={stockSignalRows} date={signalLatestDate} live={live} />
      </div>

      <SignalLog
        topRows={rankedTopTickers}
        branchRows={branchCashRows}
        smdtBranchRows={branchSmdtRows}
        cashTickerRows={cashTickerRows.map((row) => ({ ...row, date: activeCashTickerDate }))}
        stockSignalRows={stockSignalRows}
        waveRows={waveLatest ? [waveLatest] : []}
        feeds={signalLogFeeds}
        notificationRows={stockNoti.rows}
        narrow={narrow}
      />

      <LiveFooter live={live} updatedAt={updatedAt} extra="Dashboard tổng hợp" />
    </div>
  );
}
