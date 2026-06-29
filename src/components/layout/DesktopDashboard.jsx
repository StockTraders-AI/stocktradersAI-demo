import { useCallback, useEffect, useRef, useState } from "react";
import { MODULES, ModuleView } from "../../app/modules";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/* ─────────────────────────── DESKTOP LAYOUT ──────────────────────────── */
export function DesktopDashboard() {
  const [curMod, setCurMod] = useState("dashboard");
  const mainRef = useRef(null);

  const sw = useCallback((id) => {
    if (!MODULES[id]) return;
    setCurMod(id);
    setTimeout(() => mainRef.current?.scrollTo({ top: 0, behavior: "instant" }), 0);
  }, []);

  // Cho phép các Clink "Chi tiết →" trong module điều hướng.
  useEffect(() => {
    const handler = (e) => sw(e.detail);
    window.addEventListener("st-nav", handler);
    return () => window.removeEventListener("st-nav", handler);
  }, [sw]);

  const mod = MODULES[curMod];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "224px 1fr", gridTemplateRows: "52px 1fr", height: "100vh", background: "var(--bg)", color: "var(--t1)" }}>
      <Sidebar curMod={curMod} onNav={sw} />
      <Topbar mod={mod} />
      <main ref={mainRef} style={{ gridColumn: 2, overflowY: "auto", overflowX: "hidden", background: "var(--bg)", scrollbarWidth: "thin" }}>
        <div style={{ padding: "18px 22px 32px" }}>
          <ModuleView id={curMod} />
        </div>
      </main>
    </div>
  );
}
