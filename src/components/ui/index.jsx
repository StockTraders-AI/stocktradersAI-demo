import { useTheme } from "../../theme";
import { hmStyle, sigStyle, tagStyle, mono } from "../../styles/tokens";

/* ─────────────────────────── PRIMITIVES ────────────────────────────────
 * Component nền dùng chung cho mọi module. Phần "khung" dùng CSS var
 * (var(--surf)…) nên tự đổi theo theme; phần tô màu theo dữ liệu lấy `t`
 * từ useTheme() để JS chọn đúng màu.
 * ─────────────────────────────────────────────────────────────────────── */

export function Card({ children, style, noPad }) {
  return (
    <div
      style={{
        background: "var(--surf)",
        border: "0.5px solid var(--bdr)",
        borderRadius: 12,
        padding: noPad ? 0 : "15px 16px",
        overflow: noPad ? "hidden" : undefined,
        transition: "background .2s, border-color .2s",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, meta, right, mb = 13 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: mb }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>
        {icon && <i className={`ti ${icon}`} style={{ fontSize: 15, color: "var(--t3)" }} />}
        {title}
        {meta && <span style={{ fontSize: 10, color: "var(--t4)", fontWeight: 400 }}>{meta}</span>}
      </div>
      {right}
    </div>
  );
}

export function Clink({ children, onClick }) {
  return (
    <span onClick={onClick} style={{ fontSize: 12, color: "var(--B)", cursor: "pointer", fontWeight: 600 }}>
      {children}
    </span>
  );
}

export function FilterChips({ options, active, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 13, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = active === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              background: on ? "var(--Bs)" : "var(--surf)",
              border: `0.5px solid ${on ? "var(--Bb)" : "var(--bdr)"}`,
              borderRadius: 20,
              padding: "6px 13px",
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              color: on ? "var(--B)" : "var(--t2)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              transition: "all .12s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchBox({ placeholder, value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "var(--surf)",
        border: "0.5px solid var(--bdr)",
        borderRadius: 8,
        padding: "6px 11px",
        minWidth: 175,
      }}
    >
      <i className="ti ti-search" style={{ fontSize: 13, color: "var(--t4)" }} />
      <input
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{ background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--t2)", width: "100%", fontFamily: "inherit" }}
      />
    </div>
  );
}

export function TableWrap({ children, minWidth = 600 }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>{children}</table>
    </div>
  );
}

export function THead({ cols }) {
  return (
    <thead>
      <tr>
        {cols.map((c, i) => (
          <th
            key={i}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--t3)",
              textTransform: "uppercase",
              letterSpacing: ".07em",
              padding: "8px 10px",
              borderBottom: "0.5px solid var(--bdr)",
              textAlign: c.right ? "right" : "left",
              whiteSpace: "nowrap",
              background: "var(--elev)",
              paddingLeft: c.pl ?? undefined,
            }}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function Pagination({ page = 1, totalPages = 1, onChange, compact = false }) {
  if (totalPages <= 1) return null;
  const items = buildPageItems(page, totalPages);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: compact ? 4 : 5 }}>
      <PageBtn compact={compact} disabled={page === 1} onClick={() => onChange?.(page - 1)}>‹</PageBtn>
      {items.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ color: "var(--t3)", padding: compact ? "0 2px" : "0 4px", fontSize: compact ? 11 : 12 }}>…</span>
        ) : (
          <PageBtn key={p} compact={compact} active={p === page} onClick={() => onChange?.(p)}>{p}</PageBtn>
        )
      )}
      <PageBtn compact={compact} disabled={page === totalPages} onClick={() => onChange?.(page + 1)}>›</PageBtn>
    </div>
  );
}

function PageBtn({ children, active, disabled, onClick, compact }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: compact ? 24 : 30,
        height: compact ? 24 : 30,
        padding: compact ? "0 6px" : "0 8px",
        borderRadius: compact ? 6 : 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: compact ? 11 : 12,
        fontFamily: "inherit",
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        background: active ? "var(--B)" : "var(--elev)",
        border: `0.5px solid ${active ? "var(--B)" : "var(--bdr)"}`,
        color: active ? "#fff" : "var(--t3)",
        opacity: disabled ? 0.5 : 1,
        transition: "all .12s",
      }}
    >
      {children}
    </button>
  );
}

function buildPageItems(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) items.push("…");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}

export function StatCard({ label, val, sub, colorKey }) {
  const { t } = useTheme();
  const colors = {
    G: [t.Gs, t.Gb, t.G],
    MU: [t.MUs, t.MUb, t.MU],
    B: [t.Bs, t.Bb, t.B],
    A: [t.As, t.Ab, t.A],
    R: [t.Rs, t.Rb, t.R],
    P: [t.Ps, t.Pb, t.P],
  };
  const [bg, border, color] = colors[colorKey] || colors.B;
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 12, padding: "13px 15px" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5, fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.5px", lineHeight: 1.1, color, ...mono }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function DistRow({ label, width, val, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: "var(--t2)", width: 110, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: "var(--bdr)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 84, textAlign: "right", color: "var(--t1)", ...mono }}>{val}</span>
    </div>
  );
}

