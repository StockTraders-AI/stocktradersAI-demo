import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtFull } from "../../app/formatters";
import { useTheme } from "../../theme";

function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return date.slice(0, 10);
}

function parseDateValue(value) {
  const [y, m, d] = String(value || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

function monthKey(date) {
  return date ? date.getFullYear() * 12 + date.getMonth() : 0;
}

function monthLabel(date) {
  if (!date) return "--/----";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function dateValueOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthValueOf(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];

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

export function DateSessionSelect({ value, dates, onChange, buttonStyle }) {
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState("day");
  const [anchorRect, setAnchorRect] = useState(null);
  const [isMobileCalendar, setIsMobileCalendar] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  const availableValues = useMemo(() => {
    return [...new Set((dates || []).map(toDateInputValue).filter(Boolean))].sort();
  }, [dates]);
  const availableSet = useMemo(() => new Set(availableValues), [availableValues]);
  const availableMonthSet = useMemo(() => new Set(availableValues.map((item) => item.slice(0, 7))), [availableValues]);
  const availableYears = useMemo(() => [...new Set(availableValues.map((item) => Number(item.slice(0, 4))))].filter(Boolean), [availableValues]);
  const selectedDate = parseDateValue(value) || parseDateValue(availableValues[availableValues.length - 1]);
  const [viewMonth, setViewMonth] = useState(() => selectedDate || new Date());
  const [viewYear, setViewYear] = useState(() => (selectedDate || new Date()).getFullYear());
  const minMonth = parseDateValue(availableValues[0]);
  const maxMonth = parseDateValue(availableValues[availableValues.length - 1]);
  const currentMonthKey = monthKey(viewMonth);
  const canGoPrev = minMonth ? currentMonthKey > monthKey(minMonth) : false;
  const canGoNext = maxMonth ? currentMonthKey < monthKey(maxMonth) : false;
  const yearIndex = availableYears.indexOf(viewYear);
  const canGoPrevYear = yearIndex > 0;
  const canGoNextYear = yearIndex >= 0 && yearIndex < availableYears.length - 1;

  useEffect(() => {
    if (open && selectedDate) {
      setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
      setViewYear(selectedDate.getFullYear());
      setPickerMode("day");
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      setIsMobileCalendar(window.innerWidth < 768);
      setAnchorRect(buttonRef.current?.getBoundingClientRect() || null);
    };
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    updatePosition();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const firstOffset = (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: daysInMonth(viewMonth) }, (_, index) => index + 1),
  ];
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 360;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 640;
  const desktopLeft = Math.min(Math.max((anchorRect?.left || 0) + (anchorRect?.width || 0) / 2, 134), viewportWidth - 134);
  const desktopTop = Math.max(12, Math.min((anchorRect?.bottom || 0) + 8, viewportHeight - 308));
  const popoverStyle = isMobileCalendar
    ? calendarMobilePopover
    : { ...calendarPopover, top: desktopTop, left: desktopLeft, transform: "translateX(-50%)" };
  const calendarLayer = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={rootRef}
      style={isMobileCalendar ? calendarBackdrop : calendarLayerBase}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      onTouchStart={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div role="dialog" aria-label="Chọn phiên" style={popoverStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            disabled={pickerMode === "day" ? !canGoPrev : pickerMode === "month" ? !canGoPrevYear : true}
            onClick={() => {
              if (pickerMode === "day") setViewMonth((current) => addMonths(current, -1));
              if (pickerMode === "month" && canGoPrevYear) setViewYear(availableYears[yearIndex - 1]);
            }}
            style={{ ...calendarNavBtn, opacity: (pickerMode === "day" ? canGoPrev : pickerMode === "month" ? canGoPrevYear : false) ? 1 : 0.35, cursor: (pickerMode === "day" ? canGoPrev : pickerMode === "month" ? canGoPrevYear : false) ? "pointer" : "default" }}
          >
            <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (pickerMode === "day") {
                setViewYear(viewMonth.getFullYear());
                setPickerMode("month");
              } else if (pickerMode === "month") {
                setPickerMode("year");
              } else {
                setPickerMode("month");
              }
            }}
            style={calendarTitleBtn}
          >
            {pickerMode === "day" ? monthLabel(viewMonth) : pickerMode === "month" ? viewYear : "Chọn năm"}
            <i className={`ti ${pickerMode === "year" ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 12, color: "var(--t4)" }} />
          </button>
          <button
            type="button"
            disabled={pickerMode === "day" ? !canGoNext : pickerMode === "month" ? !canGoNextYear : true}
            onClick={() => {
              if (pickerMode === "day") setViewMonth((current) => addMonths(current, 1));
              if (pickerMode === "month" && canGoNextYear) setViewYear(availableYears[yearIndex + 1]);
            }}
            style={{ ...calendarNavBtn, opacity: (pickerMode === "day" ? canGoNext : pickerMode === "month" ? canGoNextYear : false) ? 1 : 0.35, cursor: (pickerMode === "day" ? canGoNext : pickerMode === "month" ? canGoNextYear : false) ? "pointer" : "default" }}
          >
            <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
          </button>
        </div>
        {pickerMode === "day" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 5 }}>
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
                <div key={day} style={{ textAlign: "center", color: "var(--t4)", fontSize: 9, fontWeight: 900 }}>{day}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {cells.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} style={{ width: 28, height: 28 }} />;
                const dateValue = dateValueOf(viewMonth.getFullYear(), viewMonth.getMonth(), day);
                const enabled = availableSet.has(dateValue);
                const selected = value === dateValue;
                return (
                  <button
                    key={dateValue}
                    type="button"
                    disabled={!enabled}
                    onClick={() => {
                      onChange?.(dateValue);
                      setOpen(false);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      border: `0.5px solid ${selected ? "var(--B)" : enabled ? "var(--bdr)" : "transparent"}`,
                      background: selected ? "var(--B)" : enabled ? "var(--elev)" : "transparent",
                      color: selected ? "#fff" : enabled ? "var(--t2)" : "var(--t4)",
                      opacity: enabled ? 1 : 0.35,
                      cursor: enabled ? "pointer" : "default",
                      fontSize: 11,
                      fontWeight: selected ? 850 : 700,
                      fontFamily: "inherit",
                      padding: 0,
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {pickerMode === "month" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {MONTH_NAMES.map((label, month) => {
              const monthValue = monthValueOf(viewYear, month);
              const enabled = availableMonthSet.has(monthValue);
              const selected = viewMonth.getFullYear() === viewYear && viewMonth.getMonth() === month;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    setViewMonth(new Date(viewYear, month, 1));
                    setPickerMode("day");
                  }}
                  style={{ ...calendarChoiceBtn, background: selected ? "var(--B)" : enabled ? "var(--elev)" : "transparent", borderColor: selected ? "var(--B)" : enabled ? "var(--bdr)" : "transparent", color: selected ? "#fff" : enabled ? "var(--t2)" : "var(--t4)", opacity: enabled ? 1 : 0.35, cursor: enabled ? "pointer" : "default" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {pickerMode === "year" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxHeight: 188, overflowY: "auto", paddingRight: 2 }}>
            {availableYears.map((year) => {
              const selected = year === viewYear;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    setViewYear(year);
                    setPickerMode("month");
                  }}
                  style={{ ...calendarChoiceBtn, background: selected ? "var(--B)" : "var(--elev)", borderColor: selected ? "var(--B)" : "var(--bdr)", color: selected ? "#fff" : "var(--t2)" }}
                >
                  {year}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ cursor: "pointer", border: "none", background: "transparent", color: "inherit", font: "inherit", display: "inline-flex", alignItems: "center", gap: 5, minWidth: 96, justifyContent: "center", padding: 0, ...buttonStyle }}
      >
        <i className="ti ti-calendar" style={{ fontSize: 13, color: "var(--t4)" }} />
        {value ? fmtFull(value) : "—"}
      </button>
      {calendarLayer}
    </div>
  );
}

const calendarPopover = {
  position: "fixed",
  width: 244,
  maxWidth: "calc(100vw - 24px)",
  padding: 10,
  borderRadius: 10,
  background: "var(--surf)",
  border: "0.5px solid var(--bdr)",
  boxShadow: "0 18px 38px rgba(0,0,0,.28)",
  zIndex: 10001,
  pointerEvents: "auto",
};

const calendarLayerBase = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  pointerEvents: "none",
};

const calendarBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "calc(86px + env(safe-area-inset-top, 0px)) 12px calc(24px + env(safe-area-inset-bottom, 0px))",
  boxSizing: "border-box",
  background: "rgba(3, 7, 18, .42)",
  overflowY: "auto",
};

const calendarMobilePopover = {
  width: "min(286px, calc(100vw - 24px))",
  padding: 12,
  borderRadius: 12,
  background: "var(--surf)",
  border: "0.5px solid var(--bdr)",
  boxShadow: "0 24px 52px rgba(0,0,0,.38)",
  pointerEvents: "auto",
};

const calendarNavBtn = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "0.5px solid var(--bdr)",
  background: "var(--elev)",
  color: "var(--t2)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontFamily: "inherit",
};

const calendarTitleBtn = {
  minWidth: 108,
  height: 28,
  border: "none",
  background: "transparent",
  color: "var(--t1)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: 0,
  fontSize: 13,
  fontWeight: 850,
  fontFamily: "inherit",
  cursor: "pointer",
};

const calendarChoiceBtn = {
  height: 34,
  borderRadius: 8,
  border: "0.5px solid var(--bdr)",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: "inherit",
  padding: 0,
  cursor: "pointer",
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
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap", ...style }}>
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
