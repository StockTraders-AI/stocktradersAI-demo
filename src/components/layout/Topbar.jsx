import { useEffect, useRef, useState } from "react";
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

function readSessionName(session) {
  return (
    session?.reply?.name ||
    session?.reply?.fullName ||
    session?.reply?.user_name ||
    session?.userName ||
    session?.account ||
    "Người dùng"
  );
}

function readInitials(session) {
  const source = readSessionName(session);
  const parts = String(source)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "NA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Topbar({ mod, isMobile, onMenuToggle, session, onLogout }) {
  const { t, dark, toggle } = useTheme();
  const { indices } = useMarketIndices();
  const now = useClock();
  const accountMenuRef = useRef(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const stamp = `${now.toLocaleDateString("vi-VN")} · ${now.toLocaleTimeString("vi-VN")}`;
  const displayName = readSessionName(session);
  const initials = readInitials(session);

  useEffect(() => {
    if (!accountOpen) return undefined;

    const closeOnPointerDown = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  const handleLogout = () => {
    setAccountOpen(false);
    onLogout?.();
  };

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
        <div ref={accountMenuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-label="Mở tài khoản"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: t.Bs,
              border: `0.5px solid ${t.Bb}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: t.B,
              cursor: "pointer",
            }}
          >
            {initials}
          </button>
          {accountOpen && (
            <div role="menu" style={accountMenu}>
              <div style={accountHeader}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>
                  PREMIUM
                </div>
              </div>
              <button type="button" role="menuitem" onClick={handleLogout} style={logoutBtn}>
                <i className="ti ti-logout" style={{ fontSize: 15 }} />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
        {!isMobile && <div style={{ fontSize: 9, background: t.P, color: "#fff", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>PREMIUM</div>}
      </div>
    </header>
  );
}

const iconBtn = {
  width: 32, height: 32, borderRadius: 8, background: "var(--elev)", border: "0.5px solid var(--bdr)",
  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", cursor: "pointer", flexShrink: 0,
};

const accountMenu = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 184,
  background: "var(--surf)",
  border: "0.5px solid var(--bdr)",
  borderRadius: 8,
  boxShadow: "0 18px 48px rgba(0,0,0,.16)",
  padding: 6,
  zIndex: 80,
};

const accountHeader = {
  padding: "8px 9px 9px",
  borderBottom: "0.5px solid var(--bdr)",
  marginBottom: 5,
  minWidth: 0,
};

const logoutBtn = {
  width: "100%",
  height: 34,
  border: "none",
  borderRadius: 7,
  background: "transparent",
  color: "var(--R)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 9px",
  fontSize: 12,
  fontWeight: 750,
  cursor: "pointer",
  textAlign: "left",
};
