import { useEffect, useState } from "react";
import { ThemeProvider } from "../theme";
import { DesktopDashboard } from "../components/layout/DesktopDashboard";
import { MobileDashboard } from "../components/layout/MobileDashboard";
import { AuthPage } from "../features/auth/AuthPage";
import { logoutUser } from "../features/auth/authApi";
import { AUTH_SESSION_INVALID_EVENT, clearSecureSession, validateAuthSession } from "../data/secureClient";

const LEGACY_AUTH_SESSION_KEY = "st-auth-demo-session";
const AUTH_USER_KEY = "st-auth-user-session";
const AUTH_REVISION_KEY = "st-auth-session-revision";
const AUTH_CHECK_INTERVAL_MS = 15_000;
const LOGIN_PATH = "/dang-nhap";
const AUTH_PATHS = new Set([LOGIN_PATH, "/dang-ky", "/quen-mat-khau"]);

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

function clearStoredSession({ shared = true } = {}) {
  try {
    if (shared) {
      localStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
    sessionStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
}

function createClientSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function publishAuthRevision(reason, session = null) {
  try {
    localStorage.setItem(
      AUTH_REVISION_KEY,
      JSON.stringify({
        reason,
        at: Date.now(),
        account: session?.account || session?.accessAccount || session?.userName || "",
        clientSessionId: session?.clientSessionId || "",
      }),
    );
  } catch {
    /* ignore */
  }
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";
  const [pathname] = raw.split(/[?#]/);
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function writeLoginPath({ force = false } = {}) {
  if (typeof window === "undefined") return;
  const currentPath = normalizePath(window.location.pathname);
  if (!force && AUTH_PATHS.has(currentPath)) return;
  if (currentPath === LOGIN_PATH) return;
  window.history.replaceState({ authTab: "login" }, "", LOGIN_PATH);
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
      writeLoginPath({ force: true });
      publishAuthRevision("invalid", session);
    };
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, handler);
    return () => window.removeEventListener(AUTH_SESSION_INVALID_EVENT, handler);
  }, [session]);

  useEffect(() => {
    const handler = (event) => {
      if (event.key !== AUTH_REVISION_KEY || !event.newValue) return;

      let revision = null;
      try {
        revision = JSON.parse(event.newValue);
      } catch {
        return;
      }

      if (revision?.clientSessionId && revision.clientSessionId === session?.clientSessionId) return;

      if (revision?.reason === "login") {
        clearStoredSession({ shared: false });
        clearSecureSession();
        setSession(null);
        writeLoginPath({ force: true });
        return;
      }

      if (revision?.reason === "logout" || revision?.reason === "invalid") {
        clearStoredSession();
        clearSecureSession();
        setSession(null);
        writeLoginPath({ force: true });
      }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [session?.clientSessionId]);

  useEffect(() => {
    if (!session) return undefined;

    let stopped = false;
    const check = () => {
      validateAuthSession().catch(() => {
        // validateAuthSession tự phát event khi nhận 401.
      });
    };
    const onFocus = () => check();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    const timer = window.setInterval(() => {
      if (!stopped) check();
    }, AUTH_CHECK_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session]);

  useEffect(() => {
    if (!session) writeLoginPath();
  }, [session]);

  const enterApp = (nextSession = {}) => {
    const sessionToStore = {
      ...nextSession,
      clientSessionId: nextSession.clientSessionId || createClientSessionId(),
    };
    clearStoredSession();
    try {
      const storage = sessionToStore.remember === false ? sessionStorage : localStorage;
      storage.setItem(AUTH_USER_KEY, JSON.stringify(sessionToStore));
    } catch {
      /* ignore */
    }
    setSession(sessionToStore);
    publishAuthRevision("login", sessionToStore);
  };

  const logout = () => {
    logoutUser();
    clearStoredSession();
    setSession(null);
    writeLoginPath({ force: true });
    publishAuthRevision("logout", session);
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
