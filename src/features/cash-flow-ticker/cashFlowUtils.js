export const CF_SIG = {
  sn: { label: "Nhen nhóm" },
  si: { label: "Đổ vào" },
  so: { cls: "50", label: "Đang thoát" },
  st: { cls: "neg", label: "Thoát ra" },
};

export const CF_SIG_ORDER = ["sn", "si", "so", "st"];

export function cfSigStyle(sig, t) {
  return {
    sn: { bg: "rgba(61,214,140,.045)", border: "rgba(61,214,140,.18)", color: t.G },
    si: { bg: "rgba(61,214,140,.16)", border: "rgba(61,214,140,.44)", color: t.G },
    so: { bg: t.As, border: t.Ab, color: t.A },
    st: { bg: t.Rs, border: t.Rb, color: t.R },
  }[sig];
}

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
