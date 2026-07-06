import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../theme";
import { mono, sigStyle } from "../../styles/tokens";
import { useNarrow } from "../../app/useNarrow";
import { fmtFull, fmtNum } from "../../app/formatters";
import { CORE_BRANCHES, useSMDT, useRealtimeFeed as useRealtimeSMDTBranchFeed } from "../../data/useSMDT";
import { useCashFlowBranch, useRealtimeCashFlowFeed, contentToSig } from "../../data/useCashFlowBranch";
import { useSMDTTicker, useRealtimeSMDTTickerFeed } from "../../data/useSMDTTicker";
import { useCashFlowTicker, useRealtimeCashFlowTickerFeed, tickerContentToSig } from "../../data/useCashFlowTicker";
import { useBranchPath } from "../../data/useBranchPath";
import { useRealtimeSMDTBranchCrossFeed, useSMDTBranchCross } from "../../data/useSMDTCross";
import { useRealtimeStockSignalFeed, useStockSignal } from "../../data/useStockSignal";
import { useStockWave, useRealtimeStockWaveFeed } from "../../data/useStockWave";
import { useTotalTrade } from "../../data/useTotalTrade";
import { Card, Clink, LiveFooter, Loading, Pagination } from "../../components/ui";
import { PORTFOLIO_MAX_CODES, loadSavedPortfolio, parsePortfolioCodes, savePortfolioState } from "../portfolio-analysis/portfolioState";
import { evaluateFourKey, fallbackEvalKey, scorePortfolio4Key, seriesFromMatrix } from "../portfolio-analysis/stock4KeyEvaluator";
import { isCashFlowCoreIndustry } from "../cash-flow-ticker/cashFlowUtils";
import CardDoSong from "./CardDoSong";

const SIG_ORDER = ["sn", "si", "so", "st"];
const CORE_KEYS = new Set(CORE_BRANCHES.map((b) => b.key));
const CORE_LABELS = new Set(CORE_BRANCHES.flatMap((b) => [b.key, b.label]));
const TOP_LIMIT = 40;
const PAGE_SIZE = 8;
const SIGNAL_PORTFOLIO_PAGE_SIZE = 5;
const PORTFOLIO_CHAT_API_URL = import.meta.env.VITE_PORTFOLIO_CHAT_API_URL || "";
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
const WAVE_CORE_BRANCH_NAMES = ["Ngân hàng", "Chứng khoán", "BĐS Dân cư", "Thép", "Xây dựng", "Sóng ngành Vin"];
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

