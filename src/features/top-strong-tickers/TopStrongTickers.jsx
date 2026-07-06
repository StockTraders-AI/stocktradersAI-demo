import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../theme";
import { mono, valToHmCls, hmStyle } from "../../styles/tokens";
import { useNarrow } from "../../app/useNarrow";
import { fmtFull, fmtNum } from "../../app/formatters";
import { useSMDTTicker, useRealtimeSMDTTickerFeed } from "../../data/useSMDTTicker";
import { useCashFlowTicker, useRealtimeCashFlowTickerFeed, tickerContentToSig } from "../../data/useCashFlowTicker";
import { useSMDT, useRealtimeFeed as useRealtimeSMDTBranchFeed } from "../../data/useSMDT";
import { useCashFlowBranch, useRealtimeCashFlowFeed, contentToSig } from "../../data/useCashFlowBranch";
import { useBranchPath } from "../../data/useBranchPath";
import { useTotalTrade } from "../../data/useTotalTrade";
import { Card, CardHeader, Pagination, Banner, LiveFooter, Loading } from "../../components/ui";
import { DateSessionSelect, SMDTSearchPill, SMDTToolbarPill, linkBtn } from "../../components/ui/ModuleControls";
import { IndustryPicker } from "../cash-flow-ticker/IndustryPicker";
import { CfBadge } from "../cash-flow-ticker/CfBadge";
import { cfSigStyle } from "../cash-flow-ticker/cashFlowUtils";

const SIGS = ["sn", "si", "so", "st"];
const SIG_LABEL = {
  si: "Đổ vào",
  sn: "Nhen nhóm",
  so: "Đang thoát",
  st: "Thoát ra",
};
const STATUS_META = {
  all: { label: "Tất cả", color: "var(--t3)", icon: "ti-circle" },
  vm: { label: "Vừa mạnh", color: "var(--G)", icon: "ti-star-filled" },
  dt: { label: "Duy trì", color: "var(--B)", icon: "ti-circle-filled" },
  tn: { label: "Tiềm năng", color: "var(--A)", icon: "ti-bulb" },
};
const PAGE_SIZE_OPTIONS = [12, 25, 50];
const INDUSTRY_COLORS = ["#7C3AED", "#3DD68C", "#FF9F0A", "#06B6D4", "#1A8A4A", "#EC4899", "#14B8A6", "#F97316"];
const INDUSTRY_ALIAS_GROUPS = [
  ["Môi giới chứng khoán", "Chứng khoán"],
  ["Ngân hàng thương mại truyền thống", "Ngân hàng"],
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

function findDateIndex(datesDesc, dateValue) {
  if (!dateValue || datesDesc.length === 0) return -1;
  const exactIndex = datesDesc.findIndex((date) => toDateInputValue(date) === dateValue);
  if (exactIndex >= 0) return exactIndex;
  const previousIndex = datesDesc.findIndex((date) => toDateInputValue(date) <= dateValue);
  return previousIndex === -1 ? datesDesc.length - 1 : previousIndex;
}

function sortDatesDesc(dates) {
  return [...dates].sort((a, b) => toDateInputValue(b).localeCompare(toDateInputValue(a)));
}

function findBucketByDate(buckets, date) {
  const value = toDateInputValue(date);
  if (!value) return null;
  return buckets.find((bucket) => toDateInputValue(bucket.date) === value) || null;
}

function sigWeight(sig) {
  return { si: 3, sn: 1.6, so: -1.1, st: -2.4 }[sig] || 0;
}

function isPositiveSig(sig) {
  return sig === "si" || sig === "sn";
}

function classifyTicker(smdt, prevSmdt, prev2Smdt, tickerSig, branchSmdt, branchSig) {
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

function money(v) {
  return Number.isFinite(v) && v > 0 ? fmtNum(v) : "—";
}

function findTradePoint(tradeRow, dateValue) {
  if (!tradeRow || !dateValue) return null;
  const dates = Object.keys(tradeRow).sort().reverse();
  const target = dates.find((date) => toDateInputValue(date) <= dateValue);
  return target ? tradeRow[target] : null;
}

function latestUpdatedAt(...items) {
  return items.filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function SmdtBadge({ value }) {
  const { t } = useTheme();
  const cls = valToHmCls(value);
  if (!cls || !Number.isFinite(value)) return <span style={{ color: "var(--t4)" }}>—</span>;
  const s = hmStyle(cls, t);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 58, padding: "4px 9px", borderRadius: 7, background: s.bg, border: `0.5px solid ${s.border}`, color: s.color, fontSize: 12, fontWeight: 800, ...mono }}>
      {value.toFixed(1)}
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.tn;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 88, color: meta.color, fontSize: 11, fontWeight: 800 }}>
      <i className={`ti ${meta.icon}`} style={{ fontSize: 12 }} />
      {meta.label}
    </span>
  );
}

