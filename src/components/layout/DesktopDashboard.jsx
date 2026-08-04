import { useCallback, useEffect, useRef, useState } from "react";
import {
  MODULES,
  ModuleView,
  getInitialModuleId,
  resolveModuleId,
  writeModulePath,
} from "../../app/modules";
import { useTradingDateControl } from "../../app/useTradingDateControl";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/* ─────────────────────────── DESKTOP LAYOUT ──────────────────────────── */
export function DesktopDashboard({ session, onLogout }) {
  const [curMod, setCurMod] = useState(getInitialModuleId);
  const mainRef = useRef(null);
  const tradingDateControl = useTradingDateControl();

  const sw = useCallback((target, options = {}) => {
    const id = resolveModuleId(target);
    if (!id || !MODULES[id]) return;
    setCurMod(id);
    writeModulePath(id, options);
    setTimeout(() => mainRef.current?.scrollTo({ top: 0, behavior: "instant" }), 0);
  }, []);

  // Cho phép các Clink "Chi tiết →" trong module điều hướng.
  useEffect(() => {
    const handler = (e) => sw(e.detail);
    window.addEventListener("st-nav", handler);
    return () => window.removeEventListener("st-nav", handler);
  }, [sw]);

  const mod = MODULES[curMod];

  useEffect(() => {
    writeModulePath(curMod, { replace: true });
  }, [curMod]);

  useEffect(() => {
    const handler = () => sw(window.location.pathname, { replace: true });
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [sw]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "224px 1fr", gridTemplateRows: "52px 1fr", height: "100vh", background: "var(--bg)", color: "var(--t1)" }}>
      <Sidebar curMod={curMod} onNav={sw} />
      <Topbar mod={mod} session={session} onLogout={onLogout} tradingDateControl={tradingDateControl} />
      <main ref={mainRef} style={{ gridColumn: 2, overflowY: "auto", overflowX: "hidden", background: "var(--bg)", scrollbarWidth: "thin" }}>
        <div style={{ padding: "18px 22px 32px" }}>
          <ModuleView id={curMod} tradingDate={tradingDateControl.date} />
        </div>
      </main>
    </div>
  );
}
