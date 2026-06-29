import { useCallback, useEffect, useState } from "react";
import { MODULES, ModuleView } from "../../app/modules";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/* ─────────────────────────── MOBILE LAYOUT ─────────────────────────────
 * Topbar + nội dung cuộn + thanh tab dưới. Menu đầy đủ trong drawer trượt.
 * ─────────────────────────────────────────────────────────────────────── */
export function MobileDashboard() {
  const [curMod, setCurMod] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sw = useCallback((id) => {
    if (!MODULES[id]) return;
    setCurMod(id);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    const handler = (e) => sw(e.detail);
    window.addEventListener("st-nav", handler);
    return () => window.removeEventListener("st-nav", handler);
  }, [sw]);

  const mod = MODULES[curMod];

  return (
    <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", position: "relative", background: "var(--bg)", color: "var(--t1)" }}>
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.66)", zIndex: 40, animation: "fadeIn .2s" }} />
      )}
      <div
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 252, zIndex: 50,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .25s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <Sidebar curMod={curMod} onNav={sw} compact />
      </div>

      <Topbar mod={mod} isMobile onMenuToggle={() => setDrawerOpen((o) => !o)} />

      <div style={{ padding: "14px 13px", display: "flex", flexDirection: "column", gap: 13, paddingBottom: "calc(80px + env(safe-area-inset-bottom,0px))" }}>
        <ModuleView id={curMod} />
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--t3)" }}>
          Dữ liệu chỉ mang tính tham khảo, không phải lời khuyên đầu tư.
        </div>
      </div>

      <BottomNav curMod={curMod} onNav={sw} />
    </div>
  );
}
