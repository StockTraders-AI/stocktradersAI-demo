import { useEffect, useState } from "react";
import { ThemeProvider } from "../theme";
import { DesktopDashboard } from "../components/layout/DesktopDashboard";
import { MobileDashboard } from "../components/layout/MobileDashboard";
import { AuthPage } from "../features/auth/AuthPage";

const AUTH_SESSION_KEY = "st-auth-demo-session";

/* ─────────────────────────── ROOT ──────────────────────────────────── */
export default function App() {
  const [width, setWidth] = useState(() => window.innerWidth);
  const [authed, setAuthed] = useState(() => {
    try {
      return localStorage.getItem(AUTH_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const enterApp = () => {
    try {
      localStorage.setItem(AUTH_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setAuthed(true);
  };

  const isMobile = width < 768;
  return (
    <ThemeProvider>
      {authed ? (
        isMobile ? <MobileDashboard /> : <DesktopDashboard />
      ) : (
        <AuthPage onLogin={enterApp} onRegister={enterApp} />
      )}
    </ThemeProvider>
  );
}
