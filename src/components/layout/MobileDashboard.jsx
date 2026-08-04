import { useCallback, useEffect, useState } from "react";
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

export function MobileDashboard({ session, onLogout }) {
  const [curMod, setCurMod] = useState(getInitialModuleId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tradingDateControl = useTradingDateControl();

  const sw = useCallback((target, options = {}) => {
    const id = resolveModuleId(target);
    if (!id || !MODULES[id]) return;
    setCurMod(id);
    writeModulePath(id, options);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

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
    <div data-mobile-dashboard-scroll="true" style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", position: "relative", background: "var(--bg)", color: "var(--t1)" }}>
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

      <Topbar mod={mod} isMobile onMenuToggle={() => setDrawerOpen((o) => !o)} session={session} onLogout={onLogout} tradingDateControl={tradingDateControl} />

      <div style={{ padding: "14px 13px calc(18px + env(safe-area-inset-bottom,0px))", display: "flex", flexDirection: "column", gap: 13 }}>
        <ModuleView id={curMod} tradingDate={tradingDateControl.date} />
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--t3)" }}>
          Dữ liệu chỉ mang tính tham khảo, không phải lời khuyên đầu tư.
        </div>
      </div>
    </div>
  );
}
