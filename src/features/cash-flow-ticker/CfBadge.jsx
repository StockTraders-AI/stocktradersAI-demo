import { useTheme } from "../../theme";
import { CF_SIG, cfSigStyle } from "./cashFlowUtils";

export function CfBadge({ sig, small, compact }) {
  const { t } = useTheme();
  const meta = CF_SIG[sig];
  if (!meta) return <span style={{ color: "var(--t4)" }}>—</span>;
  const s = cfSigStyle(sig, t);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        whiteSpace: "nowrap",
        fontWeight: 700,
        background: s.bg,
        border: `0.5px solid ${s.border}`,
        color: s.color,
        fontSize: small || compact ? 10 : 11,
        padding: compact ? "4px 8px" : small ? "2px 8px" : "5px 9px",
        minWidth: compact ? 74 : small ? 0 : 92,
      }}
    >
      {meta.label}
    </span>
  );
}
