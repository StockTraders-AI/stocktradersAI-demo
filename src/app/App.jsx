import { useEffect, useState } from "react";
import { ThemeProvider } from "../theme";
import { DesktopDashboard } from "../components/layout/DesktopDashboard";
import { MobileDashboard } from "../components/layout/MobileDashboard";
import { AuthPage } from "../features/auth/AuthPage";

const LEGACY_AUTH_SESSION_KEY = "st-auth-demo-session";
const AUTH_USER_KEY = "st-auth-user-session";

function readStoredSession() {
  try {
    const persisted = localStorage.getItem(AUTH_USER_KEY);
    if (persisted) return JSON.parse(persisted);
    const current = sessionStorage.getItem(AUTH_USER_KEY);
    if (current) return JSON.parse(current);
    return null;
  } catch {
    return null;
  }
}

/* ─────────────────────────── ROOT ──────────────────────────────────── */
export default function App() {
  const [width, setWidth] = useState(() => window.innerWidth);
  const [session, setSession] = useState(readStoredSession);

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const enterApp = (nextSession = {}) => {
    try {
      localStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      sessionStorage.removeItem(AUTH_USER_KEY);
      const storage = nextSession.remember === false ? sessionStorage : localStorage;
      storage.setItem(AUTH_USER_KEY, JSON.stringify(nextSession));
    } catch {
      /* ignore */
    }
    setSession(nextSession);
  };

  const isMobile = width < 768;
  return (
    <ThemeProvider>
      {session ? (
        isMobile ? <MobileDashboard /> : <DesktopDashboard />
      ) : (
        <AuthPage onLogin={enterApp} />
      )}
    </ThemeProvider>
  );
}