function TopStatusBadge({ status }) {
  const meta = TOP_STATUS_META[status] || TOP_STATUS_META.tn;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 72, color: meta.color, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
      <i className={`ti ${meta.icon}`} style={{ fontSize: 11 }} />
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

function isWaveCoreBranchName(name) {
  const coreNames = new Set(WAVE_CORE_BRANCH_NAMES.flatMap((item) => aliasesOfIndustry(item)).map(normalizeIndustryName));
  return aliasesOfIndustry(name).some((alias) => coreNames.has(normalizeIndustryName(alias)));
}

function getLatestTrade(totalTrade, ticker) {
  const row = totalTrade.matrix[ticker] || {};
  const date = Object.keys(row).sort().at(-1);
  return date ? row[date] : null;
}

function EmptyHint({ children }) {
  if (!children) return <Loading label="Đang tải dữ liệu…" rows={2} pillHeight={38} style={{ margin: "4px 0 6px" }} />;
  return <div style={{ padding: 18, textAlign: "center", color: "var(--t3)", fontSize: 11 }}>{children}</div>;
}

function DashHeader({ title, meta, action, onClick }) {
  return (
    <div style={{ width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>{title}</div>
        {meta && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
      </div>
      {action && <Clink onClick={onClick}>{action}</Clink>}
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

function SplitDonuts({ leftTitle, rightTitle, leftItems, rightItems }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", width: "100%", gap: 8 }}>
      <MiniDonut title={leftTitle} items={leftItems} />
      <div style={{ width: 1, background: "var(--bdr)", height: 100 }} />
      <MiniDonut title={rightTitle} items={rightItems} />
    </div>
  );
}

function MiniDonut({ title, items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)" }}>{title}</div>
      <Donut items={items} size={130} />
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

function SmdtTabs({ active, onChange }) {
  const { dark } = useTheme();
  const tabStyle = (selected, tone = "neutral") => {
    const purple = tone === "purple";
    return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 999,
    border: selected ? `0.5px solid ${purple ? "var(--B)" : dark ? "rgba(80,95,125,.55)" : "var(--bdr)"}` : "0.5px solid transparent",
    background: selected ? (purple ? "rgba(124,58,237,.12)" : dark ? "#101522" : "var(--surf)") : "transparent",
    color: selected ? (purple ? "var(--B)" : "var(--t1)") : "var(--t3)",
    fontSize: 10.5,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: selected ? (dark ? "0 1px 0 rgba(255,255,255,.06) inset, 0 1px 6px rgba(0,0,0,.25)" : "0 1px 4px rgba(15,23,42,.08)") : "none",
    };
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: 3, borderRadius: 8, background: dark ? "#151B2C" : "var(--elev)", border: `0.5px solid ${dark ? "rgba(27,32,48,.75)" : "var(--bdr)"}`, maxWidth: "100%" }}>
      <button type="button" aria-pressed={active === "core"} onClick={(event) => { event.stopPropagation(); onChange("core"); }} style={tabStyle(active === "core", "purple")}>
        ⭐ Chủ lực
      </button>
      <button type="button" aria-pressed={active === "other"} onClick={(event) => { event.stopPropagation(); onChange("other"); }} style={tabStyle(active === "other", "purple")}>
        Ngành phụ
      </button>
    </div>
  );
}

function SmdtPreviewSectionLabel({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 0" }}>
      <span style={{ fontSize: 9, fontWeight: 850, color: "var(--t4)", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--bdr)" }} />
    </div>
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

function SmdtPreview({ title, meta, leftTitle, rightTitle, leftRows, rightRows, defaultTab = "core", navId }) {
  const [tab, setTab] = useState(defaultTab);
  const rows = tab === "core" ? leftRows : rightRows;
  const displayRows = rows.length ? [...rows, ...Array.from({ length: Math.max(0, 10 - rows.length) }, (_, index) => ({ key: `placeholder-${index}`, placeholder: true }))] : [];
  const sectionTitle = tab === "core" ? leftTitle : rightTitle;

  return (
    <Card style={{ padding: "15px 16px", display: "flex", flexDirection: "column", gap: 7, cursor: "pointer", minWidth: 0, alignSelf: "start" }} onClick={() => nav(navId)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>{title}</h3>
          {meta && <div style={{ marginTop: 2, fontSize: 10, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
        </div>
        <Clink onClick={() => nav(navId)}>Chi tiết ›</Clink>
      </div>

      <SmdtTabs active={tab} onChange={setTab} />
      <SmdtPreviewSectionLabel>{sectionTitle}</SmdtPreviewSectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", columnGap: 18, alignContent: "start" }}>
        {displayRows.length ? displayRows.map((row) => (
          <div key={row.key} aria-hidden={row.placeholder || undefined} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, minHeight: 36, padding: "2px 0", borderBottom: `0.5px solid ${row.placeholder ? "transparent" : "var(--bdr)"}` }}>
            {!row.placeholder && (
              <>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--t1)", fontSize: 11, fontWeight: 700 }}>
                  {row.name}
                </span>
                <SmdtScoreBadge value={row.value} />
              </>
            )}
          </div>
        )) : (
          <div style={{ gridColumn: "1 / -1" }}><EmptyHint /></div>
        )}
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

function ChipButton({ children, active, tone = "B", onClick }) {
  const color = tone === "G" ? "#0ca30c" : tone === "R" ? "#e34948" : "var(--B)";
  return (
    <button
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
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: narrow ? 520 : 0 }}>
          <thead>
            <tr style={{ background: "var(--elev)" }}>
              {["Mã", "Giá", "TH cổ phiếu", "TH ngành", "T.thái"].map((h, i) => (
                <th key={h} style={{ padding: i === 0 ? "5px 10px" : "5px 8px", textAlign: i === 1 ? "right" : "left", fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", borderBottom: "0.5px solid var(--bdr)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.ticker} onClick={() => nav("top-ma-manh")} style={{ borderBottom: "0.5px solid var(--bdrs)", cursor: "pointer" }}>
                <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>{row.ticker}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 650, color: "var(--t1)", ...mono }}>{row.price ? fmtNum(row.price) : "—"}</td>
                <td style={{ padding: "6px 8px" }}><SignalPill sig={row.tickerSig} /></td>
                <td style={{ padding: "6px 8px" }}><SignalPill sig={row.branchSig} /></td>
                <td style={{ padding: "6px 8px" }}><TopStatusBadge status={row.status} /></td>
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

function PortfolioMsgText({ text }) {
  return (
    <>
      {String(text || "").split("\n").map((line, index) => (
        <span key={`${line}-${index}`}>
          {line}
          {index < String(text || "").split("\n").length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function PortfolioMsgBubble({ role, text, panel = false }) {
  const isAi = role === "ai" || role === "typing";
  const isTyping = role === "typing";
  return (
    <div style={{ width: "100%", minWidth: 0, display: "flex", gap: 7, alignItems: "flex-start", justifyContent: isAi ? "flex-start" : "flex-end" }}>
      {isAi && (
        <span style={{ width: panel ? 28 : 22, height: panel ? 28 : 22, borderRadius: 999, background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: panel ? 12 : 10, fontWeight: 850, flexShrink: 0 }}>
          AI
        </span>
      )}
      <div style={{ maxWidth: panel && isAi ? "calc(100% - 35px)" : isAi ? "82%" : panel ? "86%" : "78%", minWidth: 0, borderRadius: isAi ? "8px 8px 8px 3px" : "8px 8px 3px 8px", padding: panel ? "9px 11px" : "7px 9px", background: isAi ? "var(--elev)" : "var(--Bs)", border: `0.5px solid ${isAi ? "var(--bdr)" : "var(--Bb)"}`, color: isAi ? "var(--t2)" : "var(--t1)", fontSize: panel ? 12 : 11, lineHeight: 1.5, overflowWrap: "anywhere", opacity: isTyping ? 0.78 : 1 }}>
        {isTyping ? <Loading compact label={text} style={{ marginBottom: 0 }} /> : <PortfolioMsgText text={text} />}
      </div>
    </div>
  );
}

function portfolioAutoMessage({ score, counts, total, analyzed }) {
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

function portfolioAiReply(question, ctx) {
  if (!ctx.hasAnalysis) return "Bạn nhập danh sách mã rồi bấm Phân tích trước nhé. Sau đó mình sẽ đọc danh mục và gợi ý cụ thể hơn.";

  const q = normalizeIndustryName(question);
  const byCat = (cat) => ctx.analyzed.filter((row) => row.cat === cat);
  const fmtRow = (row) => `${row.ticker}: SMDT mã ${Number.isFinite(row.smdt) ? row.smdt.toFixed(1) : "--"} · ngành ${row.industry || "--"}${Number.isFinite(row.branchSmdt) ? ` ${row.branchSmdt.toFixed(1)}` : ""}`;

  if (q.includes("đúng sóng") || q.includes("dung song")) {
    const rows = byCat("dd");
    if (!rows.length) return "Chưa có mã nào đúng cả sóng lẫn ngành. Ưu tiên cơ cấu sang mã có SMDT mã >=70 và ngành cũng đang dẫn.";
    return `Mã đúng sóng đúng ngành:\n${rows.map((row) => `• ${fmtRow(row)}`).join("\n")}`;
  }

  if (q.includes("cắt") || q.includes("cat") || q.includes("giảm") || q.includes("giam")) {
    const rows = byCat("ss");
    if (!rows.length) return "Chưa có mã cần cắt ngay theo bộ lọc sai sóng sai ngành. Vẫn nên theo dõi nếu SMDT mã tụt dưới 30 hoặc dòng tiền chuyển thoát ra.";
    return `Nhóm cần xem xét giảm/cắt:\n${rows.map((row) => `• ${fmtRow(row)}`).join("\n")}\n\nGợi ý: giảm trước nhóm SMDT thấp và không thuộc ngành dẫn.`;
  }

  if (q.includes("ngành") || q.includes("nganh")) {
    const industries = [...new Map(ctx.analyzed.filter((row) => Number.isFinite(row.branchSmdt)).sort((a, b) => b.branchSmdt - a.branchSmdt).map((row) => [row.industry, row])).values()].slice(0, 5);
    if (!industries.length) return "Chưa đủ dữ liệu SMDT ngành cho danh mục này.";
    return `Ngành nổi bật trong danh mục:\n${industries.map((row) => `• ${row.industry}: SMDT ngành ${row.branchSmdt.toFixed(1)} · mã ${row.ticker}`).join("\n")}`;
  }

  if (q.includes("tỷ trọng") || q.includes("ty trong") || q.includes("phân bổ") || q.includes("phan bo")) {
    return `Gợi ý phân bổ:\n• Nhóm đúng sóng đúng ngành: ${ctx.counts.dd} mã, có thể giữ/tăng tỷ trọng.\n• Nhóm đúng sóng sai ngành: ${ctx.counts.ds} mã, chỉ giữ tỷ trọng vừa phải.\n• Nhóm sai sóng sai ngành: ${ctx.counts.ss} mã, ưu tiên giảm.\n\nĐiểm danh mục hiện tại: ${ctx.score}/100.`;
  }

  if (q.includes("so sánh") || q.includes("so sanh")) {
    const labels = { dd: "Đúng sóng đúng ngành", ds: "Đúng sóng sai ngành", sd: "Đúng ngành sai sóng", ss: "Sai sóng sai ngành" };
    return `So sánh nhanh:\n${ctx.analyzed.map((row) => `• ${row.ticker}: ${labels[row.cat]} · SMDT ${Number.isFinite(row.smdt) ? row.smdt.toFixed(1) : "--"}`).join("\n")}`;
  }

  return portfolioAutoMessage(ctx);
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
  const [msgs, setMsgs] = useState([
    { role: "ai", text: "Nhập mã và bấm Phân tích, sau đó hỏi tôi về mã đúng sóng, ngành dẫn dắt, mã nên cắt hoặc phân bổ tỷ trọng." },
  ]);
  const panelRef = useRef(null);
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
  const portfolioPayload = useMemo(() => ({
    asOfDate: toDateInputValue(asOfDate) || asOfDate || "",
    positions: analyzed
      .filter((row) => Number.isFinite(row.smdt) || Number.isFinite(row.branchSmdt))
      .map((row) => ({
        ticker: row.ticker,
        industry: row.industry || "",
        smdt: apiNumber(row.smdt),
        smdtPrev: apiNumber(row.smdtPrev),
        branchSmdt: apiNumber(row.branchSmdt),
        branchSmdtPrev: apiNumber(row.branchSmdtPrev),
      })),
  }), [analyzed, asOfDate]);
  const aiMessage = hasAnalysis ? portfolioAutoMessage(portfolioCtx) : "";
  const cats = [
    { key: "dd", color: "#0ca30c", label: "Đúng sóng - đúng ngành" },
    { key: "ds", color: "#eda100", label: "Đúng sóng - sai ngành" },
    { key: "sd", color: "#9b7cf7", label: "Đúng ngành - sai sóng" },
    { key: "ss", color: "#e34948", label: "Sai sóng - sai ngành" },
  ];

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight;
  }, [msgs, chatOpen]);

  useEffect(() => {
    if (!chatOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen]);

  const updateInput = (value) => {
    setInput(value);
    savePortfolioState(value, analyzedCodes);
  };
  const analyzePortfolio = () => {
    if (!picks.length) return;
    setAnalyzedCodes(picks);
    savePortfolioState(input, picks);
    const nextAnalyzed = picks.map((ticker) => {
      const row = rowMap.get(ticker);
      const found = Boolean(row && Number.isFinite(row.smdt));
      const evalKey = found ? calcPortfolioEval(row) : null;
      const cat = found ? evalKeyToPortfolioCat(evalKey) : "ss";
      return { ticker, found, cat, evalKey, industry: row?.industry || "", smdt: row?.smdt, smdtPrev: row?.prevSmdt, branchSmdt: row?.branchSmdt, branchSmdtPrev: row?.branchSmdtPrev, tickerSig: row?.tickerSig || row?.sig, branchSig: row?.branchSig };
    });
    const nextFoundAnalyzed = nextAnalyzed.filter((row) => row.found);
    const nextRawScore = scorePortfolio4Key(nextFoundAnalyzed);
    const nextCounts = { dd: nextRawScore.dn, ds: nextRawScore.sn, sd: nextRawScore.ns, ss: nextRawScore.ss };
    const nextTotal = Math.max(1, nextFoundAnalyzed.length);
    const nextScore = nextFoundAnalyzed.length ? nextRawScore.score : 0;
    setMsgs((prev) => [...prev, { role: "ai", text: portfolioAutoMessage({ hasAnalysis: true, analyzed: nextFoundAnalyzed, counts: nextCounts, total: nextTotal, score: nextScore }) }]);
  };
  const openPortfolioDetail = () => {
    if (!hasAnalysis) return;
    savePortfolioState(input, analyzedCodes);
    nav("portfolio-analysis");
  };
  const sendPortfolioMsg = useCallback(async (text, panel = false) => {
    const question = text.trim();
    if (!question || chatLoading) return;
    if (panel) setPanelVal("");
    setChatOpen(true);
    setChatLoading(true);
    setMsgs((prev) => [...prev, { role: "user", text: question }, { role: "typing", text: "Đang phân tích dữ liệu danh mục..." }]);

    try {
      if (!PORTFOLIO_CHAT_API_URL) throw new Error("thiếu VITE_PORTFOLIO_CHAT_API_URL");
      const response = await fetch(PORTFOLIO_CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          user_id: "u1",
          conversation_id: conversationId,
          portfolio: portfolioPayload,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.conversation_id) setConversationId(data.conversation_id);
      const answer = data?.answer || portfolioAiReply(question, portfolioCtx);
      setMsgs((prev) => [...prev.filter((msg) => msg.role !== "typing"), { role: "ai", text: answer }]);
    } catch (error) {
      const fallback = portfolioAiReply(question, portfolioCtx);
      setMsgs((prev) => [
        ...prev.filter((msg) => msg.role !== "typing"),
        { role: "ai", text: `Chưa gọi được API Chat AI${error?.message ? ` (${error.message})` : ""}. Tạm dùng phân tích nội bộ:\n${fallback}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, conversationId, portfolioCtx, portfolioPayload]);
  const askPortfolioMsg = useCallback((text) => {
    sendPortfolioMsg(text, true);
  }, [sendPortfolioMsg]);

  return (
    <>
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
            style={{ flex: 1, minWidth: 0, padding: "7px 11px", borderRadius: 7, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t1)", fontSize: 11, outline: "none" }}
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
                <span style={{ fontSize: 9, fontWeight: 750, color: "#9b7cf7" }}>✦ AI </span>
                {aiMessage}
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
              <span style={{ width: 5, height: 5, borderRadius: 999, background: chatLoading ? "var(--A)" : "var(--G)" }} />
              {chatLoading ? "Đang hỏi" : "Sẵn sàng"}
            </span>
            <button type="button" onClick={() => setChatOpen(true)} style={{ border: "0.5px solid var(--bdr)", background: "var(--surf)", color: "var(--B)", borderRadius: 7, padding: "4px 8px", fontSize: 10, fontWeight: 750, cursor: "pointer", whiteSpace: "nowrap" }}>
              ↗ Mở rộng
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["Mã nào đúng sóng?", "Ngành nào dẫn dắt?", "Nên cắt mã nào?", "Phân bổ tỷ trọng?"].map((text) => (
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

      {chatOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.52)", backdropFilter: "blur(2px)", zIndex: 900 }} onClick={() => setChatOpen(false)} />
          <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: narrow ? "100vw" : "min(460px,96vw)", maxWidth: "100vw", boxSizing: "border-box", overflowX: "hidden", background: "var(--surf)", borderLeft: narrow ? "none" : "0.5px solid var(--bdr)", zIndex: 901, display: "flex", flexDirection: "column", boxShadow: narrow ? "none" : "-24px 0 70px rgba(0,0,0,.35)" }}>
            <div style={{ padding: narrow ? "12px 14px" : "14px 16px", borderBottom: "0.5px solid var(--bdr)", background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 850, flexShrink: 0 }}>✦</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Tư vấn AI danh mục</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hỏi về danh mục, sóng ngành, chiến lược</div>
                </div>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: "0.5px solid var(--bdr)", background: "var(--surf)", color: "var(--t2)", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>
                ×
              </button>
            </div>

            {hasAnalysis && (
              <div style={{ margin: narrow ? "10px 14px 0" : "12px 16px 0", background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 9, padding: "10px 12px", flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 7, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em" }}>Danh mục đang phân tích</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {analyzed.map((row) => {
                    const cat = cats.find((item) => item.key === row.cat);
                    return (
                      <span key={row.ticker} style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 5, background: `${cat?.color || "var(--t3)"}20`, color: cat?.color || "var(--t3)", border: `0.5px solid ${cat?.color || "var(--bdr)"}44` }}>
                        {row.ticker}
                      </span>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 850, color: score >= 70 ? "#0ca30c" : score >= 50 ? "#eda100" : "#e34948", ...mono }}>{score}/100</span>
                  <span style={{ flex: "1 1 180px", minWidth: 0, fontSize: 10, color: "var(--t3)", overflowWrap: "anywhere" }}>{counts.dd} đúng sóng đúng ngành · {counts.ss} sai sóng sai ngành</span>
                </div>
              </div>
            )}

            <div ref={panelRef} style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 10, padding: narrow ? "12px 14px" : "14px 16px" }}>
              {msgs.map((msg, index) => (
                <PortfolioMsgBubble key={`panel-${msg.role}-${index}-${msg.text}`} role={msg.role} text={msg.text} panel />
              ))}
            </div>

            <div style={{ padding: narrow ? "9px 14px" : "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: "0.5px solid var(--bdr)", minWidth: 0 }}>
              {["Mã nào đúng sóng đúng ngành?", "Ngành nào đang dẫn dắt?", "Nên cắt mã nào?", "Phân bổ tỷ trọng 3-5-2?", "So sánh các mã?"].map((text) => (
                <button key={text} type="button" onClick={() => sendPortfolioMsg(text, true)} disabled={chatLoading} style={{ border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t2)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 650, cursor: chatLoading ? "not-allowed" : "pointer", opacity: chatLoading ? 0.55 : 1 }}>
                  {text}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, padding: narrow ? "10px 14px calc(10px + env(safe-area-inset-bottom))" : "12px 16px", borderTop: "0.5px solid var(--bdr)", alignItems: "flex-end", minWidth: 0 }}>
              <textarea
                autoFocus
                rows={1}
                value={panelVal}
                onChange={(event) => setPanelVal(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendPortfolioMsg(panelVal, true);
                  }
                }}
                placeholder="Hỏi bất cứ điều gì về danh mục..."
                style={{ flex: 1, minWidth: 0, minHeight: 36, maxHeight: 90, resize: "none", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t1)", fontSize: 12, lineHeight: 1.5, outline: "none", fontFamily: "inherit" }}
              />
              <button type="button" onClick={() => sendPortfolioMsg(panelVal, true)} disabled={chatLoading || !panelVal.trim()} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "var(--B)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: chatLoading || !panelVal.trim() ? "not-allowed" : "pointer", opacity: chatLoading || !panelVal.trim() ? 0.55 : 1, flexShrink: 0 }}>
                ➤
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

const WAVE_PALETTE = ["#7C3AED", "#06B6D4", "#FF9F0A", "#FF2D55", "#14B8A6", "#F59E0B", "#EC4899", "#8B5CF6", "#3DD68C", "#84CC16", "#F97316", "#A78BFA", "#6366F1", "#0EA5E9", "#22C55E", "#64748B", "#0891B2", "#DC2626"];
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
  const colorByKey = useMemo(() => {
    const map = new Map();
    events.forEach((event, index) => map.set(event.key, WAVE_PALETTE[index % WAVE_PALETTE.length]));
    return map;
  }, [events]);

  const filtered = useMemo(() => {
    return events
      .filter((event) => (mode === "core" ? event.isCore : !event.isCore))
      .sort((a, b) => (b.points.at(-1)?.date || "").localeCompare(a.points.at(-1)?.date || ""));
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
          const color = colorByKey.get(event.key) || "#7C3AED";
          const lastPoint = event.points.at(-1);
          const isActive = Boolean(recentCut && lastPoint && lastPoint.date >= recentCut);
          return (
            <div key={event.key} style={{ display: "flex", alignItems: "center", minHeight: WAVE_ROW_HEIGHT, borderBottom: "0.5px solid var(--bdrs)", cursor: "pointer", background: isActive ? "rgba(124,58,237,.04)" : undefined }} onClick={() => nav("lo-trinh-dan-song")}>
              <div style={{ width: nameWidth, flexShrink: 0, fontSize: 10, fontWeight: event.isCore ? 750 : 550, padding: "0 8px", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderRight: "0.5px solid var(--bdr)", color: event.isCore ? "#F59E0B" : "var(--t2)" }} title={event.name}>{event.name}</div>
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

function SmdtBarCell({ value }) {
  if (!Number.isFinite(value)) return <span style={{ color: "var(--t4)" }}>—</span>;
  const tone = smdtChipTone(value);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 62, padding: "4px 8px", borderRadius: 7, background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", ...mono }}>
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
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11, minWidth: 500 }}>
          <colgroup>
            {cols.map((col) => <col key={col.label} style={{ width: col.width }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: "var(--elev)" }}>
              {cols.map((col, i) => (
                <th key={col.label} style={{ padding: i === 0 ? "6px 12px" : "6px 8px", fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", borderBottom: "0.5px solid var(--bdr)", textAlign: col.align, whiteSpace: "nowrap" }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.ticker}-${row.date}`} style={{ borderBottom: "0.5px solid var(--bdrs)" }}>
                <td style={{ padding: "7px 12px", fontWeight: 800, color: "var(--t1)" }}>{row.ticker}</td>
                <td style={{ padding: "7px 8px", textAlign: "center" }}><SignalPill compact sig={row.cashSig || signalToSig(row.signal)} /></td>
                <td style={{ padding: "7px 8px", textAlign: "center" }}><SmdtBarCell value={row.smdt} /></td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 650, color: "var(--t1)", ...mono }}>{Number.isFinite(row.price) ? fmtNum(row.price) : "—"}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--t2)", ...mono }}>{Number.isFinite(row.ave) ? fmtNum(row.ave) : "—"}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}><PnlCell price={row.price} ave={row.ave} /></td>
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

const LOG_TONES = {
  mua: { color: "#0ca30c", bg: "rgba(12,163,12,.12)", icon: "ti-trending-up" },
  ban: { color: "#e34948", bg: "rgba(227,73,72,.12)", icon: "ti-trending-down" },
  smdt: { color: "#9b7cf7", bg: "rgba(124,58,237,.12)", icon: "ti-bolt" },
  dv: { color: "#0ca30c", bg: "rgba(12,163,12,.12)", icon: "ti-trending-up" },
  nn: { color: "#1baf7a", bg: "rgba(27,175,122,.12)", icon: "ti-trending-up" },
  dt: { color: "#eda100", bg: "rgba(237,161,0,.12)", icon: "ti-trending-down" },
  tr: { color: "#e34948", bg: "rgba(227,73,72,.12)", icon: "ti-trending-down" },
  song: { color: "#06B6D4", bg: "rgba(6,182,212,.12)", icon: "ti-wave-sine" },
};

function logToneForSig(sig) {
  return { si: "dv", sn: "nn", so: "dt", st: "tr" }[sig] || "tr";
}

function SignalLog({ topRows, branchRows, stockSignalRows, waveRows }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const logs = useMemo(() => {
    const items = [];
    for (const row of stockSignalRows.filter((item) => item.signal === "MUA" || item.signal === "BAN").slice(0, 14)) {
      items.push({ kind: "ma", type: row.signal === "MUA" ? "mua" : "ban", time: row.date ? fmtFull(row.date) : "Live", title: row.ticker, tag: row.signal === "MUA" ? "MUA" : "BÁN", sub: `${row.signal === "MUA" ? "Tín hiệu mua" : "Tín hiệu bán"}${row.percent != null ? ` ${row.percent}%` : ""}${Number.isFinite(row.price) ? ` · Giá ${fmtNum(row.price)}` : ""}` });
    }
    for (const row of topRows.slice(0, 8)) {
      items.push({ kind: "ma", type: "smdt", time: "SMDT", title: row.ticker, tag: "SMDT", sub: `${row.industry} · SMDT đạt ${row.smdt.toFixed(1)}% · ${sigLabel(row.sig)}` });
    }
    for (const row of branchRows.slice(0, 8)) {
      items.push({ kind: "ng", type: logToneForSig(row.sig), time: "Ngành", title: row.label, tag: sigLabel(row.sig), sub: `Dòng tiền ngành đang ở trạng thái ${sigLabel(row.sig).toLowerCase()}` });
    }
    for (const row of [...waveRows].slice(-2).reverse()) {
      items.push({
        kind: "tt",
        type: "song",
        time: row.date ? fmtFull(row.date) : "—",
        title: "Thị trường",
        tag: "Dò sóng",
        sub: `${fmtNum(row.total ?? (row.waitbuy || 0) + (row.buy || 0) + (row.waitsell || 0) + (row.sell || 0))} mã · Chờ mua ${fmtNum(row.waitbuy || 0)} · Mua ${fmtNum(row.buy || 0)} · Chờ bán ${fmtNum(row.waitsell || 0)} · Bán ${fmtNum(row.sell || 0)}${Number.isFinite(row.reliability) ? ` · Tin cậy ${fmtNum(row.reliability)}%` : ""}`,
      });
    }
    return items.filter((item) => filter === "all" || item.kind === filter);
  }, [branchRows, filter, stockSignalRows, topRows, waveRows]);

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const switchFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  return (
    <Card noPad style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 750, color: "var(--t1)" }}>Nhật ký tín hiệu</span>
          <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: 8 }}>Sóng thị trường · Ngành · Mã</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <ChipButton active={filter === "all"} onClick={() => switchFilter("all")}>Tất cả</ChipButton>
          <ChipButton active={filter === "ma"} onClick={() => switchFilter("ma")}>Mã</ChipButton>
          <ChipButton active={filter === "ng"} onClick={() => switchFilter("ng")}>Ngành</ChipButton>
          <ChipButton active={filter === "tt"} onClick={() => switchFilter("tt")}>Thị trường</ChipButton>
        </div>
      </div>
      <div>
        {visible.map((item, index) => {
          const tone = LOG_TONES[item.type] || LOG_TONES.tr;
          return (
            <div key={`${item.title}-${item.tag}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 14px", borderBottom: "0.5px solid var(--bdrs)" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, background: tone.bg, color: tone.color }}>
                <i className={`ti ${item.kind === "ng" ? "ti-building-community" : tone.icon}`} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 650, color: "var(--t1)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {item.title}
                  <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap", color: tone.color, background: tone.bg, border: `0.5px solid ${tone.color}33` }}>{item.tag}</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, lineHeight: 1.5 }}>{item.sub}</div>
              </div>
              <div style={{ fontSize: 10, color: "var(--t4)", whiteSpace: "nowrap" }}>{item.time}</div>
            </div>
          );
        })}
        {!visible.length && <EmptyHint />}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 14px", borderTop: "0.5px solid var(--bdr)", marginTop: "auto", gap: 8 }}>
        <span style={{ fontSize: 10, color: "var(--t3)" }}>{logs.length ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, logs.length)} / ${logs.length} tín hiệu` : "0 tín hiệu"}</span>
        <Pagination compact page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>
    </Card>
  );
}

export function ModDashboard() {
  const narrow = useNarrow();
  const smdt = useSMDT();
  const cashBranch = useCashFlowBranch();
  const smdtTicker = useSMDTTicker();
  const cashTicker = useCashFlowTicker();
  const branchPath = useBranchPath();
  const branchCross = useSMDTBranchCross();
  const stockSignal = useStockSignal();
  const stockWave = useStockWave();
  const totalTrade = useTotalTrade();

  const liveSmdtBranch = useRealtimeSMDTBranchFeed(smdt.applyTick);
  const liveCashBranch = useRealtimeCashFlowFeed(cashBranch.applyTick);
  const liveSmdtTicker = useRealtimeSMDTTickerFeed(smdtTicker.applyTick);
  const liveCashTicker = useRealtimeCashFlowTickerFeed(cashTicker.applyTick);
  const liveStockSignal = useRealtimeStockSignalFeed(stockSignal.applyTick);
  const liveStockWave = useRealtimeStockWaveFeed(stockWave.applyTick);
  const liveBranchCross = useRealtimeSMDTBranchCrossFeed(branchCross.applyTick);

  const smdtBranchDate = topDate(smdt.datesAsc);
  const cashBranchDate = topDate(cashBranch.datesAsc);
  const smdtBranchDatesDesc = useMemo(() => sortDatesDesc(smdt.datesAsc), [smdt.datesAsc]);
  const smdtBranchDateIndex = useMemo(() => findDateIndex(smdtBranchDatesDesc, toDateInputValue(smdtBranchDate)), [smdtBranchDate, smdtBranchDatesDesc]);
  const prevSmdtBranchDate = smdtBranchDateIndex >= 0 ? smdtBranchDatesDesc[smdtBranchDateIndex + 1] || "" : "";
  const cashBranchDatesDesc = useMemo(() => sortDatesDesc(cashBranch.datesAsc), [cashBranch.datesAsc]);
  const smdtTickerDate = topDate(smdtTicker.datesAsc);
  const updatedAt = latestUpdatedAt(smdt.updatedAt, cashBranch.updatedAt, smdtTicker.updatedAt, cashTicker.updatedAt, stockSignal.updatedAt, stockWave.updatedAt, branchCross.updatedAt, totalTrade.updatedAt);
  const live =
    liveSmdtBranch.connected ||
    liveCashBranch.connected ||
    liveSmdtTicker.connected ||
    liveCashTicker.connected ||
    liveStockSignal.connected ||
    liveStockWave.connected ||
    liveBranchCross.connected;
  const waveLatest = stockWave.rows[stockWave.rows.length - 1] || null;

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
  const smdtTickerPool = useMemo(() => {
    return smdtTicker.tickers
      .flatMap((tk) => {
        const industry = branchPath.tickerToBranch[tk.key];
        return industry ? [{ ...tk, industry }] : [];
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [branchPath.tickerToBranch, smdtTicker.tickers]);

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
  const smdtTickerDatesDesc = useMemo(() => sortDatesDesc(smdtTicker.datesAsc), [smdtTicker.datesAsc]);
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
      const trade = getLatestTrade(totalTrade, tk.key);
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

  const latestStockSignalDate = useMemo(() => {
    const dates = stockSignal.rows.flatMap((row) => {
      const points = Array.isArray(row.points) ? row.points : [];
      return points.length ? points.map((point) => point.date).filter(Boolean) : [row.date].filter(Boolean);
    });
    return sortDatesDesc(dates)[0] || "";
  }, [stockSignal.rows]);

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
    const lastDate = branchCross.datesAsc.at(-1);
    if (!lastDate) return [];
    const yearStart = `${lastDate.slice(0, 4)}-01-01`;
    return branchCross.datesAsc.filter((date) => date >= yearStart);
  }, [branchCross.datesAsc]);

  const waveEvents = useMemo(() => {
    const windowStart = waveWindowDates[0] || "";
    return branchCross.branches.map((branch) => {
      const row = branchCross.matrix[branch.key] || {};
      const points = Object.keys(row)
        .filter((date) => date >= windowStart)
        .sort()
        .map((date) => ({ date, value: toNumber(row[date]) }))
        .filter((point) => Number.isFinite(point.value));
      return { key: branch.key, name: branch.label, isCore: isWaveCoreBranchName(branch.key) || isWaveCoreBranchName(branch.label), points, peak: Math.max(0, ...points.map((p) => p.value)) };
    }).sort((a, b) => b.peak - a.peak);
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

  const smdtBranchCore = branchSmdtRows.filter((row) => row.isCore).slice(0, 10);
  const smdtBranchOther = branchSmdtRows.filter((row) => !row.isCore).slice(0, 10);
  const tickerRows = rankedTopTickers.map((row) => ({ key: row.ticker, name: row.ticker, value: row.smdt, isCore: isCoreBranchName(row.industry) }));
  const sortTickerPreview = (rows) => [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const tickerCoreRows = sortTickerPreview(tickerRows.filter((row) => row.isCore)).slice(0, 10);
  const tickerOtherRows = sortTickerPreview(tickerRows.filter((row) => !row.isCore)).slice(0, 10);
  const signalLatestDate = latestStockSignalDate || stockSignalRows.find((row) => row.date)?.date || activeCashTickerDate;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 14 }}>
        <CardDoSong
          data={marketWaveItems}
          maCount={waveTotal}
          reliability={waveLatest?.reliability ?? 0}
          onDetail={() => nav("do-song")}
        />

        <DashboardCard onClick={() => nav("dong-tien-nganh")}>
          <DashHeader title="Dòng tiền ngành" meta={`${fmtNum(branchCashRows.length)} ngành${cashBranchDate ? ` · ${fmtFull(cashBranchDate)}` : ""}`} action="Chi tiết ›" onClick={() => nav("dong-tien-nganh")} />
          <SplitDonuts
            leftTitle="Chủ lực"
            rightTitle="Ngành phụ"
            leftItems={SIG_ORDER.map((sig) => ({ value: branchCashCounts.core[sig], color: DONUT_COLORS[sig] }))}
            rightItems={SIG_ORDER.map((sig) => ({ value: branchCashCounts.other[sig], color: DONUT_COLORS[sig] }))}
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
          leftTitle="Chủ lực · top"
          rightTitle="Ngành phụ · top"
          leftRows={smdtBranchCore}
          rightRows={smdtBranchOther}
          defaultTab="other"
          navId="smdt-nganh"
        />
        <SmdtPreview
          title="SMDT cổ phiếu"
          meta={`${fmtNum(smdtTickerPool.length)} mã${smdtTickerDate ? ` · ${fmtFull(smdtTickerDate)}` : ""}`}
          leftTitle="Chủ lực · top"
          rightTitle="Ngành phụ · top"
          leftRows={tickerCoreRows}
          rightRows={tickerOtherRows}
          defaultTab="core"
          navId="smdt-ma"
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

      <SignalLog topRows={rankedTopTickers} branchRows={branchCashRows} stockSignalRows={stockSignalRows} waveRows={stockWave.rows} />

      <LiveFooter live={live} updatedAt={updatedAt} extra="Dashboard tổng hợp" />
    </div>
  );
}
