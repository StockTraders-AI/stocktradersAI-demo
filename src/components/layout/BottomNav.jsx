import { BOTTOM_TABS } from "../../app/modules";
import { useTheme } from "../../theme";

/* ─────────────────────────── MOBILE BOTTOM TAB ─────────────────────────── */
export function BottomNav({ curMod, onNav }) {
  const { t } = useTheme();
  return (
    <nav
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--surf)",
        borderTop: "0.5px solid var(--bdr)", display: "flex", zIndex: 50,
        paddingBottom: "env(safe-area-inset-bottom,8px)",
      }}
    >
      {BOTTOM_TABS.map((tab) => {
        const active = curMod === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNav(tab.id)}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "10px 0 8px", background: active ? t.Bs : "none", border: "none", cursor: "pointer",
            }}
          >
            <i className={`ti ${tab.icon}`} style={{ fontSize: 21, color: active ? t.B : "var(--t3)" }} />
            <span style={{ fontSize: 10, color: active ? t.B : "var(--t3)", fontWeight: active ? 600 : 400 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
