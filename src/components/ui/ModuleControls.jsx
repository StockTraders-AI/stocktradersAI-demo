import { useTheme } from "../../theme";

export function HeatLegend() {
  const { t } = useTheme();
  const items = [["100", "≥100"], ["70", "70–99"], ["50", "20–69"], ["20", "<20"]];
  const map = {
    "100": [t.Gs, t.Gb], "70": ["rgba(61,214,140,.07)", "rgba(61,214,140,.18)"], "50": [t.As, t.Ab], "20": [t.Rs, t.Rb],
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {items.map(([cls, lbl]) => (
        <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: map[cls][0], border: `1px solid ${map[cls][1]}` }} />{lbl}
        </div>
      ))}
    </div>
  );
}

export function SMDTToolbarPill({ children, as: Tag = "div", style }) {
  return (
    <Tag
      style={{
        minHeight: 30,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "0 14px",
        borderRadius: 15,
        background: "var(--surf)",
        border: "1px solid var(--bdr)",
        color: "var(--t2)",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function SMDTFilterChips({ options, active, onChange }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
      {options.map((option) => {
        const on = active === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            style={{
              minHeight: 30,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 14px",
              borderRadius: 15,
              background: on ? "var(--Bs)" : "var(--surf)",
              border: `1px solid ${on ? "var(--Bb)" : "var(--bdr)"}`,
              color: on ? "var(--B)" : "var(--t2)",
              fontSize: 11,
              fontWeight: on ? 700 : 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SMDTSearchPill({ value, onChange, placeholder, style }) {
  return (
    <div
      style={{
        minHeight: 30,
        width: "min(350px, 100%)",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 14px",
        borderRadius: 9,
        background: "var(--surf)",
        border: "1px solid var(--bdr)",
        ...style,
      }}
    >
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--t1)",
          fontSize: 11,
          fontWeight: 500,
        }}
      />
    </div>
  );
}

export function InlineFilterChips({ options, active, onChange }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      {options.map((option) => {
        const on = active === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            style={{
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: on ? "var(--Bs)" : "var(--surf)",
              border: `0.5px solid ${on ? "var(--Bb)" : "var(--bdr)"}`,
              borderRadius: 20,
              padding: "0 13px",
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              color: on ? "var(--B)" : "var(--t2)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MockNote({ children }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t4)", marginBottom: 10 }}>
      <i className="ti ti-flask" style={{ fontSize: 13 }} />{children}
    </div>
  );
}

export const linkBtn = { border: "none", background: "none", color: "var(--B)", font: "inherit", fontWeight: 600, cursor: "pointer", textDecoration: "underline" };
