export const CF_SIG = {
  sn: { cls: "70", label: "Nhen nhóm" },
  si: { cls: "100", label: "Đổ vào" },
  so: { cls: "50", label: "Đang thoát" },
  st: { cls: "neg", label: "Thoát ra" },
};

export const CF_SIG_ORDER = ["sn", "si", "so", "st"];

export function dominantSig(sigs) {
  const counts = {};
  for (const sig of sigs) if (sig) counts[sig] = (counts[sig] || 0) + 1;

  let best = null;
  let bestCount = 0;
  for (const sig of CF_SIG_ORDER) {
    if ((counts[sig] || 0) > bestCount) {
      best = sig;
      bestCount = counts[sig];
    }
  }
  return best;
}

export const cashFlowMatrixTh = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--t3)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  padding: "12px 10px",
  borderBottom: "0.5px solid var(--bdr)",
  borderRight: "0.5px solid var(--bdrs)",
  background: "var(--elev)",
  textAlign: "center",
  whiteSpace: "nowrap",
};

export const cashFlowMatrixDateTd = {
  padding: "15px 18px",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--t1)",
  borderBottom: "0.5px solid var(--bdrs)",
  borderRight: "0.5px solid var(--bdrs)",
  background: "var(--surf)",
  whiteSpace: "nowrap",
};

export const cashFlowMatrixTd = {
  padding: "9px 7px",
  textAlign: "center",
  borderBottom: "0.5px solid var(--bdrs)",
  borderRight: "0.5px solid var(--bdrs)",
  background: "var(--surf)",
};

export const cashFlowGroupTh = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--t1)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  padding: "11px 12px",
  borderBottom: "0.5px solid var(--bdr)",
  borderRight: "0.5px solid var(--bdrs)",
  borderLeft: "0.5px solid var(--bdrs)",
  background: "var(--elev)",
  textAlign: "center",
  whiteSpace: "nowrap",
};