function FilterButton({ active, icon, label, children }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ minHeight: 30, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 15, background: active ? "var(--Bs)" : "var(--surf)", border: `0.5px solid ${active ? "var(--Bb)" : "var(--bdr)"}`, color: active ? "var(--B)" : "var(--t2)", fontSize: 12, fontWeight: active ? 800 : 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
        {label}
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 12 }} />
      </button>
      {open && children({ close: () => setOpen(false) })}
    </div>
  );
}

function SignalDropdown({ branchSigs, tickerSigs, onBranchChange, onTickerChange }) {
  const { t } = useTheme();
  const active = branchSigs.size < SIGS.length || tickerSigs.size < SIGS.length;
  const total = branchSigs.size + tickerSigs.size;
  const toggle = (set, sig, onChange) => {
    const next = new Set(set);
    if (next.has(sig)) next.delete(sig); else next.add(sig);
    onChange(next);
  };
  const Row = ({ title, icon, set, onChange }) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, color: "var(--t3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>
        <i className={`ti ${icon}`} style={{ fontSize: 12 }} />
        {title}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 11 }}>
        {SIGS.map((sig) => {
          const on = set.has(sig);
          const tone = cfSigStyle(sig, t);
          return (
            <button
              key={sig}
              type="button"
              onClick={() => toggle(set, sig, onChange)}
              style={{ border: `0.5px solid ${tone.border}`, background: tone.bg, color: tone.color, opacity: on ? 1 : 0.42, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
            >
              {SIG_LABEL[sig]}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <FilterButton active={active} icon="ti-trending-up" label={active ? `Tín hiệu ${total}/8` : "Tín hiệu dòng tiền"}>
      {({ close }) => (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 70, width: 292, background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 12, padding: 10, boxShadow: "0 16px 42px rgba(15,23,42,.18)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 9, marginBottom: 10, borderBottom: "0.5px solid var(--bdr)" }}>
            <span style={{ color: "var(--t3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Tín hiệu dòng tiền</span>
            <button type="button" onClick={() => { onBranchChange(new Set(SIGS)); onTickerChange(new Set(SIGS)); }} style={{ border: "none", background: "transparent", color: "var(--t4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Đặt lại</button>
          </div>
          <Row title="Dòng tiền ngành" icon="ti-building-community" set={branchSigs} onChange={onBranchChange} />
          <div style={{ height: 1, background: "var(--bdr)", marginBottom: 10 }} />
          <Row title="Dòng tiền cổ phiếu" icon="ti-chart-line" set={tickerSigs} onChange={onTickerChange} />
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: "0.5px solid var(--bdr)" }}>
            <button type="button" onClick={close} style={{ border: "none", background: "transparent", color: "var(--B)", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Áp dụng</button>
          </div>
        </div>
      )}
    </FilterButton>
  );
}

function StatusDropdown({ status, counts, onChange }) {
  const active = status !== "all";
  return (
    <FilterButton active={active} icon="ti-filter" label={STATUS_META[status]?.label || "Trạng thái"}>
      {({ close }) => (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 70, minWidth: 218, background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 12, padding: 10, boxShadow: "0 16px 42px rgba(15,23,42,.18)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 9, marginBottom: 8, borderBottom: "0.5px solid var(--bdr)" }}>
            <span style={{ color: "var(--t3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Trạng thái</span>
            <button type="button" onClick={() => { onChange("all"); close(); }} style={{ border: "none", background: "transparent", color: "var(--t4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Đặt lại</button>
          </div>
          {["all", "vm", "dt", "tn"].map((id) => {
            const meta = STATUS_META[id];
            const selected = status === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { onChange(id); close(); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "8px 8px", marginBottom: 2, borderRadius: 8, border: "none", borderLeft: `2px solid ${selected ? "var(--B)" : "transparent"}`, background: selected ? "var(--Bs)" : "transparent", cursor: "pointer", fontFamily: "inherit" }}
              >
                <i className={`ti ${meta.icon}`} style={{ fontSize: 12, color: meta.color }} />
                <span style={{ flex: 1, textAlign: "left", fontSize: 12, color: selected ? "var(--t1)" : "var(--t2)", fontWeight: selected ? 800 : 600 }}>{meta.label}</span>
                <span style={{ color: meta.color, fontSize: 11, fontWeight: 800 }}>{fmtNum(counts[id] || 0)} mã</span>
              </button>
            );
          })}
        </div>
      )}
    </FilterButton>
  );
}

function DonutChart({ rows }) {
  const total = rows.length;
  const freq = new Map();
  for (const row of rows) freq.set(row.industry, (freq.get(row.industry) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const r = 31;
  const c = 42;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <svg width="84" height="84" viewBox="0 0 84 84" style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bdr)" strokeWidth="11" />
        {top.map(([name, count], index) => {
          const len = total ? (count / total) * circ : 0;
          const color = INDUSTRY_COLORS[index % INDUSTRY_COLORS.length];
          const node = <circle key={name} cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="11" strokeDasharray={`${len} ${circ}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`} />;
          offset += len;
          return node;
        })}
        <text x={c} y={c - 4} textAnchor="middle" fill="var(--t1)" fontSize="14" fontWeight="800">{fmtNum(total)}</text>
        <text x={c} y={c + 10} textAnchor="middle" fill="var(--t4)" fontSize="8" fontWeight="700">MÃ</text>
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {top.length ? top.map(([name, count], index) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--t2)", minWidth: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: INDUSTRY_COLORS[index % INDUSTRY_COLORS.length], flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ marginLeft: "auto", color: "var(--t1)", fontWeight: 800, ...mono }}>{count}</span>
          </div>
        )) : <span style={{ color: "var(--t4)", fontSize: 12 }}>Chưa có dữ liệu</span>}
      </div>
    </div>
  );
}

function OverviewPanel({ rows, filteredRows, counts }) {
  const total = Math.max(1, rows.length);
  const maxCount = Math.max(counts.vm || 0, counts.dt || 0, counts.tn || 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <CardHeader icon="ti-chart-bar" title="Tổng quan" mb={11} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {[
            { id: "vm", label: "Vừa mạnh", sub: "Bứt", color: "var(--G)" },
            { id: "dt", label: "Duy trì", sub: "Giữ >70", color: "var(--B)" },
            { id: "tn", label: "Tiềm năng", sub: "Cải thiện", color: "var(--A)" },
            { id: "all", label: "Đang lọc", sub: "Hiển thị", color: "var(--t1)", value: filteredRows.length },
          ].map((item) => (
            <div key={item.id} style={{ background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 8, padding: "10px 11px" }}>
              <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1, color: item.color, ...mono }}>{fmtNum(item.value ?? counts[item.id] ?? 0)}</div>
              <div style={{ marginTop: 5, color: "var(--t3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" }}>{item.label}</div>
              <div style={{ color: "var(--t4)", fontSize: 10 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader icon="ti-chart-donut" title="Phân bố theo ngành" mb={11} />
        <DonutChart rows={filteredRows} />
      </Card>
      <Card>
        <CardHeader icon="ti-stairs-up" title="Phân bố trạng thái" mb={11} />
        {["vm", "dt", "tn"].map((id) => {
          const meta = STATUS_META[id];
          const value = counts[id] || 0;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              <span style={{ width: 68, color: meta.color, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: "hidden", background: "var(--elev)" }}>
                <div style={{ width: `${(value / maxCount) * 100}%`, height: "100%", borderRadius: 3, background: meta.color }} />
              </div>
              <span style={{ width: 60, textAlign: "right", color: "var(--t2)", fontSize: 11, ...mono }}>{Math.round((value / total) * 100)}%</span>
            </div>
          );
        })}
      </Card>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: "var(--B)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
          <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
          Ghi chú
        </div>
        <div style={{ background: "var(--Bs)", border: "0.5px solid var(--Bb)", borderRadius: 8, padding: "9px 11px", color: "var(--t3)", fontSize: 11, lineHeight: 1.6 }}>
          Vừa mạnh: mới vượt ngưỡng 70/100 hoặc tăng tốc mạnh. Duy trì: SMDT mã vẫn trên 70. Tiềm năng: dưới 70 nhưng đang cải thiện hoặc được dòng tiền/ngành ủng hộ.
        </div>
      </Card>
    </div>
  );
}

function TopMetric({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: "var(--t4)", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
      <span style={{ display: "inline-flex" }}>{children}</span>
    </div>
  );
}

function TopCard({ row }) {
  return (
    <div style={{ background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 11, padding: "12px 13px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--B)", fontSize: 15, fontWeight: 900 }}>{row.ticker}</div>
            {row.name !== row.ticker && (
              <div style={{ color: "var(--t4)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{row.name}</div>
            )}
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, color: "var(--t2)", fontSize: 12 }}>
        <i className="ti ti-building-community" style={{ fontSize: 13, color: "var(--t4)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.industry}</span>
        <span style={{ marginLeft: "auto", color: "var(--t1)", fontWeight: 700, ...mono }}>{money(row.price)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px 10px", marginTop: 11, paddingTop: 11, borderTop: "0.5px solid var(--bdrs)" }}>
        <TopMetric label="SMDT mã"><SmdtBadge value={row.smdt} /></TopMetric>
        <TopMetric label="SMDT ngành"><SmdtBadge value={row.branchSmdt} /></TopMetric>
        <TopMetric label="Dòng tiền cổ phiếu"><CfBadge sig={row.tickerSig} small /></TopMetric>
        <TopMetric label="Dòng tiền ngành"><CfBadge sig={row.branchSig} small /></TopMetric>
      </div>
    </div>
  );
}

export function ModTopMaManh() {
  const narrow = useNarrow();
  const smdtTicker = useSMDTTicker();
  const cashTicker = useCashFlowTicker();
  const smdtBranch = useSMDT();
  const cashBranch = useCashFlowBranch();
  const branchPath = useBranchPath();
  const totalTrade = useTotalTrade();

  const liveSmdtTicker = useRealtimeSMDTTickerFeed(smdtTicker.applyTick);
  const liveCashTicker = useRealtimeCashFlowTickerFeed(cashTicker.applyTick);
  const liveSmdtBranch = useRealtimeSMDTBranchFeed(smdtBranch.applyTick);
  const liveCashBranch = useRealtimeCashFlowFeed(cashBranch.applyTick);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [hiddenInd, setHiddenInd] = useState(() => new Set());
  const [branchSigs, setBranchSigs] = useState(() => new Set(SIGS));
  const [tickerSigs, setTickerSigs] = useState(() => new Set(SIGS));
  const [status, setStatus] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");

  const datesDesc = useMemo(() => sortDatesDesc(smdtTicker.datesAsc), [smdtTicker.datesAsc]);
  const latestSmdtDate = datesDesc[0] || "";
  const activeDateValue = selectedDate || toDateInputValue(latestSmdtDate);
  const activeDateIndex = useMemo(() => findDateIndex(datesDesc, activeDateValue), [activeDateValue, datesDesc]);
  const activeSmdtDate = activeDateIndex >= 0 ? datesDesc[activeDateIndex] : latestSmdtDate;
  const prevSmdtDate = activeDateIndex >= 0 ? datesDesc[activeDateIndex + 1] || "" : "";
  const prev2SmdtDate = activeDateIndex >= 0 ? datesDesc[activeDateIndex + 2] || "" : "";
  const dateInputValue = toDateInputValue(activeSmdtDate);
  const canGoNewer = activeDateIndex > 0;
  const canGoOlder = activeDateIndex >= 0 && activeDateIndex < datesDesc.length - 1;
  const cashTickerDatesDesc = useMemo(() => sortDatesDesc(cashTicker.buckets.map((bucket) => bucket.date)), [cashTicker.buckets]);
  const activeCashTickerIndex = useMemo(() => findDateIndex(cashTickerDatesDesc, dateInputValue), [cashTickerDatesDesc, dateInputValue]);
  const activeCashTickerDate = activeCashTickerIndex >= 0 ? cashTickerDatesDesc[activeCashTickerIndex] : "";
  const activeCashBucket = useMemo(
    () => findBucketByDate(cashTicker.buckets, activeCashTickerDate),
    [activeCashTickerDate, cashTicker.buckets]
  );
  const smdtBranchDatesDesc = useMemo(() => sortDatesDesc(smdtBranch.datesAsc), [smdtBranch.datesAsc]);
  const cashBranchDatesDesc = useMemo(() => sortDatesDesc(cashBranch.datesAsc), [cashBranch.datesAsc]);
  const activeBranchSmdtIndex = useMemo(() => findDateIndex(smdtBranchDatesDesc, dateInputValue), [dateInputValue, smdtBranchDatesDesc]);
  const activeBranchCashIndex = useMemo(() => findDateIndex(cashBranchDatesDesc, dateInputValue), [cashBranchDatesDesc, dateInputValue]);
  const activeBranchSmdtDate = activeBranchSmdtIndex >= 0 ? smdtBranchDatesDesc[activeBranchSmdtIndex] : "";
  const activeBranchCashDate = activeBranchCashIndex >= 0 ? cashBranchDatesDesc[activeBranchCashIndex] : "";
  const updatedAt = latestUpdatedAt(smdtTicker.updatedAt, cashTicker.updatedAt, smdtBranch.updatedAt, cashBranch.updatedAt, totalTrade.updatedAt, branchPath.updatedAt);
  const live = liveSmdtTicker.connected || liveCashTicker.connected || liveSmdtBranch.connected || liveCashBranch.connected;

  const cashByTicker = useMemo(() => {
    const map = new Map();
    for (const row of activeCashBucket?.rows || []) map.set(row.ticker, row);
    return map;
  }, [activeCashBucket?.rows]);

  const tickerNameByKey = useMemo(() => {
    const map = new Map();
    for (const tk of smdtTicker.tickers) map.set(tk.key, tk.name || tk.key);
    return map;
  }, [smdtTicker.tickers]);

  const tickerPool = useMemo(() => {
    const allowed = cashTicker.allowedTickers?.length
      ? cashTicker.allowedTickers
      : [...new Set([...(activeCashBucket?.rows || []).map((row) => row.ticker), ...smdtTicker.tickers.map((tk) => tk.key)])];
    const seen = new Set();
    return allowed.flatMap((ticker) => {
      if (!ticker || seen.has(ticker)) return [];
      seen.add(ticker);
      const industry = branchPath.tickerToBranch[ticker];
      if (!industry) return [];
      return [{ ticker, name: tickerNameByKey.get(ticker) || ticker, industry }];
    }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [activeCashBucket?.rows, branchPath.tickerToBranch, cashTicker.allowedTickers, smdtTicker.tickers, tickerNameByKey]);

  const branchSmdtLookup = useMemo(
    () => makeIndustryLookup(smdtBranch.branches, smdtBranch.matrix, activeBranchSmdtDate, (v) => (Number.isFinite(v) ? v : null)),
    [activeBranchSmdtDate, smdtBranch.branches, smdtBranch.matrix]
  );
  const branchSigLookup = useMemo(
    () => makeIndustryLookup(cashBranch.branches, cashBranch.matrix, activeBranchCashDate, contentToSig),
    [activeBranchCashDate, cashBranch.branches, cashBranch.matrix]
  );

  const rows = useMemo(() => {
    const data = [];
    for (const tk of tickerPool) {
      const ticker = tk.ticker;
      const smdt = smdtTicker.matrix[ticker]?.[activeSmdtDate];
      if (!Number.isFinite(smdt)) continue;
      const prevSmdt = smdtTicker.matrix[ticker]?.[prevSmdtDate];
      const prev2Smdt = smdtTicker.matrix[ticker]?.[prev2SmdtDate];
      const cash = cashByTicker.get(ticker);
      const tradePoint = findTradePoint(totalTrade.matrix[ticker], dateInputValue);
      const industry = tk.industry;
      const branchSmdt = lookupIndustry(branchSmdtLookup, industry);
      const branchSig = lookupIndustry(branchSigLookup, industry);
      const tickerSig = tickerContentToSig(cash?.content || "");
      const momentum = Number.isFinite(prevSmdt) ? smdt - prevSmdt : 0;
      const statusId = classifyTicker(smdt, prevSmdt, prev2Smdt, tickerSig, branchSmdt, branchSig);
      if (!statusId) continue;
      const score = smdt + (Number.isFinite(branchSmdt) ? branchSmdt * 0.22 : 0) + sigWeight(tickerSig) * 8 + sigWeight(branchSig) * 4 + Math.max(-12, Math.min(18, momentum * 0.7));
      data.push({
        ticker,
        name: tk.name || ticker,
        industry,
        price: tradePoint?.price,
        smdt,
        prevSmdt,
        prev2Smdt,
        momentum,
        branchSmdt,
        tickerSig,
        branchSig,
        status: statusId,
        score,
      });
    }
    return data.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [activeSmdtDate, branchSigLookup, branchSmdtLookup, cashByTicker, dateInputValue, prev2SmdtDate, prevSmdtDate, smdtTicker.matrix, tickerPool, totalTrade.matrix]);

  const industries = useMemo(
    () => [...new Set(tickerPool.map((row) => row.industry))].sort((a, b) => a.localeCompare(b, "vi")),
    [tickerPool]
  );
  const industrySig = useMemo(() => {
    const map = {};
    for (const ind of industries) map[ind] = lookupIndustry(branchSigLookup, ind);
    return map;
  }, [branchSigLookup, industries]);
  const statusCounts = useMemo(() => {
    const counts = { all: rows.length, vm: 0, dt: 0, tn: 0 };
    for (const row of rows) counts[row.status] += 1;
    return counts;
  }, [rows]);
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (hiddenInd.has(row.industry)) return false;
      if (branchSigs.size < SIGS.length && (!row.branchSig || !branchSigs.has(row.branchSig))) return false;
      if (tickerSigs.size < SIGS.length && (!row.tickerSig || !tickerSigs.has(row.tickerSig))) return false;
      if (status !== "all" && row.status !== status) return false;
      if (q && !row.ticker.toLowerCase().includes(q) && !row.industry.toLowerCase().includes(q) && !row.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [branchSigs, hiddenInd, query, rows, status, tickerSigs]);

  useEffect(() => {
    if (!industries.length) return;
    const valid = new Set(industries);
    setHiddenInd((prev) => {
      const next = new Set([...prev].filter((ind) => valid.has(ind)));
      return next.size === prev.size ? prev : next;
    });
  }, [industries]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const dateLabel = activeSmdtDate ? fmtFull(activeSmdtDate) : "—";

  const goToDate = useCallback((dateValue) => {
    const targetIndex = findDateIndex(datesDesc, dateValue);
    if (targetIndex >= 0) {
      setSelectedDate(toDateInputValue(datesDesc[targetIndex]));
      setPage(1);
    }
  }, [datesDesc]);

  const stepDate = useCallback((delta) => {
    if (datesDesc.length === 0) return;
    const currentIndex = activeDateIndex >= 0 ? activeDateIndex : 0;
    const targetIndex = Math.min(Math.max(currentIndex + delta, 0), datesDesc.length - 1);
    setSelectedDate(toDateInputValue(datesDesc[targetIndex]));
    setPage(1);
  }, [activeDateIndex, datesDesc]);

  const toggleInd = useCallback((ind) => {
    setHiddenInd((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind); else next.add(ind);
      return next;
    });
    setPage(1);
  }, []);
  const showIndustries = useCallback((items) => {
    setHiddenInd((prev) => {
      const next = new Set(prev);
      for (const ind of items) next.delete(ind);
      return next;
    });
    setPage(1);
  }, []);
  const hideIndustries = useCallback((items) => {
    setHiddenInd((prev) => {
      const next = new Set(prev);
      for (const ind of items) next.add(ind);
      return next;
    });
    setPage(1);
  }, []);
  const resetAll = useCallback(() => {
    setHiddenInd(new Set());
    setBranchSigs(new Set(SIGS));
    setTickerSigs(new Set(SIGS));
    setStatus("all");
    setQuery("");
    setPage(1);
  }, []);

  const exportCsv = useCallback(() => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Mã", "Ngành", "Giá", "SMDT ngành", "SMDT mã", "Dòng tiền ngành", "Dòng tiền cổ phiếu", "Trạng thái", "Điểm"].map(esc).join(",")];
    filteredRows.forEach((row) => {
      lines.push([
        row.ticker,
        row.industry,
        row.price || "",
        Number.isFinite(row.branchSmdt) ? row.branchSmdt.toFixed(2) : "",
        row.smdt.toFixed(2),
        row.branchSig ? SIG_LABEL[row.branchSig] : "",
        row.tickerSig ? SIG_LABEL[row.tickerSig] : "",
        STATUS_META[row.status]?.label || "",
        row.score.toFixed(2),
      ].map(esc).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top-ma-manh-${toDateInputValue(activeSmdtDate) || "latest"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeSmdtDate, filteredRows]);

  const loading = smdtTicker.status === "loading" && !rows.length;
  const error = smdtTicker.status === "error" && !rows.length;

  if (loading) return <Loading label="Đang tải dữ liệu Top mã mạnh…" />;
  if (error) return <Banner tone="error">Lỗi tải SMDT cổ phiếu: {smdtTicker.error} <button onClick={smdtTicker.refresh} style={linkBtn}>Thử lại</button></Banner>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {branchPath.status === "loading" && !Object.keys(branchPath.tickerToBranch).length && <Loading label="Đang tải danh sách ngành cổ phiếu…" compact />}
      {branchPath.status === "error" && !Object.keys(branchPath.tickerToBranch).length && (
        <Banner tone="error">Lỗi tải danh sách ngành: {branchPath.error} <button onClick={branchPath.refresh} style={linkBtn}>Thử lại</button></Banner>
      )}
      {totalTrade.status === "error" && !Object.keys(totalTrade.matrix).length && (
        <Banner tone="error">Lỗi tải giá từ TotalTrade: {totalTrade.error} <button onClick={totalTrade.refresh} style={linkBtn}>Thử lại</button></Banner>
      )}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1fr) 272px", gap: 12, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            <SMDTToolbarPill style={{ gap: 3, padding: "0 6px", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => stepDate(1)}
                disabled={!canGoOlder}
                title="Lùi 1 phiên"
                style={{ width: 18, height: 22, border: "none", borderRadius: 6, background: "transparent", color: canGoOlder ? "var(--t2)" : "var(--t4)", cursor: canGoOlder ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
              </button>
              <DateSessionSelect value={dateInputValue} dates={datesDesc} onChange={goToDate} />
              <button
                type="button"
                onClick={() => stepDate(-1)}
                disabled={!canGoNewer}
                title="Tiến 1 phiên"
                style={{ width: 18, height: 22, border: "none", borderRadius: 6, background: "transparent", color: canGoNewer ? "var(--t2)" : "var(--t4)", cursor: canGoNewer ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
              </button>
            </SMDTToolbarPill>
            <SignalDropdown
              branchSigs={branchSigs}
              tickerSigs={tickerSigs}
              onBranchChange={(next) => { setBranchSigs(next); setPage(1); }}
              onTickerChange={(next) => { setTickerSigs(next); setPage(1); }}
            />
            <IndustryPicker
              industries={industries}
              hidden={hiddenInd}
              industrySig={industrySig}
              onToggle={toggleInd}
              onAll={() => { setHiddenInd(new Set()); setPage(1); }}
              onNone={() => { setHiddenInd(new Set(industries)); setPage(1); }}
              onShowIndustries={showIndustries}
              onHideIndustries={hideIndustries}
            />
            <StatusDropdown status={status} counts={statusCounts} onChange={(v) => { setStatus(v); setPage(1); }} />
            <SMDTSearchPill placeholder="Tìm mã/ngành..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} style={{ width: 150, padding: "0 10px", flexShrink: 0 }} />
          </div>

          {(hiddenInd.size > 0 || branchSigs.size < SIGS.length || tickerSigs.size < SIGS.length || status !== "all" || query) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
              <span style={{ color: "var(--t4)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Đang lọc</span>
              {hiddenInd.size > 0 && <ActivePill>{industries.length - hiddenInd.size}/{industries.length} ngành</ActivePill>}
              {branchSigs.size < SIGS.length && <ActivePill>Dòng tiền ngành: {[...branchSigs].map((s) => SIG_LABEL[s]).join(", ")}</ActivePill>}
              {tickerSigs.size < SIGS.length && <ActivePill>Dòng tiền cổ phiếu: {[...tickerSigs].map((s) => SIG_LABEL[s]).join(", ")}</ActivePill>}
              {status !== "all" && <ActivePill>{STATUS_META[status].label}</ActivePill>}
              {query && <ActivePill>{query}</ActivePill>}
              <button type="button" onClick={resetAll} style={{ border: "none", background: "transparent", color: "var(--R)", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Xóa tất cả</button>
            </div>
          )}

          <Card noPad>
            {narrow ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 9, padding: 12 }}>
                {pageRows.map((row) => (
                  <TopCard key={row.ticker} row={row} />
                ))}
                {pageRows.length === 0 && (
                  <div style={{ padding: 28, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Không có mã nào thỏa điều kiện.</div>
                )}
              </div>
            ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 820 }}>
                <thead>
                  <tr>
                    {["Mã", "Ngành", "Giá", "SMDT ngành", "SMDT mã", "Dòng tiền ngành", "Dòng tiền cổ phiếu", "Trạng thái"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 6px", background: "var(--elev)", borderBottom: "0.5px solid var(--bdr)", color: "var(--t4)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", textAlign: i >= 2 ? "right" : "left", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    return (
                      <tr key={row.ticker}>
                        <td style={tdStyle()}>
                          <div title={row.name} style={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 60, minWidth: 0 }}>
                            <span style={{ color: "var(--B)", fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.ticker}</span>
                            {row.name !== row.ticker && <span style={{ color: "var(--t4)", fontSize: 9, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>}
                          </div>
                        </td>
                        <td style={tdStyle({ color: "var(--t2)" })}>
                          <span title={row.industry} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 94 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.industry}</span>
                          </span>
                        </td>
                        <td style={tdStyle({ textAlign: "right", color: "var(--t1)", ...mono })}>{money(row.price)}</td>
                        <td style={tdStyle({ textAlign: "right" })}><SmdtBadge value={row.branchSmdt} /></td>
                        <td style={tdStyle({ textAlign: "right" })}>
                          <SmdtBadge value={row.smdt} />
                        </td>
                        <td style={tdStyle({ textAlign: "right" })}><CfBadge sig={row.branchSig} small /></td>
                        <td style={tdStyle({ textAlign: "right" })}><CfBadge sig={row.tickerSig} small /></td>
                        <td style={tdStyle({ textAlign: "right", paddingRight: 13 })}><StatusBadge status={row.status} /></td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 36, textAlign: "center", color: "var(--t3)" }}>Không có mã nào thỏa điều kiện.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 13px", borderTop: "0.5px solid var(--bdr)", flexWrap: "wrap" }}>
              <span style={{ color: "var(--t3)", fontSize: 11 }}>
                Hiển thị {filteredRows.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, filteredRows.length)} trong {fmtNum(filteredRows.length)} mã
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SMDTToolbarPill as="label" style={{ cursor: "pointer", padding: "0 10px", flexShrink: 0 }}>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    style={{ border: "none", outline: "none", background: "transparent", color: "var(--t2)", font: "inherit", fontWeight: 700, cursor: "pointer", appearance: "none", padding: 0 }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n} style={{ background: "var(--surf)", color: "var(--t1)" }}>{n} / trang</option>)}
                  </select>
                  <i className="ti ti-chevron-down" style={{ fontSize: 12, color: "var(--t4)" }} />
                </SMDTToolbarPill>
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              </div>
            </div>
          </Card>
          <LiveFooter live={live} updatedAt={updatedAt} extra={`${fmtNum(filteredRows.length)} / ${fmtNum(rows.length)} mã · ${dateLabel}`} />
        </div>
        <OverviewPanel rows={rows} filteredRows={filteredRows} counts={statusCounts} />
      </div>
    </div>
  );
}

function ActivePill({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 9px", background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", fontSize: 11, fontWeight: 800 }}>
      {children}
    </span>
  );
}

function tdStyle(extra = {}) {
  return {
    padding: "8px 6px",
    borderBottom: "0.5px solid var(--bdrs)",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
    fontSize: 12,
    ...extra,
  };
}
