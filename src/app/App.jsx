import { useEffect, useState } from "react";
import { ThemeProvider } from "../theme";
import { DesktopDashboard } from "../components/layout/DesktopDashboard";
import { MobileDashboard } from "../components/layout/MobileDashboard";
import { AuthPage } from "../features/auth/AuthPage";
import { logoutUser } from "../features/auth/authApi";
import { AUTH_SESSION_INVALID_EVENT, clearSecureSession } from "../data/secureClient";

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

function clearStoredSession() {
  try {
    localStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* ignore */
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

  useEffect(() => {
    const handler = () => {
      clearStoredSession();
      clearSecureSession();
      setSession(null);
    };
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, handler);
    return () => window.removeEventListener(AUTH_SESSION_INVALID_EVENT, handler);
  }, []);

  const enterApp = (nextSession = {}) => {
    clearStoredSession();
    try {
      const storage = nextSession.remember === false ? sessionStorage : localStorage;
      storage.setItem(AUTH_USER_KEY, JSON.stringify(nextSession));
    } catch {
      /* ignore */
    }
    setSession(nextSession);
  };

  const logout = () => {
    logoutUser();
    clearStoredSession();
    setSession(null);
  };

  const isMobile = width < 768;
  return (
    <ThemeProvider>
      {session ? (
        isMobile ? (
          <MobileDashboard session={session} onLogout={logout} />
        ) : (
          <DesktopDashboard session={session} onLogout={logout} />
        )
      ) : (
        <AuthPage onLogin={enterApp} />
      )}
    </ThemeProvider>
  );
}
