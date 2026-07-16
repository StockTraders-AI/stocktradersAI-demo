import { useEffect, useMemo, useRef, useState } from "react";
import { useNarrow } from "../../app/useNarrow";
import { useBranchPath } from "../../data/useBranchPath";
import { usePerformance } from "../../data/usePerformance";
import { CORE_BRANCHES } from "../../data/useSMDT";
import { useRealtimeSMDTBranchCrossFeed, useRealtimeSMDTTickerCrossFeed, useSMDTBranchCross, useSMDTTickerCross } from "../../data/useSMDTCross";
import { mono } from "../../styles/tokens";
import { useTheme } from "../../theme";
import { Loading } from "../../components/ui";

const STORAGE_KEY = "wave_path_visible_branches_v1";
const STRONG_THRESHOLD = 70;
const SUPER_THRESHOLD = 100;
const RECENT_DAYS = 30;

const PINNED_KEYS = [
  "Ngân hàng",
  "Chứng khoán",
  "Thép",
  "BĐS Dân cư",
  "Xây dựng",
  "Sóng ngành Vin",
];

const INDUSTRY_ALIAS_GROUPS = [
  ["Ngân hàng", "Ngân hàng thương mại truyền thống"],
  ["Chứng khoán", "Môi giới chứng khoán"],
  ["Thép", "Sản xuất, chế biến thép"],
  ["BĐS Dân cư", "Bất động sản", "Bất động sản dân cư", "Dịch vụ Bất động sản dân cư"],
  ["BĐS KCN", "Bất động sản công nghiệp", "Bất động sản khu công nghiệp", "Khu công nghiệp"],
  ["Sóng ngành Vin", "Sóng Vin", "Vin", "Vingroup"],
  ["Sản xuất và Khai thác dầu khí", "SX & KT dầu khí", "Dầu khí"],
];

const COLORS = [
  "#7C3AED",
  "#3DD68C",
  "#FF9F0A",
  "#06B6D4",
  "#1A8A4A",
  "#FF2D55",
  "#EC4899",
  "#F59E0B",
  "#8B5CF6",
  "#14B8A6",
  "#84CC16",
  "#F97316",
  "#6366F1",
  "#0EA5E9",
  "#D946EF",
  "#22C55E",
];

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(date) {
  if (!date) return "--";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    return `${d}/${m}/${y}`;
  }
  return date;
}

function fmtShort(date) {
  if (!date) return "--";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [, m, d] = date.split("-");
    return `${d}/${m}`;
  }
  return date.slice(0, 5);
}

function toPerformanceMonth(date) {
  if (!date) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m] = date.split("-");
    return `${m}-${y}`;
  }
  return date;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function aliasesOfIndustry(name) {
  const normalized = normalizeName(name);
  return INDUSTRY_ALIAS_GROUPS.find((group) => group.some((item) => normalizeName(item) === normalized)) || [name];
}

function isResidentialRealEstateServiceName(name) {
  const normalized = normalizeName(name);
  return normalized.includes("dịch vụ") && (normalized.includes("bđs dân cư") || (normalized.includes("bất động sản") && normalized.includes("dân cư")));
}

function pinnedOrderOfIndustry(name) {
  if (isResidentialRealEstateServiceName(name)) return -1;
  const names = aliasesOfIndustry(name).map(normalizeName);
  return PINNED_KEYS.findIndex((key) => aliasesOfIndustry(key).some((alias) => names.includes(normalizeName(alias))));
}

function pctPos(date, d0, totalMs) {
  if (!date || !d0 || totalMs <= 0) return 0;
  return Math.max(0, Math.min(100, ((new Date(date) - d0) / totalMs) * 100));
}

function loadVisibleSet() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(parsed) && parsed.length ? new Set(parsed) : null;
  } catch {
    return null;
  }
}

function saveVisibleSet(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...value]));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}

function smdtColor(value, t) {
  if (value >= SUPER_THRESHOLD) return t.MU;
  if (value >= STRONG_THRESHOLD) return t.G;
  if (value >= 30) return t.A;
  if (value < 0) return t.R;
  return t.t3;
}

function signalMeta(value, prev, t) {
  const delta = Number.isFinite(prev) ? value - prev : 0;
  if (value >= SUPER_THRESHOLD) return { label: "Rất mạnh", color: t.MU, bg: t.MUs };
  if (value >= STRONG_THRESHOLD) return { label: delta >= 0 ? "Dẫn sóng" : "Giữ sóng", color: t.G, bg: t.Gs };
  if (value >= 30) return { label: delta >= 0 ? "Tích lũy" : "Hạ nhiệt", color: t.A, bg: t.As };
  if (value >= 0) return { label: "Trung lập", color: t.t3, bg: "var(--elev)" };
  return { label: "Phân phối", color: t.R, bg: t.Rs };
}

function branchAliases(row) {
  const aliases = new Set([normalizeName(row.key), normalizeName(row.label)]);
  for (const name of [row.key, row.label]) {
    for (const alias of aliasesOfIndustry(name)) aliases.add(normalizeName(alias));
  }
  return aliases;
}

function resolveBranchPath(row, branchPath) {
  const aliases = branchAliases(row);
  for (const branch of branchPath.branches || []) {
    if (branch?.path && aliases.has(normalizeName(branch.name))) return branch.path;
  }
  for (const alias of aliases) {
    const path = branchPath.branchToPath?.[alias];
    if (path) return path;
  }
  return "";
}

function sortTickerAsc(a, b) {
  return a.ticker.localeCompare(b.ticker, "en", { sensitivity: "base", numeric: true });
}

function resolveActiveEventDate(row, preferredDate) {
  const events = row?.events || [];
  if (preferredDate && events.some((event) => event.date === preferredDate)) return preferredDate;
  return events[events.length - 1]?.date || null;
}

function getValueAtOrBefore(matrix, datesAsc, ticker, date) {
  const row = matrix[ticker];
  if (!row) return { value: null, date: null, prev: null };

  let index = datesAsc.length - 1;
  if (date) {
    const firstFuture = datesAsc.findIndex((d) => d > date);
    index = firstFuture === -1 ? datesAsc.length - 1 : firstFuture - 1;
  }
  if (index < 0) return { value: null, date: null, prev: null };

  while (index >= 0) {
    const value = toNumber(row[datesAsc[index]]);
    if (value != null) {
      let prev = null;
      for (let i = index - 1; i >= 0; i -= 1) {
        prev = toNumber(row[datesAsc[i]]);
        if (prev != null) break;
      }
      return { value, date: datesAsc[index], prev };
    }
    index -= 1;
  }
  return { value: null, date: null, prev: null };
}

/** Chuỗi SMDT (tăng dần) của một mã/ngành, cắt tới `uptoDate` (nếu có). */
function seriesUpTo(matrix, datesAsc, key, uptoDate) {
  const row = matrix?.[key];
  if (!row) return [];
  const out = [];
  for (const date of datesAsc) {
    if (uptoDate && date > uptoDate) break;
    const value = toNumber(row[date]);
    if (value != null) out.push({ date, smdt: value });
  }
  return out;
}

/** Các phiên SMDT cắt lên ngưỡng 70% (cross-up), mới nhất trước. */
function crossUps(series, limit = 5) {
  const out = [];
  for (let i = 1; i < series.length; i += 1) {
    if (series[i - 1].smdt < STRONG_THRESHOLD && series[i].smdt >= STRONG_THRESHOLD) out.push(series[i]);
  }
  return out.reverse().slice(0, limit);
}

/* ── Canvas chart SMDT (port từ mẫu LoTrinhDanSong) ── */
const chLerp = (a, b, t) => a + (b - a) * t;
function chLine(v, a = 1) {
  if (v >= 100) return `rgba(26,138,74,${a})`;
  if (v >= 70) {
    const t = (v - 70) / 30;
    return `rgba(${Math.round(chLerp(240, 26, t))},${Math.round(chLerp(168, 138, t))},${Math.round(chLerp(0, 74, t))},${a})`;
  }
  if (v >= 50) {
    const t = (v - 50) / 20;
    return `rgba(${Math.round(chLerp(180, 240, t))},${Math.round(chLerp(140, 168, t))},${Math.round(chLerp(40, 0, t))},${a})`;
  }
  return `rgba(150,165,185,${a})`;
}
function chDot(v) {
  if (v >= 100) return "#1A8A4A";
  if (v >= 70) {
    const t = (v - 70) / 30;
    return `rgb(${Math.round(chLerp(240, 26, t))},${Math.round(chLerp(168, 138, t))},${Math.round(chLerp(0, 74, t))})`;
  }
  if (v >= 50) {
    const t = (v - 50) / 20;
    return `rgb(${Math.round(chLerp(180, 240, t))},${Math.round(chLerp(140, 168, t))},${Math.round(chLerp(40, 0, t))})`;
  }
  return "#6a7890";
}

