import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme";

function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return date.slice(0, 10);
}

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

// Native <input type="date"> — the OS renders the calendar, so it stays smooth on
// older devices (macOS 13.4, iOS 18.1) that struggled with the JS popover version.
// Trade-off: native cannot disable individual days, only bound by min/max, so a pick
// on a session without data is snapped to the closest date that does have data.
export function DateSessionSelect({ value, dates, onChange, buttonStyle }) {
  const availableValues = useMemo(() => {
    return [...new Set((dates || []).map(toDateInputValue).filter(Boolean))].sort();
  }, [dates]);
  const availableSet = useMemo(() => new Set(availableValues), [availableValues]);
  const minDate = availableValues[0] || undefined;
  const maxDate = availableValues[availableValues.length - 1] || undefined;

  // Local draft so the user can freely click into dd/mm/yyyy and type digits without
  // the snap-to-nearest logic fighting them mid-edit (e.g. while typing the year).
  const [draft, setDraft] = useState(value || "");
  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const nearestAvailable = (val) => {
    const target = new Date(val).getTime();
    let nearest = null;
    let nearestDiff = Infinity;
    for (const item of availableValues) {
      const diff = Math.abs(new Date(item).getTime() - target);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearest = item;
      }
    }
    return nearest;
  };

  const handleChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    // Navigate live only when the typed date actually has a session; otherwise wait
    // until blur so partial input (e.g. an unfinished year) isn't snapped away.
    if (next && availableSet.has(next)) onChange?.(next);
  };

  const handleBlur = () => {
    if (!draft || availableSet.has(draft)) {
      if (!draft) setDraft(value || "");
      return;
    }
    const nearest = nearestAvailable(draft);
    if (nearest) {
      setDraft(nearest);
      onChange?.(nearest);
    } else {
      setDraft(value || "");
    }
  };

  return (
    <input
      type="date"
      value={draft}
      min={minDate}
      max={maxDate}
      onChange={handleChange}
      onBlur={handleBlur}
      aria-label="Chọn phiên"
      style={{ ...nativeDateInput, ...buttonStyle }}
    />
  );
}

const nativeDateInput = {
  minHeight: 30,
  minWidth: 96,
  boxSizing: "border-box",
  padding: "0 8px",
  borderRadius: 9,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--t1)",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  colorScheme: "light dark",
};

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

export function InlineFilterChips({ options, active, onChange, style, buttonStyle }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap", ...style }}>
      {options.map((option) => {
        const on = active === option.id;
        const tone = typeof option.tone === "function" ? option.tone(t) : option.tone;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            style={{
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: tone ? tone.bg : on ? "var(--Bs)" : "var(--surf)",
              border: `0.5px solid ${tone ? tone.border : on ? "var(--Bb)" : "var(--bdr)"}`,
              borderRadius: 20,
              padding: "0 13px",
              fontSize: 12,
              fontWeight: on ? 800 : tone ? 700 : 500,
              color: tone ? tone.color : on ? "var(--B)" : "var(--t2)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: on && tone ? `inset 0 0 0 0.5px ${tone.border}` : "none",
              ...buttonStyle,
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
