import { useEffect, useState } from "react";
import { ThemeProvider } from "../theme";
import { DesktopDashboard } from "../components/layout/DesktopDashboard";
import { MobileDashboard } from "../components/layout/MobileDashboard";

/* ─────────────────────────── ROOT ──────────────────────────────────── */
export default function App() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isMobile = width < 768;
  return (
    <ThemeProvider>
      {isMobile ? <MobileDashboard /> : <DesktopDashboard />}
    </ThemeProvider>
  );
}
