import { useEffect, useState } from "react";
import { SIDEBAR_GROUPS } from "../../app/modules";
import { useTheme } from "../../theme";

/* ─────────────────────────── SIDEBAR ───────────────────────────────────
 * Điều hướng chính. `curMod` = id module đang xem, `onNav(id)` để chuyển.
 * Hai nhóm "Ngành" / "Cổ phiếu" dạng accordion, tự mở khi item con active.
 * ─────────────────────────────────────────────────────────────────────── */
const NGANH_IDS = SIDEBAR_GROUPS.industry;
const CP_IDS = SIDEBAR_GROUPS.stocks;
const PORTFOLIO_IDS = SIDEBAR_GROUPS.portfolio;

export function Sidebar({ curMod, onNav, compact }) {
  const { t, dark } = useTheme();
  const [nganhOpen, setNganhOpen] = useState(false);
  const [cpOpen, setCpOpen] = useState(false);
  const [portfolioOpen, setPortfolioOpen] = useState(false);

  useEffect(() => {
    if (NGANH_IDS.includes(curMod)) setNganhOpen(true);
    if (CP_IDS.includes(curMod)) setCpOpen(true);
    if (PORTFOLIO_IDS.includes(curMod)) setPortfolioOpen(true);
  }, [curMod]);

  const item = (id, icon, label, { onClick, isParent, isOpen, subIds } = {}) => {
    const active = subIds ? subIds.includes(curMod) : curMod === id;
    return (
      <div
        onClick={onClick || (id ? () => onNav(id) : undefined)}
        style={{
          display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", cursor: "pointer",
          color: active ? t.B : "var(--t2)", background: active ? t.Bs : "transparent",
          borderLeft: `3px solid ${active ? t.B : "transparent"}`,
          fontSize: 14, fontWeight: active ? 600 : 500, transition: "all .12s", userSelect: "none",
        }}
      >
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {isParent && (
          <i className="ti ti-chevron-right" style={{ fontSize: 13, color: "var(--t4)", flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform .2s" }} />
        )}
      </div>
    );
  };

  const sub = (id, icon, label) => {
    const active = curMod === id;
    return (
      <div
        key={id}
        onClick={() => onNav(id)}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px 9px 32px", cursor: "pointer",
          color: active ? t.B : "var(--t3)", background: active ? t.Bs : "transparent",
          borderLeft: `3px solid ${active ? t.B : "transparent"}`,
          fontSize: 13, fontWeight: active ? 600 : 400, transition: "all .12s",
        }}
      >
        {label}
      </div>
    );
  };

  return (
    <aside
      style={{
        gridRow: compact ? undefined : "1/3",
        height: compact ? "100%" : undefined,
        background: "var(--surf)",
        borderRight: "0.5px solid var(--bdr)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        overflowX: "hidden",
        transition: "background .2s",
      }}
    >
      {/* Logo */}
      <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, borderBottom: "0.5px solid var(--bdr)", flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#7C3AED,#4F46E5)" }}>
          <i className="ti ti-chart-candle" style={{ color: "#fff", fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)", letterSpacing: "-.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          StockTraders AI
        </span>
      </div>

      {item("dashboard", "ti-layout-grid", "Dashboard")}
      {item("dong-tien-tt", "ti-chart-line", "Thị trường")}

      {item(null, "ti-briefcase", "Ngành", { onClick: () => setNganhOpen((o) => !o), isParent: true, isOpen: nganhOpen, subIds: NGANH_IDS })}
      <div style={{ maxHeight: nganhOpen ? 200 : 0, overflow: "hidden", transition: "max-height .25s ease" }}>
        {sub("dong-tien-nganh", "ti-trending-up", "Dòng tiền ngành")}
        {sub("smdt-nganh", "ti-table", "SMDT ngành")}
        {sub("lo-trinh-dan-song", "ti-route", "Lộ trình dẫn sóng")}
      </div>

      {item(null, "ti-building-store", "Cổ phiếu", { onClick: () => setCpOpen((o) => !o), isParent: true, isOpen: cpOpen, subIds: CP_IDS })}
      <div style={{ maxHeight: cpOpen ? 200 : 0, overflow: "hidden", transition: "max-height .25s ease" }}>
        {sub("dong-tien-cp", "ti-trending-up", "Dòng tiền cổ phiếu")}
        {sub("smdt-ma", "ti-table-column", "SMDT cổ phiếu")}
        {sub("top-ma-manh", "ti-award", "Top mã mạnh")}
      </div>

      {item(null, "ti-briefcase", "Danh mục", { onClick: () => setPortfolioOpen((o) => !o), isParent: true, isOpen: portfolioOpen, subIds: PORTFOLIO_IDS })}
      <div style={{ maxHeight: portfolioOpen ? 120 : 0, overflow: "hidden", transition: "max-height .25s ease" }}>
        {sub("portfolio-analysis", "ti-sparkles", "Phân tích danh mục")}
      </div>

      {item(null, "ti-chart-bar", "Báo cáo")}
      {item(null, "ti-book", "Kiến thức")}
      {item(null, "ti-settings", "Cài đặt")}

      {/* Premium */}
      <div style={{ marginTop: "auto", padding: 12 }}>
        <div style={{ background: dark ? "linear-gradient(135deg,#2D1B69,#1A0E40)" : t.Bs, border: `0.5px solid ${t.Bb}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: t.B, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>⭐ Premium</div>
          <div style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5, marginBottom: 10 }}>Mở khóa toàn bộ tính năng &amp; dữ liệu lịch sử</div>
          <button style={{ width: "100%", background: t.B, border: "none", borderRadius: 7, padding: 7, fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
            Nâng cấp ngay →
          </button>
        </div>
      </div>
    </aside>
  );
}