/* Ô heatmap. */
export function HM({ cls, val }) {
  const { t } = useTheme();
  const s = hmStyle(cls, t);
  return (
    <span
      style={{
        ...mono,
        borderRadius: 6,
        padding: "5px 9px",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-block",
        minWidth: 62,
        background: s.bg,
        border: `0.5px solid ${s.border}`,
        color: s.color,
      }}
    >
      {val}
    </span>
  );
}

/* Pill tín hiệu dòng tiền. */
export function Sig({ type, compact }) {
  const { t } = useTheme();
  const s = sigStyle(type, t);
  if (!s) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        background: s.bg,
        color: s.color,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      {!compact && s.label}
    </span>
  );
}

/* Nhãn xu hướng. */
export function Tag({ cls, children }) {
  const { t } = useTheme();
  const s = tagStyle(cls, t);
  if (!s) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 20,
        border: `0.5px solid ${s.border}`,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: s.bg,
        color: s.color,
      }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────── DONUT ─────────────────────────────────────── */
export function arcPath(cx, cy, r, sw, pct, color, off, key) {
  const c = 2 * Math.PI * r,
    d = (c * pct) / 100,
    g = c - d;
  return (
    <circle
      key={key ?? `${color}-${off}`}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeDasharray={`${d.toFixed(1)} ${g.toFixed(1)}`}
      strokeDashoffset={`${(-c * off / 100).toFixed(1)}`}
      strokeLinecap="butt"
      style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
    />
  );
}

/* ─────────────────────────── AI PANEL ─────────────────────────────────── */
export function AIIcon() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#7C3AED,#4F46E5)",
        boxShadow: "0 4px 16px rgba(124,58,237,.55)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="10" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
        <circle cx="11" cy="11" r="5.5" fill="white" opacity="0.95" />
        {[[11, 5.5, 11, 2], [11, 16.5, 11, 20], [5.5, 11, 2, 11], [16.5, 11, 20, 11]].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="1.4" strokeLinecap="round" />
        ))}
        {[[7.1, 7.1, 4.5, 4.5], [14.9, 7.1, 17.5, 4.5], [7.1, 14.9, 4.5, 17.5], [14.9, 14.9, 17.5, 17.5]].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="1.2" strokeLinecap="round" />
        ))}
        <circle cx="11" cy="11" r="2.5" fill="#7C3AED" />
      </svg>
    </div>
  );
}

export function AIPanel({ title = "Khuyến nghị từ AI", headline, body, rec, when }) {
  const { dark } = useTheme();
  return (
    <div
      style={{
        background: dark ? "#1C1040" : "#F5F0FF",
        border: `1px solid ${dark ? "#5B21B6" : "#7C3AED"}`,
        borderRadius: 12,
        padding: 15,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <AIIcon />
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: dark ? "#C4B5FD" : "#6D28D9", textTransform: "uppercase", letterSpacing: ".07em" }}>{title}</div>
          <div style={{ fontSize: 10, color: dark ? "rgba(196,181,253,.7)" : "#9333EA", marginTop: 2, fontWeight: 500 }}>StockTraders AI{when ? ` · ${when}` : ""}</div>
        </div>
      </div>
      {headline && <div style={{ fontSize: 15, fontWeight: 800, color: dark ? "#fff" : "#3B0764", marginBottom: 8, lineHeight: 1.35 }}>{headline}</div>}
      {body && <div style={{ fontSize: 13, color: dark ? "#E9D5FF" : "#4C1D95", lineHeight: 1.65 }}>{body}</div>}
      {rec && (
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
          <i className="ti ti-info-circle" style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }} />
          {rec}
        </div>
      )}
    </div>
  );
}

/* Banner trạng thái (loading / lỗi). */
export function Banner({ children, tone }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        padding: "13px 15px",
        borderRadius: 11,
        marginBottom: 14,
        fontSize: 13,
        background: tone === "error" ? t.Rs : "var(--elev)",
        color: tone === "error" ? t.R : "var(--t2)",
        border: `0.5px solid ${tone === "error" ? t.Rb : "var(--bdr)"}`,
      }}
    >
      {children}
    </div>
  );
}

/* Chỉ báo realtime + thời điểm cập nhật. */
export function LiveFooter({ live, updatedAt, extra }) {
  const { t } = useTheme();
  if (!updatedAt) return null;
  return (
    <div style={{ marginTop: 14, fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: live ? t.G : t.t3, display: "inline-block" }} />
      <span style={{ color: live ? t.G : "var(--t3)", fontWeight: 600 }}>{live ? "Realtime" : "Định kỳ"}</span>
      <span>· Cập nhật {updatedAt.toLocaleTimeString("vi-VN")}{extra ? ` · ${extra}` : ""}</span>
    </div>
  );
}