function drawSmdt(ctx, W, H, pts, overlay) {
  if (!pts || pts.length < 2) return;
  const P = { t: 22, r: 14, b: 20, l: 36 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;
  const all = [...pts.map((p) => p.smdt), ...((overlay || []).filter((p) => p.smdt != null).map((p) => p.smdt))];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const pad = Math.max((rawMax - rawMin) * 0.22, 15);
  const minV = Math.min(rawMin - pad, -5);
  const maxV = Math.max(rawMax + pad * 0.5, 108);
  const rng = maxV - minV || 1;
  const xOf = (i) => P.l + (i / (pts.length - 1)) * cW;
  const yOf = (v) => P.t + cH * (1 - (v - minV) / rng);
  const y70 = yOf(70);

  [0, 50, 70, 100].forEach((v) => {
    const y = yOf(v);
    if (y < P.t - 2 || y > H - P.b + 2) return;
    ctx.save();
    ctx.setLineDash(v === 70 ? [5, 4] : [3, 5]);
    ctx.strokeStyle = v === 70 ? "rgba(240,168,0,.35)" : "rgba(120,140,170,.16)";
    ctx.lineWidth = v === 70 ? 1.1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(P.l, y);
    ctx.lineTo(P.l + cW, y);
    ctx.stroke();
    ctx.restore();
    ctx.font = `${v === 70 ? "700" : "500"} 9px -apple-system,sans-serif`;
    ctx.fillStyle = v === 70 ? "rgba(240,168,0,.85)" : "rgba(140,160,185,.6)";
    ctx.textAlign = "right";
    ctx.fillText(`${v}%`, P.l - 6, y + 3);
  });

  if (overlay && overlay.length) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(130,150,180,.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    overlay.forEach((p, i) => {
      if (p.smdt == null) {
        started = false;
        return;
      }
      const x = xOf(i);
      const y = yOf(p.smdt);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  const coords = [];
  for (let i = 0; i < pts.length; i += 1) {
    if (i > 0) {
      const pv = pts[i - 1].smdt;
      const cv = pts[i].smdt;
      const px = xOf(i - 1);
      const cx = xOf(i);
      for (const th of [50, 70, 100]) {
        if ((pv < th && cv >= th) || (pv >= th && cv < th)) {
          const tt = (th - pv) / (cv - pv);
          coords.push({ x: px + (cx - px) * tt, y: yOf(th), v: th });
        }
      }
    }
    coords.push({ x: xOf(i), y: yOf(pts[i].smdt), v: pts[i].smdt });
  }

  const segs = [];
  let seg = null;
  for (const c of coords) {
    if (c.v >= 70) (seg || (seg = [])).push(c);
    else if (seg) {
      segs.push(seg);
      seg = null;
    }
  }
  if (seg) segs.push(seg);
  for (const s of segs) {
    if (s.length < 2) continue;
    const top = Math.min(...s.map((c) => c.y));
    const g = ctx.createLinearGradient(0, top, 0, y70);
    g.addColorStop(0, "rgba(34,197,94,.15)");
    g.addColorStop(1, "rgba(34,197,94,.01)");
    ctx.beginPath();
    ctx.moveTo(s[0].x, Math.min(s[0].y, y70));
    for (const c of s) ctx.lineTo(c.x, c.y);
    ctx.lineTo(s[s.length - 1].x, y70);
    ctx.lineTo(s[0].x, y70);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }

  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    const mid = (a.v + b.v) / 2;
    ctx.save();
    if (mid < 70) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = chLine(mid, mid < 50 ? 0.55 : 1);
    ctx.lineWidth = 2.3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  const step = pts.length <= 12 ? 1 : pts.length <= 24 ? 2 : 4;
  pts.forEach((p, i) => {
    const x = xOf(i);
    const y = yOf(p.smdt);
    const last = i === pts.length - 1;
    const milestone =
      last ||
      i === 0 ||
      i % step === 0 ||
      (p.smdt >= 70 && (i === 0 || pts[i - 1].smdt < 70)) ||
      (p.smdt < 70 && i > 0 && pts[i - 1].smdt >= 70);
    const col = chDot(p.smdt);
    const r = last ? 5 : 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0d1220";
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = last ? 2.4 : 1.6;
    ctx.globalAlpha = p.smdt < 50 ? 0.5 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (milestone) {
      const prev = i > 0 ? pts[i - 1].smdt : p.smdt;
      const up = p.smdt >= prev;
      const fs = last ? 10.5 : 9;
      ctx.font = `${last ? "700" : "500"} ${fs}px -apple-system,sans-serif`;
      ctx.fillStyle = p.smdt < 50 ? "rgba(110,125,150,.85)" : chLine(p.smdt, last ? 1 : 0.9);
      ctx.textAlign = "center";
      let ly = up ? y - r - 5 : y + r + fs + 2;
      if (ly < fs + 2) ly = y + r + fs + 2;
      if (ly > H - P.b) ly = y - r - 6;
      ctx.fillText(`${Math.round(p.smdt)}%`, x, ly);
    }
  });

  ctx.font = "500 8.5px -apple-system,sans-serif";
  ctx.fillStyle = "rgba(140,160,185,.7)";
  ctx.textAlign = "center";
  const idx = pts.length <= 8
    ? pts.map((_, i) => i)
    : [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor((3 * pts.length) / 4), pts.length - 1];
  [...new Set(idx)].forEach((i) => {
    if (i < 0 || i >= pts.length) return;
    ctx.fillText(fmtShort(pts[i].date), xOf(i), H - 6);
  });
}

function SmdtChart({ points, overlay, height = 150 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let raf = 0;
    const draw = () => {
      const parent = canvas.parentElement;
      const W = (parent ? parent.clientWidth : 0) || 320;
      const H = height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawSmdt(ctx, W, H, points, overlay);
    };
    draw();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [points, overlay, height]);

  if (!points || points.length < 2) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t4)", fontSize: 11 }}>Chưa đủ dữ liệu vẽ biểu đồ</div>;
  }
  return <canvas ref={ref} style={{ display: "block", width: "100%", height }} />;
}

function MiniTrend({ events, event, color }) {
  const points = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    const idx = sorted.findIndex((e) => e.date === event.date);
    return sorted.slice(Math.max(0, idx - 4), idx + 1);
  }, [event.date, events]);

  if (points.length < 2) return <div style={{ height: 54 }} />;

  const min = Math.max(0, Math.min(...points.map((p) => p.smdt)) - 18);
  const max = Math.max(...points.map((p) => p.smdt)) + 12;
  const range = max - min || 1;
  const coords = points.map((p, i) => ({
    x: 8 + (i / Math.max(1, points.length - 1)) * 164,
    y: 10 + (1 - (p.smdt - min) / range) * 34,
    value: p.smdt,
  }));
  const d = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const y70 = 10 + (1 - (STRONG_THRESHOLD - min) / range) * 34;

  return (
    <svg viewBox="0 0 180 54" preserveAspectRatio="none" style={{ width: "100%", height: 54, display: "block", marginTop: 2 }}>
      {y70 >= 10 && y70 <= 44 && <line x1="8" x2="172" y1={y70} y2={y70} stroke="rgba(255,159,10,.45)" strokeDasharray="4 4" strokeWidth="1" />}
      <polyline points={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === coords.length - 1 ? 3.3 : 2.2} fill="var(--surf)" stroke={p.value >= SUPER_THRESHOLD ? "var(--MU)" : color} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function KpiBar({ kpi }) {
  const { t } = useTheme();
  const items = [
    { value: kpi.branches, label: "Ngành hiển thị", color: t.G, icon: "ti-briefcase" },
    { value: kpi.events, label: "Lần vượt 70%", color: t.MU, icon: "ti-activity" },
    { value: kpi.recent, label: "Active 30N", color: t.B, icon: "ti-bolt" },
    { value: kpi.super, label: "Lần >= 100%", color: t.A, icon: "ti-flame" },
  ];

  return (
    <div style={styles.kpiGrid}>
      {items.map((item) => (
        <div key={item.label} style={styles.kpiCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <div style={{ ...styles.kpiValue, color: item.color, ...mono }}>{item.value}</div>
            <i className={`ti ${item.icon}`} style={{ color: item.color, fontSize: 17 }} />
          </div>
          <div style={styles.kpiLabel}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function MonthRuler({ d0, d1, totalMs, labelWidth }) {
  const months = [];
  const cursor = new Date(d0.getFullYear(), d0.getMonth(), 1);
  while (cursor <= d1) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div style={{ marginLeft: labelWidth, minWidth: 480, position: "relative", height: 27, borderBottom: "0.5px solid var(--bdr)" }}>
      {months.map((month) => {
        const iso = month.toISOString().slice(0, 10);
        const left = pctPos(iso, d0, totalMs);
        return (
          <div key={iso} style={{ position: "absolute", left: `${left}%`, bottom: 0, transform: "translateX(-1px)" }}>
            <div style={{ width: 1, height: 7, background: "var(--bdr)", marginBottom: 2 }} />
            <div style={styles.monthLabel}>T{month.getMonth() + 1}{month.getMonth() === 0 ? `/${month.getFullYear()}` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

function EventDot({ row, event, color, d0, totalMs, onOpen }) {
  const [hover, setHover] = useState(false);
  const left = pctPos(event.date, d0, totalMs);
  const big = event.smdt >= SUPER_THRESHOLD;
  const markerSize = big ? 20 : 15;
  const markerColor = big ? "var(--MU)" : color;

  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(row, event.date);
      }}
      style={{
        position: "absolute",
        top: "50%",
        left: `${left}%`,
        transform: "translate(-50%,-50%)",
        width: 28,
        height: 28,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
      }}
      title={`${row.label} · ${fmtDate(event.date)} · ${event.smdt.toFixed(1)}%`}
    >
      <span
        style={{
          width: markerSize,
          height: markerSize,
          borderRadius: "50%",
          background: markerColor,
          border: "1.5px solid var(--bg)",
          boxShadow: hover ? `0 0 0 5px ${markerColor}25` : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: big ? 10 : 8,
          lineHeight: 1,
        }}
      >
        {big && <i className="ti ti-star-filled" style={{ fontSize: 10 }} />}
      </span>
      {hover && (
        <span style={styles.tooltip}>
          <span>{fmtDate(event.date)}</span>
          <b style={{ color: big ? "var(--MU)" : "var(--G)", ...mono }}>{event.smdt.toFixed(1)}%</b>
        </span>
      )}
    </button>
  );
}

function TimelineRow({ row, active, d0, totalMs, labelWidth, onOpen, onSelect }) {
  const pinned = row.pinned;
  const rowHeight = labelWidth < 180 ? 56 : 46;
  return (
    <div
      onClick={() => onSelect(row.key)}
      style={{
        display: "flex",
        minHeight: rowHeight,
        cursor: "pointer",
        background: active ? "var(--Bs)" : "transparent",
        borderBottom: "0.5px solid var(--bdr)",
      }}
    >
      <div style={{ ...styles.timelineLabel, width: labelWidth, minHeight: rowHeight, color: pinned ? row.color : "var(--t2)", fontWeight: pinned ? 800 : 600 }}>
        {pinned && <i className="ti ti-star-filled" style={{ fontSize: 10, color: "var(--A)", flexShrink: 0 }} />}
        <span title={row.key} style={styles.timelineLabelText}>{row.label}</span>
      </div>
      <div style={{ ...styles.timelineTrack, height: rowHeight }}>
        <div style={styles.timelineLine} />
        {row.events.map((event) => (
          <EventDot key={`${row.key}-${event.date}`} row={row} event={event} color={row.color} d0={d0} totalMs={totalMs} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function EventTrail({ events, event }) {
  const trail = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    const idx = sorted.findIndex((e) => e.date === event.date);
    return sorted.slice(Math.max(0, idx - 3), idx + 1);
  }, [event.date, events]);

  if (trail.length < 2) return null;
  return (
    <div style={styles.trail}>
      {trail.map((item, index) => (
        <span key={item.date}>
          {index > 0 && <span style={{ color: "var(--t4)", margin: "0 4px" }}>›</span>}
          <span style={{ color: index === trail.length - 1 ? "var(--t1)" : "var(--t4)", fontWeight: index === trail.length - 1 ? 800 : 600 }}>{Math.round(item.smdt)}%</span>
        </span>
      ))}
    </div>
  );
}

function DetailCard({ row, event, active, onClick }) {
  const { t } = useTheme();
  const big = event.smdt >= SUPER_THRESHOLD;
  const meta = big
    ? { label: ">= 100% · Rất mạnh", color: t.MU, bg: t.MUs, border: t.MUb }
    : { label: "70-99% · Mạnh", color: t.G, bg: t.Gs, border: t.Gb };

  return (
    <button
      type="button"
      onClick={() => onClick(event.date)}
      style={{
        ...styles.detailCard,
        background: active ? `${row.color}18` : "var(--elev)",
        borderColor: active ? row.color : "var(--bdr)",
        boxShadow: active ? `0 0 0 1.5px ${row.color} inset` : "none",
      }}
    >
      {active && <span style={{ ...styles.activeDot, background: row.color }} />}
      <div style={styles.detailDate}>{fmtDate(event.date)}</div>
      <div style={{ ...styles.detailValue, color: big ? t.MU : t.G, ...mono }}>{event.smdt.toFixed(1)}%</div>
      <EventTrail events={row.events} event={event} />
      <MiniTrend events={row.events} event={event} color={row.color} />
      <div style={styles.cardFooter}>
        <span style={{ ...styles.strengthPill, color: meta.color, background: meta.bg, borderColor: meta.border }}>{meta.label}</span>
        <span style={styles.expandHint}>Mã trong ngành</span>
      </div>
    </button>
  );
}

function peerTag(value, branchNow) {
  if (value >= STRONG_THRESHOLD && branchNow < STRONG_THRESHOLD) return { label: "đi trước", color: "#3DD68C", bg: "rgba(61,214,140,.12)" };
  if (value >= STRONG_THRESHOLD && branchNow >= STRONG_THRESHOLD) return { label: "đi cùng", color: "#a78bfa", bg: "rgba(124,58,237,.1)" };
  if (value >= 50) return { label: "tiềm cận", color: "#F0A800", bg: "rgba(240,168,0,.1)" };
  return { label: "đi sau", color: "#5a6a80", bg: "rgba(60,80,110,.15)" };
}

function MaDrawer({ item, peers, row, eventDate, tickerData, smdtData, onClose }) {
  const { t } = useTheme();
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState(10);

  const smdt = item.value;
  const delta = Number.isFinite(item.prev) ? smdt - item.prev : null;

  const tSeries = useMemo(
    () => seriesUpTo(tickerData.matrix, tickerData.datesAsc, item.ticker, eventDate),
    [tickerData.matrix, tickerData.datesAsc, item.ticker, eventDate]
  );
  const bSeries = useMemo(
    () => seriesUpTo(smdtData.matrix, smdtData.datesAsc, row.key, eventDate),
    [smdtData.matrix, smdtData.datesAsc, row.key, eventDate]
  );
  const mktSeries = useMemo(
    () => seriesUpTo(smdtData.matrix, smdtData.datesAsc, "Ngân hàng", eventDate),
    [smdtData.matrix, smdtData.datesAsc, eventDate]
  );

  const branchNow = bSeries.length ? bSeries[bSeries.length - 1].smdt : 0;
  const marketNow = mktSeries.length ? mktSeries[mktSeries.length - 1].smdt : 0;

  const sortedPeers = useMemo(() => [...peers].sort((a, b) => b.value - a.value), [peers]);
  const rank = sortedPeers.findIndex((p) => p.ticker === item.ticker) + 1;
  const nTotal = sortedPeers.length;
  const nAbove70 = sortedPeers.filter((p) => p.value >= STRONG_THRESHOLD).length;

  const overviewPts = useMemo(() => tSeries.slice(-15), [tSeries]);
  const histPts = useMemo(() => tSeries.slice(-range), [tSeries, range]);
  const histOverlay = useMemo(() => {
    const byDate = new Map(bSeries.map((p) => [p.date, p.smdt]));
    return histPts.map((p) => ({ smdt: byDate.has(p.date) ? byDate.get(p.date) : null }));
  }, [bSeries, histPts]);

  const sCol = smdt >= 100 ? "#1A8A4A" : smdt >= 70 ? "#3DD68C" : smdt >= 50 ? "#F0A800" : smdt >= 0 ? "#8899aa" : "#FF2D55";
  const statusLabel = smdt >= 100 ? "Rất mạnh" : smdt >= 70 ? "Tích lũy mạnh" : smdt >= 50 ? "Tiềm cận" : smdt >= 0 ? "Theo dõi" : "Phân phối";
  const stateLabel = smdt >= 70 ? "Mã mạnh" : smdt >= 50 ? "Tiềm cận" : smdt >= 0 ? "Theo dõi" : "Phân phối";
  const ngPos = branchNow >= 70 ? "Dẫn sóng" : branchNow >= 50 ? "Tiềm cận" : "Theo dõi";

  const step1 = smdt >= STRONG_THRESHOLD;
  const step2 = branchNow >= STRONG_THRESHOLD;
  let wave;
  if (step1 && !step2) {
    wave = {
      label: "Mã đi trước",
      badge: { color: "#3DD68C", bg: "rgba(61,214,140,.12)", border: "rgba(61,214,140,.3)" },
      tone: { color: "#3DD68C", bg: "rgba(61,214,140,.06)", border: "rgba(61,214,140,.18)" },
      icon: "ti-bolt",
      title: `${item.ticker} đang đi trước ngành — giai đoạn sớm nhất`,
      text: `Mã vượt 70% SMDT trước khi ngành xác nhận là dấu hiệu dòng tiền vào sớm nhất. Ngành ${row.label} (${branchNow.toFixed(1)}%) chưa xác nhận. Theo dõi lan tỏa nội ngành mở rộng.`,
    };
  } else if (step1 && step2) {
    wave = {
      label: "Mã đi cùng sóng",
      badge: { color: "#a78bfa", bg: "rgba(124,58,237,.12)", border: "rgba(124,58,237,.3)" },
      tone: { color: "#a78bfa", bg: "rgba(124,58,237,.06)", border: "rgba(124,58,237,.18)" },
      icon: "ti-arrows-right",
      title: `${item.ticker} đi cùng nhịp với ngành — cấu trúc xác nhận`,
      text: `Ngành ${row.label} (${branchNow.toFixed(1)}%) đã vượt ngưỡng 70%. Mã và ngành đồng pha — giai đoạn giữa sóng, còn dư địa nếu lan tỏa tiếp tục mở rộng.`,
    };
  } else if (!step1 && step2) {
    wave = {
      label: "Mã đi sau",
      badge: { color: "#F0A800", bg: "rgba(240,168,0,.12)", border: "rgba(240,168,0,.3)" },
      tone: { color: "#F0A800", bg: "rgba(240,168,0,.06)", border: "rgba(240,168,0,.18)" },
      icon: "ti-hourglass",
      title: `${item.ticker} đi sau ngành — rủi ro vào muộn`,
      text: `Ngành ${row.label} đã xác nhận (${branchNow.toFixed(1)}%) nhưng ${item.ticker} chưa đạt 70%. Đây là mã đi sau — xác suất thành công thấp hơn mã đi trước và đi cùng.`,
    };
  } else {
    wave = {
      label: "Ngoài sóng",
      badge: { color: "#5a6a80", bg: "rgba(60,80,110,.15)", border: "rgba(60,80,110,.25)" },
      tone: { color: "#8899aa", bg: "rgba(255,45,85,.05)", border: "rgba(255,45,85,.15)" },
      icon: "ti-alert-triangle",
      title: `${item.ticker} chưa vào sóng`,
      text: `SMDT ${smdt.toFixed(1)}% — cả mã lẫn ngành chưa vượt ngưỡng 70%. Chưa đủ điều kiện tham gia theo hệ thống.`,
    };
  }

  const last5 = tSeries.slice(-5).map((p) => p.smdt);
  let flow = { label: "Theo dõi", sub: "—", tone: { bg: "rgba(92,112,144,.08)", border: "rgba(92,112,144,.2)", color: t.t3 } };
  if (last5.length >= 2) {
    const ups = last5.filter((v, i) => i > 0 && v > last5[i - 1]).length;
    if (smdt >= 70 && ups >= 3) flow = { label: "Tiếp tục đổ vào", sub: `Tăng ${ups}/${last5.length - 1} phiên`, tone: { bg: "rgba(61,214,140,.08)", border: "rgba(61,214,140,.25)", color: "#3DD68C" } };
    else if (smdt >= 70) flow = { label: "Tích lũy mạnh", sub: "Duy trì trên 70%", tone: { bg: "rgba(61,214,140,.08)", border: "rgba(61,214,140,.25)", color: "#3DD68C" } };
    else if (smdt >= 50) flow = { label: "Tích lũy", sub: "Đang tiềm cận ngưỡng", tone: { bg: "rgba(240,168,0,.08)", border: "rgba(240,168,0,.2)", color: "#F0A800" } };
    else if (smdt >= 0) flow = { label: "Phân tán", sub: "Dòng tiền chưa rõ", tone: { bg: "rgba(92,112,144,.08)", border: "rgba(92,112,144,.2)", color: t.t3 } };
    else flow = { label: "Rút ròng", sub: "SMDT âm — thận trọng", tone: { bg: "rgba(255,45,85,.08)", border: "rgba(255,45,85,.2)", color: "#FF2D55" } };
  }

  const histVals = histPts.map((p) => p.smdt);
  const histCur = histVals.length ? histVals[histVals.length - 1] : 0;
  const histPrev = histVals.length > 1 ? histVals[histVals.length - 2] : histCur;
  const histDelta = histCur - histPrev;
  const histMax = histVals.length ? Math.max(...histVals) : 0;
  const histMin = histVals.length ? Math.min(...histVals) : 0;
  const histAvg = histVals.length ? histVals.reduce((a, b) => a + b, 0) / histVals.length : 0;
  const histStrong = histPts.filter((p) => p.smdt >= STRONG_THRESHOLD).length;

  const events70 = useMemo(() => crossUps(tSeries), [tSeries]);

  const tabs = [
    { key: "overview", label: "Tổng quan" },
    { key: "history", label: "Lịch sử SMDT" },
    { key: "context", label: "Bối cảnh ngành" },
  ];

  const timelineNode = (done, waiting, label) => (
    <div
      style={{
        width: done ? 32 : 28,
        height: done ? 32 : 28,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 800,
        flexShrink: 0,
        border: "1.5px solid",
        background: done ? "rgba(61,214,140,.1)" : "rgba(40,50,70,.5)",
        borderColor: done ? "rgba(61,214,140,.5)" : "rgba(60,80,110,.4)",
        color: done ? "#3DD68C" : "#3a4a60",
        opacity: done ? 1 : waiting ? 0.7 : 0.35,
      }}
    >
      {done ? <i className="ti ti-check" /> : label}
    </div>
  );

  return (
    <div style={styles.mdr}>
      <div style={styles.mdrHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <span style={{ ...styles.mdrPill, ...mono }}>{item.ticker}</span>
          <div style={{ minWidth: 0 }}>
            <div style={styles.mdrName}>{item.name} · {row.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: sCol, ...mono }}>{smdt.toFixed(1)}%</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ ...styles.mdrStatus, color: sCol, background: `${sCol}22` }}>{statusLabel}</span>
          <button type="button" onClick={onClose} title="Đóng" style={styles.mdrClose}><i className="ti ti-x" /></button>
        </div>
      </div>

      <div style={styles.mdrTabs}>
        {tabs.map((item2) => (
          <button
            key={item2.key}
            type="button"
            onClick={() => setTab(item2.key)}
            style={{ ...styles.mdrTab, ...(tab === item2.key ? styles.mdrTabActive : null) }}
          >
            {item2.label}
          </button>
        ))}
      </div>

      <div style={styles.mdrBody}>
        {tab === "overview" && (
          <>
            <div style={styles.mdrKpis}>
              <div style={styles.mdrKpi}>
                <div style={{ ...styles.mdrKpiV, color: sCol, ...mono }}>{smdt.toFixed(1)}%</div>
                <div style={styles.mdrKpiL}>SMDT hôm nay</div>
                {delta != null && (
                  <div style={{ ...styles.mdrKpiSub, color: delta >= 0 ? "#3DD68C" : "#FF2D55" }}>
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% so với phiên trước
                  </div>
                )}
              </div>
              <div style={styles.mdrKpi}>
                <div style={{ ...styles.mdrKpiV, fontSize: 16 }}>{stateLabel}</div>
                <div style={styles.mdrKpiL}>Trạng thái</div>
                {tSeries.length > 0 && <div style={styles.mdrKpiSub}>Từ {fmtDate(tSeries[0].date)}</div>}
              </div>
              <div style={styles.mdrKpi}>
                <div style={{ ...styles.mdrKpiV, color: branchNow >= 70 ? "#3DD68C" : branchNow >= 50 ? "#F0A800" : t.t2, ...mono }}>{branchNow.toFixed(1)}%</div>
                <div style={styles.mdrKpiL}>SMDT ngành</div>
                <div style={{ ...styles.mdrKpiSub, color: "var(--B)", fontWeight: 700 }}>{ngPos}</div>
              </div>
              <div style={styles.mdrKpi}>
                <div style={{ ...styles.mdrKpiV, color: rank === 1 ? "#3DD68C" : rank <= 3 ? "#a78bfa" : t.t1 }}>{rank ? `#${rank}` : "--"}</div>
                <div style={styles.mdrKpiL}>Xếp hạng dòng</div>
                <div style={styles.mdrKpiSub}>{rank ? `${rank}/${nTotal} mã` : `${nTotal} mã`}</div>
              </div>
            </div>

            <div style={styles.mdrBlock}>
              <div style={styles.mdrBlockLabel}>Diễn biến SMDT · {overviewPts.length} phiên gần nhất</div>
              <SmdtChart points={overviewPts} height={150} />
            </div>

            <div style={styles.mdrWaveSec}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={styles.mdrBlockLabel}>Vị trí trong cấu trúc sóng</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", color: wave.badge.color, background: wave.badge.bg, border: `.5px solid ${wave.badge.border}` }}>{wave.label}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 0, margin: "2px 0" }}>
                {timelineNode(step1, false, "1")}
                <div style={{ flex: 1, height: 2, background: step1 ? "rgba(61,214,140,.35)" : "rgba(60,80,110,.25)" }} />
                {timelineNode(step2, step1, "2")}
                <div style={{ flex: 1, height: 2, background: step2 ? "rgba(61,214,140,.35)" : "rgba(60,80,110,.25)" }} />
                {timelineNode(step1 && step2 && nAbove70 >= Math.ceil(nTotal * 0.5), step2, "3")}
              </div>
              <div style={{ display: "flex", fontSize: 9, color: "var(--t3)", justifyContent: "space-between" }}>
                <span style={{ color: step1 ? "#3DD68C" : "#3a4a60", fontWeight: 700 }}>Mã {smdt.toFixed(0)}%</span>
                <span style={{ color: step2 ? "#3DD68C" : "#F0A800", fontWeight: 700 }}>Ngành {branchNow.toFixed(0)}%</span>
                <span>Lan tỏa {nAbove70}/{nTotal}</span>
              </div>

              <div style={{ display: "flex", gap: 9, padding: "11px 12px", borderRadius: 8, background: wave.tone.bg, border: `.5px solid ${wave.tone.border}` }}>
                <i className={`ti ${wave.icon}`} style={{ fontSize: 15, flexShrink: 0, marginTop: 1, color: wave.tone.color }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", marginBottom: 3, lineHeight: 1.3 }}>{wave.title}</div>
                  <div style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5 }}>{wave.text}</div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={styles.mdrBlockLabel}>Lan tỏa nội ngành · {row.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: nAbove70 >= Math.ceil(nTotal * 0.6) ? "#3DD68C" : nAbove70 >= 2 ? "#F0A800" : "#FF2D55", background: "rgba(255,255,255,.04)" }}>
                    {nAbove70 >= Math.ceil(nTotal * 0.6) ? "Lan tỏa tốt" : nAbove70 >= 2 ? "Chưa lan tỏa" : "Phân hóa cục bộ"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {sortedPeers.slice(0, 7).map((p) => {
                    const tag = peerTag(p.value, branchNow);
                    const pct = Math.max(0, Math.min(100, p.value));
                    const barCol = p.value >= 70 ? "#3DD68C" : p.value >= 50 ? "#F0A800" : "rgba(90,110,130,.5)";
                    const me = p.ticker === item.ticker;
                    return (
                      <div key={p.ticker} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: me ? "rgba(124,58,237,.06)" : "var(--bg)", borderRadius: 7, border: `.5px solid ${me ? "rgba(124,58,237,.4)" : "rgba(255,255,255,.04)"}` }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", width: 40, flexShrink: 0, ...mono }}>{p.ticker}</span>
                        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,.07)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barCol, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, width: 44, textAlign: "right", flexShrink: 0, color: p.value >= 70 ? "#3DD68C" : p.value >= 50 ? "#F0A800" : "#4a5a70", ...mono }}>{p.value.toFixed(1)}%</span>
                        <span style={{ fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 7, flexShrink: 0, width: 50, textAlign: "center", whiteSpace: "nowrap", color: tag.color, background: tag.bg }}>{tag.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ borderRadius: 12, padding: 14, border: `.5px solid ${flow.tone.border}`, background: flow.tone.bg }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: flow.tone.color }}>Dòng tiền nội</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>{flow.label}</div>
                <div style={{ fontSize: 11, color: "var(--t2)" }}>{flow.sub}</div>
              </div>
              <div style={{ borderRadius: 12, padding: 14, border: `.5px solid ${rank === 1 ? "rgba(61,214,140,.25)" : "rgba(240,168,0,.2)"}`, background: rank === 1 ? "rgba(61,214,140,.08)" : "rgba(240,168,0,.08)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: rank <= 2 ? "#3DD68C" : "#F0A800" }}>Xếp hạng ngành</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>{rank === 1 ? "Dẫn đầu ngành" : rank <= 3 ? `Top ${rank} ngành` : `#${rank}/${nTotal} ngành`}</div>
                <div style={{ fontSize: 11, color: "var(--t2)" }}>SMDT {smdt.toFixed(1)}% · ngành {branchNow.toFixed(1)}%</div>
              </div>
            </div>
          </>
        )}

        {tab === "history" && (
          <>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ r: 10, l: "10 phiên" }, { r: 21, l: "1 tháng" }, { r: 60, l: "3 tháng" }].map((o) => (
                <button key={o.r} type="button" onClick={() => setRange(o.r)} style={{ ...styles.mdrTimeTab, ...(range === o.r ? styles.mdrTimeTabActive : null) }}>{o.l}</button>
              ))}
            </div>
            <div style={styles.mdrBlock}>
              <SmdtChart points={histPts} overlay={histOverlay} height={210} />
              <div style={{ marginTop: 6, fontSize: 9, color: "var(--t3)", display: "flex", gap: 12 }}>
                <span><span style={{ color: "#3DD68C" }}>—</span> mã</span>
                <span><span style={{ color: "rgba(130,150,180,.8)" }}>┈</span> ngành</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[
                { v: `${histCur.toFixed(1)}%`, l: "Hôm nay", c: histCur >= 70 ? "#3DD68C" : histCur >= 50 ? "#F0A800" : "#8899aa", d: `${histDelta >= 0 ? "▲" : "▼"}${Math.abs(histDelta).toFixed(1)}%`, dc: histDelta >= 0 ? "#3DD68C" : "#FF2D55" },
                { v: `${histMax.toFixed(1)}%`, l: "Đỉnh kỳ", c: "#3DD68C" },
                { v: `${histMin.toFixed(1)}%`, l: "Đáy kỳ", c: "#FF2D55" },
                { v: `${histAvg.toFixed(1)}%`, l: "Trung bình" },
                { v: `${histStrong}`, l: "Phiên ≥70%" },
                { v: `${histPts.length}`, l: "Số phiên" },
              ].map((s) => (
                <div key={s.l} style={styles.mdrStat}>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.1, color: s.c || "var(--t1)", ...mono }}>{s.v}</div>
                  <div style={styles.mdrStatL}>{s.l}</div>
                  {s.d && <div style={{ fontSize: 10, fontWeight: 700, color: s.dc }}>{s.d}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "context" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div style={styles.mdrPillar}>
                <div style={styles.mdrPillarL}>Sóng thị trường</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: marketNow >= 70 ? "#3DD68C" : marketNow >= 50 ? "#F0A800" : "#5a6a80" }}>{marketNow >= 70 ? "Dẫn sóng" : marketNow >= 50 ? "Hồi phục" : "Tích lũy"}</div>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>NH: {marketNow.toFixed(1)}%</div>
              </div>
              <div style={{ ...styles.mdrPillar, ...(branchNow >= 70 ? { borderColor: "rgba(61,214,140,.3)", background: "rgba(61,214,140,.05)" } : null) }}>
                <div style={styles.mdrPillarL}>Ngành {row.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: branchNow >= 70 ? "#3DD68C" : branchNow >= 50 ? "#F0A800" : "#5a6a80" }}>{ngPos}</div>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>{branchNow.toFixed(1)}%</div>
              </div>
              <div style={{ ...styles.mdrPillar, ...(smdt >= 70 ? { borderColor: "rgba(124,58,237,.3)", background: "rgba(124,58,237,.05)" } : null) }}>
                <div style={styles.mdrPillarL}>Xếp hạng dòng</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: rank === 1 ? "#3DD68C" : rank <= 3 ? "#a78bfa" : "var(--t1)" }}>{rank === 1 ? "#1 dẫn đầu" : rank <= 3 ? `Top ${rank}` : `#${rank}/${nTotal}`}</div>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>SMDT {smdt.toFixed(1)}%</div>
              </div>
            </div>

            <div>
              <div style={{ ...styles.mdrBlockLabel, marginBottom: 8 }}>Lịch sử các lần đạt chuẩn mã mạnh</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {events70.length ? (
                  events70.map((e) => {
                    const big = e.smdt >= 100;
                    const barCol = big ? "#1A8A4A" : "#3DD68C";
                    const pct = Math.min(100, Math.max(0, e.smdt));
                    return (
                      <div key={e.date} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--surf)", borderRadius: 8, border: ".5px solid var(--bdr)" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: barCol }} />
                        <span style={{ fontSize: 11, color: "var(--t2)", width: 84, flexShrink: 0 }}>{fmtDate(e.date)}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, width: 52, flexShrink: 0, color: barCol, ...mono }}>{e.smdt.toFixed(1)}%</span>
                        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,.07)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barCol, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0, color: big ? "#1A8A4A" : "#3DD68C", background: big ? "rgba(26,138,74,.2)" : "rgba(61,214,140,.12)" }}>{big ? "≥ 100%" : "Dẫn sóng"}</span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 11, color: "var(--t3)", padding: "8px 10px" }}>Chưa có lịch sử đạt chuẩn mã mạnh trong dữ liệu.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TickerTable({ row, eventDate, tickerData, branchPath, smdtData }) {
  const { t } = useTheme();
  const [openTicker, setOpenTicker] = useState(null);
  const selectedBranchPath = useMemo(() => resolveBranchPath(row, branchPath), [branchPath, row]);
  const performanceMonth = toPerformanceMonth(eventDate);
  const performance = usePerformance(selectedBranchPath, performanceMonth);

  useEffect(() => {
    setOpenTicker(null);
  }, [eventDate, row.key]);

  const rows = useMemo(() => {
    const uniqueByTicker = new Map();
    for (const perf of performance.rows) {
      const ticker = perf.ticker;
      if (!ticker || uniqueByTicker.has(ticker)) continue;
      const meta = tickerData.tickers.find((item) => item.key === ticker);
      const point = getValueAtOrBefore(tickerData.matrix, tickerData.datesAsc, ticker, eventDate);
      const signal = point.value == null
        ? { label: "Theo dõi", color: t.t3, bg: "var(--elev)" }
        : signalMeta(point.value, point.prev, t);
      uniqueByTicker.set(ticker, {
        ticker,
        name: meta?.name || ticker,
        branch: perf.branch || row.label,
        value: point.value,
        prev: point.prev,
        date: point.date,
        leadDate: perf.leadDate,
        bottomDate: perf.bottomDate,
        topDate: perf.topDate,
        bottomPrice: perf.bottomPrice,
        topPrice: perf.topPrice,
        delta: perf.performancePct,
        signal,
      });
    }

    return [...uniqueByTicker.values()].sort(sortTickerAsc).slice(0, 60);
  }, [eventDate, performance.rows, row.label, t, tickerData.datesAsc, tickerData.matrix, tickerData.tickers]);

  if (branchPath.status === "loading" && !selectedBranchPath) {
    return <Loading label="Đang tải path ngành…" compact style={{ marginBottom: 0, padding: "12px 4px" }} />;
  }

  if (!selectedBranchPath) {
    return <div style={styles.tableNotice}>Chưa tìm được branch_path cho ngành {row.label} từ API BranchPath.</div>;
  }

  if (performance.status === "loading" && !rows.length) {
    return <Loading label="Đang tải hiệu suất mã trong ngành…" compact style={{ marginBottom: 0, padding: "12px 4px" }} />;
  }

  if (performance.status === "error" && !rows.length) {
    return (
      <div style={styles.tableNotice}>
        Lỗi tải performance: {performance.error}{" "}
        <button type="button" onClick={performance.refresh} style={styles.textBtn}>Thử lại</button>
      </div>
    );
  }

  if (!rows.length) {
    return <div style={styles.tableNotice}>Chưa có mã performance cho branch_path {selectedBranchPath}.</div>;
  }

  return (
    <div style={styles.tablePanel}>
      <div style={styles.tableTitle}>
        <span>Mã trong dòng · {fmtDate(eventDate)}</span>
        <span style={{ color: "var(--t4)", fontWeight: 600 }}>{rows.length} mã · branch_path {selectedBranchPath}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: 54 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 126 }} />
            <col style={{ width: 128 }} />
          </colgroup>
          <thead>
            <tr>
              {["STT", "Mã", "Ngành", "SMDT", "HIỆU SUẤT", "Tín hiệu", "Phiên"].map((col, index) => (
                <th key={col} style={{ ...styles.th, textAlign: index === 3 ? "center" : index === 4 ? "right" : "left" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr
                key={item.ticker}
                onClick={() => {
                  if (item.value == null) return;
                  setOpenTicker((cur) => (cur === item.ticker ? null : item.ticker));
                }}
                style={{ cursor: item.value == null ? "default" : "pointer", background: openTicker === item.ticker ? "var(--Bs)" : "transparent" }}
              >
                <td style={styles.tdMuted}>{index + 1}</td>
                <td style={styles.td}>
                  <div style={{ fontWeight: 850, color: "var(--t1)", ...mono }}>{item.ticker}</div>
                  <div style={styles.tickerName}>{item.name}</div>
                </td>
                <td style={styles.tdMuted}>{item.branch}</td>
                <td style={{ ...styles.td, textAlign: "center" }}>
                  {item.value == null ? (
                    <span style={{ color: "var(--t4)" }}>--</span>
                  ) : (
                    <span style={{ ...styles.smdtPill, color: smdtColor(item.value, t), background: `${smdtColor(item.value, t)}18`, borderColor: `${smdtColor(item.value, t)}33`, ...mono }}>
                      {item.value.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td
                  style={{ ...styles.td, textAlign: "right", color: item.delta == null ? "var(--t4)" : item.delta >= 0 ? t.G : t.R, ...mono }}
                  title={[
                    item.bottomDate && `Đáy ${fmtDate(item.bottomDate)}${Number.isFinite(item.bottomPrice) ? `: ${item.bottomPrice}` : ""}`,
                    item.topDate && `Đỉnh ${fmtDate(item.topDate)}${Number.isFinite(item.topPrice) ? `: ${item.topPrice}` : ""}`,
                  ].filter(Boolean).join(" · ")}
                >
                  {item.delta == null ? "--" : `${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(2)}%`}
                </td>
                <td style={styles.td}>
                  <span style={{ ...styles.signalPill, background: item.signal.bg, color: item.signal.color }}>{item.signal.label}</span>
                </td>
                <td style={styles.tdMuted} title="Phiên SMDT từ getSMDTTickerCross">
                  {fmtDate(item.date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openTicker && (() => {
        const active = rows.find((item) => item.ticker === openTicker);
        if (!active) return null;
        return (
          <MaDrawer
            item={active}
            peers={rows}
            row={row}
            eventDate={eventDate}
            tickerData={tickerData}
            smdtData={smdtData}
            onClose={() => setOpenTicker(null)}
          />
        );
      })()}
    </div>
  );
}

function DetailPanel({ row, highlightDate, onClose, tickerData, branchPath, smdtData }) {
  const [activeDate, setActiveDate] = useState(() => resolveActiveEventDate(row, highlightDate));
  const panelRef = useRef(null);

  useEffect(() => {
    setActiveDate(resolveActiveEventDate(row, highlightDate));
  }, [highlightDate, row.key, row.events]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    return () => window.clearTimeout(id);
  }, [highlightDate, row.key]);

  const eventsDesc = useMemo(() => [...row.events].sort((a, b) => b.date.localeCompare(a.date)), [row.events]);

  return (
    <section ref={panelRef} style={styles.detailPanel}>
      <div style={styles.detailHeader}>
        <span style={{ ...styles.legendDot, background: row.color }} />
        <div style={{ minWidth: 0 }}>
          <div style={styles.detailTitle}>{row.label}</div>
          <div style={styles.detailSub}>{eventsDesc.length} lần vượt 70% · gần nhất {fmtDate(row.lastDate)}</div>
        </div>
        <button type="button" onClick={onClose} title="Đóng" style={styles.iconBtn}>
          <i className="ti ti-x" />
        </button>
      </div>
      <div style={styles.detailGrid}>
        {eventsDesc.map((event) => (
          <DetailCard key={event.date} row={row} event={event} active={event.date === activeDate} onClick={setActiveDate} />
        ))}
      </div>
      {activeDate && <TickerTable row={row} eventDate={activeDate} tickerData={tickerData} branchPath={branchPath} smdtData={smdtData} />}
    </section>
  );
}

function ManageModal({ rows, visibleSet, onClose, onSave }) {
  const [temp, setTemp] = useState(() => new Set(visibleSet || rows.map((row) => row.key)));
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const pinnedRows = rows.filter((row) => row.pinned && (!q || row.label.toLowerCase().includes(q) || row.key.toLowerCase().includes(q)));
  const restRows = rows.filter((row) => !row.pinned && (!q || row.label.toLowerCase().includes(q) || row.key.toLowerCase().includes(q)));

  const toggle = (key) => {
    setTemp((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectRows = (items, selected) => {
    setTemp((prev) => {
      const next = new Set(prev);
      for (const row of items) {
        if (selected) next.add(row.key);
        else next.delete(row.key);
      }
      return next;
    });
  };

  const section = (label, items, pinned) => {
    if (!items.length) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={styles.modalSectionHeader}>
          <span>{pinned && <i className="ti ti-star-filled" style={{ color: "var(--A)", marginRight: 5 }} />}{label} <b>{items.length}</b></span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => selectRows(items, true)} style={styles.textBtn}>Tất cả</button>
            <button type="button" onClick={() => selectRows(items, false)} style={styles.textBtn}>Bỏ</button>
          </span>
        </div>
        <div style={styles.modalGrid}>
          {items.map((row) => {
            const checked = temp.has(row.key);
            return (
              <button key={row.key} type="button" onClick={() => toggle(row.key)} style={{ ...styles.modalRow, background: checked ? "var(--Bs)" : "transparent", borderColor: checked ? "var(--Bb)" : "var(--bdr)" }}>
                <span style={{ ...styles.legendDot, width: 8, height: 8, background: row.color }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", color: checked ? "var(--t1)" : "var(--t2)" }}>{row.label}</span>
                <span style={{ ...styles.checkBox, background: checked ? "var(--B)" : "transparent", borderColor: checked ? "var(--B)" : "var(--bdr)" }}>
                  {checked && <i className="ti ti-check" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.modalTitle}>Quản lý ngành theo dõi</div>
            <div style={styles.modalSub}>Bật/tắt các ngành xuất hiện trên timeline</div>
          </div>
          <div style={styles.modalCount}>{temp.size}/{rows.length} ngành</div>
          <button type="button" onClick={onClose} title="Đóng" style={styles.closeBtn}><i className="ti ti-x" /></button>
        </div>
        <div style={styles.modalToolbar}>
          <div style={styles.modalSearch}>
            <i className="ti ti-search" style={{ color: "var(--t4)", fontSize: 15 }} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm ngành..." style={styles.searchInput} />
          </div>
          <div style={styles.modalActions}>
            <button type="button" onClick={() => setTemp(new Set(rows.map((row) => row.key)))} style={styles.actionLink}>
              Chọn tất cả
            </button>
            <button type="button" onClick={() => setTemp(new Set())} style={styles.actionLink}>
              Bỏ chọn tất cả
            </button>
            <button type="button" onClick={() => setTemp(new Set(rows.filter((row) => row.pinned).map((row) => row.key)))} style={styles.actionLink}>
              Chỉ chủ lực
            </button>
          </div>
        </div>
        <div style={styles.modalBody}>
          {section("Chủ lực", pinnedRows, true)}
          {section("Ngành phụ", restRows, false)}
          {!pinnedRows.length && !restRows.length && <div style={styles.empty}>Không tìm thấy ngành phù hợp</div>}
        </div>
        <div style={styles.modalFooter}>
          <button
            type="button"
            onClick={() => onSave(temp.size ? temp : new Set(rows.map((row) => row.key)))}
            style={styles.primaryBtn}
          >
            Lưu
          </button>
          <button type="button" onClick={onClose} style={styles.secondaryBtn}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

function buildRows({ branches, datesAsc, matrix }) {
  const coreLabels = new Map(CORE_BRANCHES.map((item) => [item.key, item.label]));

  return branches
    .map((branch, index) => {
      const events = datesAsc
        .map((date) => ({ date, smdt: toNumber(matrix[branch.key]?.[date]) }))
        .filter((item) => item.smdt != null && item.smdt >= STRONG_THRESHOLD);
      if (!events.length) return null;
      const last = events[events.length - 1];
      const pinnedOrder = pinnedOrderOfIndustry(branch.key);
      const pinned = pinnedOrder >= 0;
      return {
        key: branch.key,
        label: branch.key === "BĐS Dân cư" ? "BĐS Dân cư" : coreLabels.get(branch.key) || branch.label || branch.key,
        color: COLORS[index % COLORS.length],
        pinned,
        pinnedOrder: pinned ? pinnedOrder : 999,
        events,
        lastDate: last.date,
        lastSmdt: last.smdt,
      };
    })
    .filter(Boolean);
}

export function ModLoTrinhDanSong() {
  const narrow = useNarrow();
  const { t } = useTheme();
  const smdt = useSMDTBranchCross();
  const tickers = useSMDTTickerCross();
  const branchPath = useBranchPath();
  useRealtimeSMDTBranchCrossFeed(smdt.applyTick);
  useRealtimeSMDTTickerCrossFeed(tickers.applyTick);

  const [year, setYear] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [highlightDate, setHighlightDate] = useState(null);
  const [visibleSet, setVisibleSet] = useState(loadVisibleSet);
  const [showManage, setShowManage] = useState(false);

  const allRows = useMemo(() => buildRows(smdt), [smdt.branches, smdt.datesAsc, smdt.matrix]);

  useEffect(() => {
    if (!allRows.length) return;
    setVisibleSet((prev) => {
      if (!prev) return new Set(allRows.map((row) => row.key));
      const valid = new Set(allRows.map((row) => row.key));
      const next = new Set([...prev].filter((key) => valid.has(key)));
      return next.size ? next : valid;
    });
  }, [allRows]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (showManage) setShowManage(false);
      else if (selectedKey) setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKey, showManage]);

  const years = useMemo(() => [...new Set(allRows.flatMap((row) => row.events.map((event) => event.date.slice(0, 4))))].sort(), [allRows]);
  const latestYear = years[years.length - 1] ? Number(years[years.length - 1]) : null;

  useEffect(() => {
    if (year == null && latestYear != null) setYear(latestYear);
  }, [latestYear, year]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = visibleSet || new Set(allRows.map((row) => row.key));
    return allRows
      .filter((row) => visible.has(row.key))
      .map((row) => (year ? { ...row, events: row.events.filter((event) => event.date.startsWith(String(year))) } : row))
      .filter((row) => row.events.length)
      .filter((row) => (q ? row.label.toLowerCase().includes(q) || row.key.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (a.pinnedOrder !== b.pinnedOrder) return a.pinnedOrder - b.pinnedOrder;
        return b.events[b.events.length - 1].date.localeCompare(a.events[a.events.length - 1].date);
      });
  }, [allRows, query, visibleSet, year]);

  const bounds = useMemo(() => {
    const dates = filteredRows.flatMap((row) => row.events.map((event) => event.date)).sort();
    const min = dates[0] || smdt.datesAsc[0] || new Date().toISOString().slice(0, 10);
    const max = dates[dates.length - 1] || smdt.datesAsc[smdt.datesAsc.length - 1] || min;
    const d0 = year ? new Date(`${year}-01-01`) : new Date(min);
    const d1 = year ? new Date(`${year}-12-31`) : new Date(max);
    return { d0, d1, totalMs: Math.max(1, d1 - d0), maxDate: max };
  }, [filteredRows, smdt.datesAsc, year]);

  const kpi = useMemo(() => {
    let events = 0;
    let superEvents = 0;
    let recent = 0;
    const maxDate = new Date(bounds.maxDate);
    for (const row of filteredRows) {
      events += row.events.length;
      superEvents += row.events.filter((event) => event.smdt >= SUPER_THRESHOLD).length;
      const lastDate = new Date(row.events[row.events.length - 1].date);
      if ((maxDate - lastDate) / 86_400_000 <= RECENT_DAYS) recent += 1;
    }
    return { branches: filteredRows.length, events, recent, super: superEvents };
  }, [bounds.maxDate, filteredRows]);

  const selectedRow = filteredRows.find((row) => row.key === selectedKey) || null;
  const labelWidth = narrow ? 168 : 210;
  const loading = smdt.status === "loading" && !allRows.length;
  const error = smdt.status === "error" && !allRows.length;

  const openDetail = (row, date) => {
    setSelectedKey(row.key);
    setHighlightDate(date);
  };

  const selectRow = (key) => {
    setSelectedKey((current) => (current === key ? null : key));
    setHighlightDate(null);
  };

  if (loading) return <Loading label="Đang tải lộ trình dẫn sóng…" />;
  if (error) return <div style={styles.banner}>Không tải được dữ liệu SMDT ngành: {smdt.error}</div>;

  return (
    <div style={styles.shell}>
      <KpiBar kpi={kpi} />

      <div style={styles.controls}>
        <button type="button" onClick={() => setYear(0)} style={{ ...styles.chip, ...(year === 0 ? styles.activeChip : null) }}>Tất cả</button>
        <div style={styles.selectWrap}>
          <select value={year || latestYear || ""} onChange={(e) => setYear(Number(e.target.value))} style={styles.select}>
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <i className="ti ti-chevron-down" style={styles.selectIcon} />
        </div>
        <div style={styles.searchBox}>
          <i className="ti ti-search" style={{ color: "var(--t4)", fontSize: 14 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm ngành..." style={styles.searchInput} />
          {query && <button type="button" onClick={() => setQuery("")} title="Xóa" style={styles.clearBtn}><i className="ti ti-x" /></button>}
        </div>
        <button type="button" onClick={() => setShowManage(true)} style={styles.manageBtn}>
          <i className="ti ti-adjustments-horizontal" />
          Quản lý ngành
        </button>
      </div>

      <div style={styles.timelinePanel}>
        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
          <MonthRuler d0={bounds.d0} d1={bounds.d1} totalMs={bounds.totalMs} labelWidth={labelWidth} />
          {filteredRows.length ? (
            filteredRows.map((row) => (
              <TimelineRow
                key={row.key}
                row={row}
                active={selectedKey === row.key}
                d0={bounds.d0}
                totalMs={bounds.totalMs}
                labelWidth={labelWidth}
                onOpen={openDetail}
                onSelect={selectRow}
              />
            ))
          ) : (
            <div style={styles.empty}>
              <i className="ti ti-database-off" style={{ fontSize: 24, color: t.t4 }} />
              <div>Không có ngành phù hợp</div>
            </div>
          )}
        </div>
      </div>

      {selectedRow && (
        <DetailPanel
          row={selectedRow}
          highlightDate={highlightDate}
          onClose={() => setSelectedKey(null)}
          tickerData={tickers}
          branchPath={branchPath}
          smdtData={smdt}
        />
      )}

      {showManage && (
        <ManageModal
          rows={allRows}
          visibleSet={visibleSet}
          onClose={() => setShowManage(false)}
          onSave={(next) => {
            setVisibleSet(next);
            saveVisibleSet(next);
            setShowManage(false);
          }}
        />
      )}
    </div>
  );
}

const styles = {
  shell: { display: "flex", flexDirection: "column", gap: 12 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 },
  kpiCard: { background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 10, padding: "11px 14px" },
  kpiValue: { fontSize: 22, lineHeight: 1, fontWeight: 850 },
  kpiLabel: { fontSize: 10, color: "var(--t3)", fontWeight: 750, textTransform: "uppercase", letterSpacing: ".06em" },
  controls: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: { height: 31, padding: "0 14px", borderRadius: 18, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  activeChip: { background: "var(--Bs)", borderColor: "var(--Bb)", color: "var(--B)" },
  selectWrap: { position: "relative", height: 31, minWidth: 86, flexShrink: 0 },
  select: {
    width: "100%",
    height: "100%",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    borderRadius: 8,
    border: "0.5px solid var(--bdr)",
    background: "var(--surf)",
    boxShadow: "none",
    WebkitBoxShadow: "none",
    color: "var(--t2)",
    padding: "0 28px 0 12px",
    outline: "none",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  selectIcon: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--t4)", fontSize: 13, pointerEvents: "none" },
  searchBox: { height: 31, minWidth: 190, maxWidth: 260, flex: "1 1 190px", display: "flex", alignItems: "center", gap: 7, padding: "0 10px", background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 8 },
  searchInput: { width: "100%", minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--t2)", fontSize: 12 },
  clearBtn: { width: 20, height: 20, border: "none", background: "transparent", color: "var(--t4)", cursor: "pointer" },
  manageBtn: { height: 31, marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "0 13px", borderRadius: 18, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  timelinePanel: { background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 12, padding: "8px 12px 10px" },
  monthLabel: { fontSize: 9, color: "var(--t4)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" },
  timelineLabel: { flexShrink: 0, padding: "0 12px 0 0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, textAlign: "right", fontSize: 11 },
  timelineLabelText: { minWidth: 0, lineHeight: 1.22, whiteSpace: "normal", overflowWrap: "break-word" },
  timelineTrack: { minWidth: 480, flex: 1, position: "relative", height: 40 },
  timelineLine: { position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--bdr)", transform: "translateY(-50%)" },
  tooltip: { position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 2, padding: "6px 9px", borderRadius: 7, background: "var(--surf)", border: "0.5px solid var(--bdr)", color: "var(--t2)", fontSize: 10, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,.25)" },
  detailPanel: { background: "var(--surf)", border: "0.5px solid var(--Bb)", borderRadius: 12, padding: 14 },
  detailHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  legendDot: { width: 12, height: 12, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  detailTitle: { fontSize: 14, fontWeight: 850, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  detailSub: { fontSize: 11, color: "var(--t3)" },
  iconBtn: { width: 30, height: 30, marginLeft: "auto", borderRadius: 8, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 },
  detailCard: { position: "relative", minHeight: 155, border: "0.5px solid var(--bdr)", borderRadius: 8, padding: "10px 12px", textAlign: "left", color: "var(--t1)", cursor: "pointer", transition: "all .12s" },
  activeDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: "50%" },
  detailDate: { fontSize: 11, color: "var(--t3)", marginBottom: 2 },
  detailValue: { fontSize: 19, fontWeight: 850, lineHeight: 1.1 },
  trail: { minHeight: 18, marginTop: 4, color: "var(--t4)", fontSize: 10 },
  cardFooter: { marginTop: 7, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  strengthPill: { border: "0.5px solid", borderRadius: 5, padding: "2px 7px", fontSize: 9, fontWeight: 800 },
  expandHint: { color: "var(--t4)", fontSize: 9, fontWeight: 700 },
  tablePanel: { marginTop: 12, background: "var(--bg)", border: "0.5px solid var(--bdr)", borderRadius: 10, padding: "12px 14px" },
  tableTitle: { display: "flex", justifyContent: "space-between", gap: 10, color: "var(--t3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 1060 },
  th: { background: "var(--elev)", borderBottom: "0.5px solid var(--bdr)", padding: "7px 10px", color: "var(--t4)", fontSize: 9, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" },
  td: { borderBottom: "0.5px solid var(--bdrs)", padding: "8px 10px", color: "var(--t2)", fontSize: 11, verticalAlign: "middle" },
  tdMuted: { borderBottom: "0.5px solid var(--bdrs)", padding: "8px 10px", color: "var(--t3)", fontSize: 11 },
  tickerName: { marginTop: 1, color: "var(--t3)", fontSize: 10, maxWidth: 210, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  smdtPill: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 62, border: "0.5px solid", borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 850, whiteSpace: "nowrap" },
  signalPill: { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" },
  tableNotice: { marginTop: 12, padding: "12px 14px", background: "var(--bg)", border: "0.5px solid var(--bdr)", borderRadius: 10, color: "var(--t3)", fontSize: 12 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { width: "min(580px,96vw)", maxHeight: "82vh", background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,.35)" },
  modalHeader: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px", borderBottom: "0.5px solid var(--bdr)" },
  modalTitle: { fontSize: 15, fontWeight: 850, color: "var(--t1)", lineHeight: 1.25 },
  modalSub: { marginTop: 2, color: "var(--t4)", fontSize: 11, fontWeight: 600 },
  modalCount: { marginLeft: "auto", flexShrink: 0, color: "var(--B)", background: "var(--Bs)", border: "0.5px solid var(--Bb)", borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  closeBtn: { width: 34, height: 34, flexShrink: 0, borderRadius: 9, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 17 },
  modalToolbar: { display: "flex", flexDirection: "column", gap: 13, padding: "18px 22px 17px", borderBottom: "0.5px solid var(--bdr)" },
  modalSearch: { height: 34, width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 9, background: "var(--elev)", border: "0.5px solid var(--Bb)" },
  modalActions: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
  actionLink: { border: "none", background: "transparent", color: "var(--t3)", fontSize: 12, fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 4, cursor: "pointer", padding: 0, whiteSpace: "nowrap" },
  textBtn: { border: "none", background: "transparent", color: "var(--t3)", fontSize: 11, fontWeight: 750, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" },
  modalBody: { overflowY: "auto", padding: "10px 18px 14px" },
  modalSectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--t3)", fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".08em", padding: "6px 2px" },
  modalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 6 },
  modalRow: { height: 34, display: "flex", alignItems: "center", gap: 9, border: "0.5px solid var(--bdr)", borderRadius: 8, padding: "0 9px", cursor: "pointer", color: "var(--t2)" },
  checkBox: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--bdr)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 },
  modalFooter: { display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: "0.5px solid var(--bdr)" },
  primaryBtn: { height: 32, padding: "0 18px", border: "none", borderRadius: 18, background: "var(--B)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" },
  secondaryBtn: { height: 32, padding: "0 16px", border: "0.5px solid var(--bdr)", borderRadius: 18, background: "transparent", color: "var(--t3)", fontSize: 12, fontWeight: 750, cursor: "pointer" },
  empty: { minHeight: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, color: "var(--t3)", fontSize: 12, textAlign: "center" },
  banner: { background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 12, padding: 18, color: "var(--t2)", fontSize: 13 },
  mdr: { marginTop: 12, borderRadius: 10, border: "0.5px solid var(--Bb)", background: "var(--elev)", overflow: "hidden", display: "flex", flexDirection: "column" },
  mdrHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderBottom: "0.5px solid var(--bdr)" },
  mdrPill: { fontSize: 14, fontWeight: 850, color: "var(--t1)", background: "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 6, padding: "3px 10px", letterSpacing: ".04em", whiteSpace: "nowrap" },
  mdrName: { fontSize: 12, color: "var(--t2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  mdrStatus: { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },
  mdrClose: { width: 28, height: 28, borderRadius: "50%", border: "0.5px solid var(--bdr)", background: "var(--surf)", color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  mdrTabs: { display: "flex", borderBottom: "0.5px solid var(--bdr)" },
  mdrTab: { flex: 1, textAlign: "center", padding: "10px 4px", fontSize: 12, fontWeight: 700, color: "var(--t3)", cursor: "pointer", background: "transparent", border: "none", borderBottom: "2px solid transparent", marginBottom: -1 },
  mdrTabActive: { color: "var(--B)", borderBottomColor: "var(--B)" },
  mdrBody: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 },
  mdrKpis: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  mdrKpi: { background: "var(--surf)", borderRadius: 12, border: "0.5px solid var(--bdr)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 },
  mdrKpiV: { fontSize: 22, fontWeight: 850, lineHeight: 1.1 },
  mdrKpiL: { fontSize: 9, fontWeight: 750, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 },
  mdrKpiSub: { fontSize: 11, color: "var(--t2)", marginTop: 2 },
  mdrBlock: { background: "var(--surf)", borderRadius: 12, border: "0.5px solid var(--bdr)", padding: 14 },
  mdrBlockLabel: { fontSize: 9, fontWeight: 750, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 },
  mdrWaveSec: { background: "var(--surf)", borderRadius: 12, border: "0.5px solid var(--bdr)", padding: 14, display: "flex", flexDirection: "column", gap: 12 },
  mdrTimeTab: { padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "var(--surf)", color: "var(--t2)", border: "0.5px solid var(--bdr)" },
  mdrTimeTabActive: { background: "var(--Bs)", color: "var(--B)", borderColor: "var(--Bb)" },
  mdrStat: { background: "var(--surf)", borderRadius: 10, border: "0.5px solid var(--bdr)", padding: 10, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  mdrStatL: { fontSize: 8.5, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".04em" },
  mdrPillar: { background: "var(--surf)", borderRadius: 10, border: "0.5px solid var(--bdr)", padding: "11px 12px", display: "flex", flexDirection: "column", gap: 4 },
  mdrPillarL: { fontSize: 8.5, fontWeight: 750, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em" },
};
