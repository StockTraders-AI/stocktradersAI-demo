export const fmtDay = (iso) => {
  if (!iso || typeof iso !== "string") return "—";
  if (iso.includes("/")) return iso.slice(0, 5);
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
};

export const fmtFull = (iso) => {
  if (!iso || typeof iso !== "string") return "—";
  if (iso.includes("/")) return iso;
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

export const fmtNum = (v) => new Intl.NumberFormat("vi-VN").format(v || 0);
export const pct = (part, total) => (total ? (part / total) * 100 : 0);
export const SESSION_OPTIONS = [10, 25, 50];

export const signed = (value, suffix = "") => {
  const n = Number(value) || 0;
  if (n === 0) return `0${suffix}`;
  return `${n > 0 ? "+" : ""}${fmtNum(n)}${suffix}`;
};
