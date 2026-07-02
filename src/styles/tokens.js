/* ─────────────────────────── DESIGN TOKENS ─────────────────────────────
 * Hai bộ token Tối (DARK) / Sáng (LIGHT). Component lấy `t` từ useTheme().
 * Khoá ngắn gọn theo ngôn ngữ thiết kế StockTraders:
 *   bg/surf/elev   nền · bdr/bdrs viền · t1..t4 chữ
 *   G  = xanh (mua/tăng)   MU = xanh đậm (mua)   A = cam (cảnh báo)
 *   R  = đỏ (bán/giảm)     B  = tím (nhấn/brand) P = tím nhạt (phụ)
 * Hậu tố: s = nền nhạt (soft), b = viền (border).
 * ─────────────────────────────────────────────────────────────────────── */
export const DARK = {
  bg: "#0A0D14", surf: "#111520", elev: "#171D2E", bdr: "#242E42", bdrs: "#1C2538",
  t1: "#F0F4FF", t2: "#A8B8D0", t3: "#5C7090", t4: "#3A4A60",
  G: "#3DD68C",  Gs: "rgba(61,214,140,.13)",  Gb: "rgba(61,214,140,.32)",
  MU: "#1A8A4A", MUs: "rgba(26,138,74,.15)",   MUb: "rgba(26,138,74,.35)",
  B: "#7C3AED",  Bs: "rgba(124,58,237,.13)",   Bb: "rgba(124,58,237,.30)",
  A: "#FF9F0A",  As: "rgba(255,159,10,.12)",   Ab: "rgba(255,159,10,.30)",
  R: "#FF2D55",  Rs: "rgba(255,45,85,.10)",    Rb: "rgba(255,45,85,.26)",
  P: "#C084FC",  Ps: "rgba(192,132,252,.10)",  Pb: "rgba(192,132,252,.28)",
};

export const LIGHT = {
  bg: "#F0EFF5", surf: "#ffffff", elev: "#F7F6FC", bdr: "#E0DEEA", bdrs: "#ECEAF4",
  t1: "#0A0A0A", t2: "#3A4250", t3: "#6B737F", t4: "#9FA5AE",
  G: "#16A34A",  Gs: "#F0FDF4", Gb: "#A7F3C4",
  MU: "#15803D", MUs: "#DCFCE7", MUb: "#86EFAC",
  B: "#6D28D9",  Bs: "#F5F3FF", Bb: "#DDD6FE",
  A: "#D97706",  As: "#FFFBEB", Ab: "#FCD34D",
  R: "#E11D48",  Rs: "#FFF1F2", Rb: "#FECDD3",
  P: "#A855F7",  Ps: "#FAF5FF", Pb: "#E9D5FF",
};

/* Chữ monospace dùng cho số liệu. */
export const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 };

/* ─────────────────────────── STYLE HELPERS ─────────────────────────────── */

/* Ô heatmap theo "lớp" giá trị: 100 / 70 / 50 / 20 / neg. */
export function hmStyle(cls, t) {
  const m = {
    "100": { bg: t.Gs, border: t.Gb, color: t.G },
    "70":  { bg: "rgba(61,214,140,.07)", border: "rgba(61,214,140,.18)", color: t.G },
    "50":  { bg: t.As, border: t.Ab, color: t.A },
    "20":  { bg: t.Rs, border: t.Rb, color: t.R },
    "neg": { bg: "rgba(255,45,85,.18)", border: t.Rb, color: t.R },
  };
  return m[cls] || m["50"];
}

/* Quy đổi giá trị SMDT (số) → lớp heatmap. */
export function valToHmCls(v) {
  if (v == null || Number.isNaN(v)) return null;
  if (v < 0) return "neg";
  if (v >= 100) return "100";
  if (v >= 70) return "70";
  if (v >= 20) return "50";
  return "20";
}

/* Tín hiệu dòng tiền: si / sn / so / st. */
export function sigStyle(type, t) {
  return {
    si: { bg: "rgba(61,214,140,.16)", color: t.G, label: "Tiếp tục đổ vào" },
    sn: { bg: "rgba(61,214,140,.045)", color: t.G, label: "Nhen nhóm đổ vào" },
    so: { bg: t.As, color: t.A, label: "Đang thoát ra" },
    st: { bg: t.Rs, color: t.R, label: "Tiếp tục thoát ra" },
  }[type];
}

/* Nhãn xu hướng: tg / tb / ta / tr. */
export function tagStyle(cls, t) {
  return {
    tg: { bg: t.Gs, border: t.Gb, color: t.G },
    tb: { bg: t.Bs, border: t.Bb, color: t.B },
    ta: { bg: t.As, border: t.Ab, color: t.A },
    tr: { bg: t.Rs, border: t.Rb, color: t.R },
  }[cls];
}

/* ─────────────────────────── GLOBAL CSS (không phụ thuộc theme) ──────────
 * Reset + font + scrollbar + keyframes. Các biến màu theo theme được
 * ThemeProvider tiêm riêng vào :root mỗi khi đổi Sáng/Tối.
 * ─────────────────────────────────────────────────────────────────────── */
export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');
  @import url('https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.19.0/tabler-icons.min.css');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body, #root { min-height: 100%; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  body { overflow: hidden; background: var(--bg); color: var(--t1); transition: background .2s, color .2s; }
  button, input, select { font-family: inherit; }
  button { -webkit-appearance: none; appearance: none; }
  ::selection { background: rgba(124,58,237,.35); }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--bdr); border-radius: 3px; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.8)} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
`;
