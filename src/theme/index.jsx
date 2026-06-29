import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { DARK, LIGHT } from "../styles/tokens";

/* ───────────────────────────────────────────────────────────────────────
 * ThemeProvider — quản lý chế độ Sáng/Tối.
 *
 * - Lưu lựa chọn vào localStorage ("st-theme").
 * - Tiêm toàn bộ token màu của theme hiện tại thành CSS variables trên :root
 *   (vd: --bg, --surf, --G…) để dùng được cả qua var(--x) lẫn object `t`.
 * - Component đọc `t` (object token) và `dark`/`setDark`/`toggle` qua useTheme().
 * ─────────────────────────────────────────────────────────────────────── */

const ThemeContext = createContext(null);
const STORAGE_KEY = "st-theme";

function getInitialDark() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark") return true;
    if (saved === "light") return false;
  } catch {
    /* ignore */
  }
  return true; // mặc định Tối
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(getInitialDark);
  const t = dark ? DARK : LIGHT;

  // Tiêm CSS variables theo theme trước khi paint để tránh nhấp nháy.
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t)) {
      root.style.setProperty(`--${k}`, v);
    }
    root.setAttribute("data-theme", dark ? "dark" : "light");
  }, [t, dark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);

  const value = useMemo(
    () => ({ t, dark, setDark, toggle: () => setDark((d) => !d) }),
    [t, dark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme phải được dùng bên trong <ThemeProvider>");
  return ctx;
}
