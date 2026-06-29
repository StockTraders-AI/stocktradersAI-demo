import { useEffect, useState } from "react";
import { useMarketIndices } from "../../data/useMarketIndices";
import { mono } from "../../styles/tokens";
import { useTheme } from "../../theme";

/* ─────────────────────────── TOPBAR ────────────────────────────────────
 * Tiêu đề module + chỉ số thị trường + đồng hồ realtime + nút đổi theme.
 * ─────────────────────────────────────────────────────────────────────── */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Topbar({ mod, isMobile, onMenuToggle }) {
  const { t, dark, toggle } = useTheme();
  const { indices } = useMarketIndices();
  const now = useClock();
  const stamp = `${now.toLocaleDateString("vi-VN")} · ${now.toLocaleTimeString("vi-VN")}`;

  return (
    <header
      style={{
        gridColumn: isMobile ? undefined : 2,
        height: 52,
        flexShrink: 0,
        background: "var(--surf)",
        borderBottom: "0.5px solid var(--bdr)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "0 13px" : "0 20px",
        gap: 14,
        transition: "background .2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
        {isMobile && (
          <button onClick={onMenuToggle} aria-label="Mở menu" style={iconBtn}>
            <i className="ti ti-menu-2" style={{ fontSize: 18 }} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)", letterSpacing: "-.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mod?.title}</div>
          {!isMobile && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{mod?.sub}</div>}
        </div>
        {!isMobile && (
          <div style={{ display: "flex", gap: 7 }}>
            {indices.map((idx) => (
              <div key={idx.name} title={idx.live ? "Dữ liệu từ getTotalTradeReal" : "Chưa có dữ liệu index trong getTotalTradeReal"} style={{ display: "flex", alignItems: "baseline", gap: 4, background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 7, padding: "5px 10px" }}>
                <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{idx.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", ...mono }}>{idx.val}</span>
                <span style={{ fontSize: 10, color: idx.rawPct == null ? "var(--t3)" : idx.rawPct >= 0 ? t.G : t.R, fontWeight: 600 }}>{idx.pct}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.G, display: "inline-block", animation: "pulse 2s infinite" }} />
            {stamp}
          </div>
        )}
        {!isMobile && [["ti-calendar", false], ["ti-bell", true], ["ti-help", false]].map(([ic, badge], i) => (
          <div key={i} style={{ ...iconBtn, position: "relative" }}>
            <i className={`ti ${ic}`} style={{ fontSize: 15 }} />
            {badge && <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, background: t.R, borderRadius: "50%", border: "1.5px solid var(--surf)" }} />}
          </div>
        ))}
        <div onClick={toggle} title="Đổi Sáng/Tối" style={iconBtn}>
          <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} style={{ fontSize: 15 }} />
        </div>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.Bs, border: `0.5px solid ${t.Bb}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: t.B, flexShrink: 0 }}>NA</div>
        {!isMobile && <div style={{ fontSize: 9, background: t.P, color: "#fff", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>PREMIUM</div>}
      </div>
    </header>
  );
}

const iconBtn = {
  width: 32, height: 32, borderRadius: 8, background: "var(--elev)", border: "0.5px solid var(--bdr)",
  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", cursor: "pointer", flexShrink: 0,
};
