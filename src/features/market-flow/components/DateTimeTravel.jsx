import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const fmt = (d) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function parseInputDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!match) return null;

  let day = Number(match[1]);
  let month = Number(match[2]);
  let year = Number(match[3]);
  if (match[1].length === 4) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function getInputSegment(input) {
  const start = input?.selectionStart ?? 0;
  const end = input?.selectionEnd ?? start;
  const mid = Math.floor((start + end) / 2);
  if (mid <= 2) return { key:"day", start:0, end:2 };
  if (mid <= 5) return { key:"month", start:3, end:5 };
  return { key:"year", start:6, end:10 };
}

function selectInputSegment(input, segment) {
  requestAnimationFrame(() => input?.setSelectionRange(segment.start, segment.end));
}

function stepDatePart(date, part, delta) {
  const next = new Date(date);
  if (part === "day") next.setDate(next.getDate() + delta);
  if (part === "month") next.setMonth(next.getMonth() + delta);
  if (part === "year") next.setFullYear(next.getFullYear() + delta);
  return next;
}

function buildMonthGrid(cursor) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstOfMonth = new Date(y, m, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ other: true, date: new Date(y, m - 1, daysInPrevMonth - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ other: false, date: new Date(y, m, d) });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const nd = new Date(last);
    nd.setDate(nd.getDate() + 1);
    cells.push({ other: true, date: nd });
  }
  return cells;
}

export default function DateTimeTravel({
  value,
  onChange,
  maxDate = new Date(),
  minDate = new Date(2020, 0, 1),
}) {
  const [internalDate, setInternalDate] = useState(value ?? new Date());
  const current = value ?? internalDate;
  const [open, setOpen] = useState(false);
  const [calCursor, setCalCursor] = useState(new Date(current));
  const [draftDate, setDraftDate] = useState(new Date(current));
  const [inputValue, setInputValue] = useState(fmt(current));
  const [inputError, setInputError] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const currentRef = useRef(current);
  const popRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        const next = new Date(currentRef.current);
        setDraftDate(next);
        setCalCursor(next);
        setInputValue(fmt(next));
        setInputError(false);
        setEditing(false);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (editing || open) return;
    setDraftDate(new Date(current));
    setCalCursor(new Date(current));
    setInputValue(fmt(current));
  }, [current, editing, open]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const clampDate = (d) => {
    let next = new Date(d);
    if (next > maxDate) next = new Date(maxDate);
    if (next < minDate) next = new Date(minDate);
    return next;
  };

  const setDraft = (d) => {
    const next = clampDate(d);
    setDraftDate(next);
    setCalCursor(new Date(next));
    setInputValue(fmt(next));
    setInputError(false);
    return next;
  };

  const commitDate = (d = draftDate) => {
    const next = clampDate(d);
    setInternalDate(next);
    setDraftDate(next);
    setCalCursor(new Date(next));
    setInputValue(fmt(next));
    setInputError(false);
    setEditing(false);
    setOpen(false);
    onChange?.(next);
  };

  const stepDay = (delta) => {
    const baseDate = open || editing ? draftDate : current;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + delta);
    if (open || editing) setDraft(d);
    else commitDate(d);
  };

  const openCalendar = () => {
    const next = new Date(current);
    setDraftDate(next);
    setCalCursor(next);
    setInputValue(fmt(next));
    setInputError(false);
    setOpen((o) => !o);
  };

  const submitInput = () => {
    const parsed = parseInputDate(inputValue);
    if (!parsed) {
      setInputError(true);
      return;
    }
    commitDate(parsed);
  };

  const cancelInput = () => {
    const next = new Date(current);
    setDraftDate(next);
    setCalCursor(next);
    setInputValue(fmt(next));
    setInputError(false);
    setEditing(false);
    setOpen(false);
  };

  const stepInputSegment = (delta) => {
    const input = inputRef.current;
    const segment = getInputSegment(input);
    const baseDate = parseInputDate(inputValue) || draftDate || current;
    setDraft(stepDatePart(baseDate, segment.key, delta));
    setOpen(true);
    selectInputSegment(input, segment);
  };

  const activeDate = open || editing ? draftDate : current;
  const isToday = sameDay(activeDate, maxDate);
  const cells = buildMonthGrid(calCursor);
  const prevDisabled = activeDate <= minDate;
  const nextDisabled = activeDate >= maxDate;

  const iconButtonStyle = (disabled) => ({
    width: 26,
    height: 26,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: 8,
    background: "transparent",
    color: disabled ? "var(--t4, #3A4A60)" : "var(--t3, #8EA2C0)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    padding: 0,
    flexShrink: 0,
  });

  return (
    <div style={st.root}>
      <button
        type="button"
        onClick={() => stepDay(-1)}
        disabled={prevDisabled}
        style={iconButtonStyle(prevDisabled)}
        aria-label="Ngày trước"
      >
        <ChevronLeft size={15} />
      </button>

      <div ref={triggerRef} style={{ ...st.dateButton, color: isToday ? "var(--G, #3DD68C)" : "var(--t1, #D9E4F5)" }}>
        <button type="button" onClick={openCalendar} style={st.calendarButton} aria-label="Mở lịch">
          <Calendar size={13} style={{ opacity: 0.72, flexShrink: 0 }} />
        </button>
        {editing ? (
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setInputError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                stepInputSegment(event.key === "ArrowUp" ? 1 : -1);
              }
              if (event.key === "Enter") submitInput();
              if (event.key === "Escape") cancelInput();
            }}
            onBlur={() => {
              if (open) return;
              if (inputError) return;
              const parsed = parseInputDate(inputValue);
              if (parsed) commitDate(parsed);
              else cancelInput();
            }}
            style={{ ...st.inlineInput, borderColor: inputError ? "var(--R, #EF4444)" : "transparent" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              const next = new Date(current);
              setDraftDate(next);
              setCalCursor(next);
              setInputValue(fmt(next));
              setInputError(false);
              setEditing(true);
              setOpen(true);
            }}
            style={st.inlineDateButton}
          >
            {fmt(current)}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => stepDay(1)}
        disabled={nextDisabled}
        style={iconButtonStyle(nextDisabled)}
        aria-label="Ngày sau"
      >
        <ChevronRight size={15} />
      </button>

      {open && (
        <div ref={popRef} style={st.popover}>
          <div style={st.monthHeader}>
            <button
              type="button"
              onClick={() => setCalCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              style={st.monthButton}
            >
              <ChevronLeft size={12} />
            </button>
            <span style={st.monthTitle}>{MONTHS[calCursor.getMonth()]}, {calCursor.getFullYear()}</span>
            <button
              type="button"
              onClick={() => setCalCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              style={st.monthButton}
            >
              <ChevronRight size={12} />
            </button>
          </div>

          <div style={st.grid}>
            {DOW.map((d) => (
              <div key={d} style={st.dow}>{d}</div>
            ))}
            {cells.map(({ other, date }, i) => {
              const disabled = date > maxDate || date < minDate;
              const selected = sameDay(date, activeDate);
              const today = sameDay(date, maxDate);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setDraft(date);
                    setEditing(true);
                  }}
                  style={{
                    ...st.day,
                    color: disabled ? "var(--t4, #334155)" : other ? "var(--t3, #53657F)" : "var(--t2, #B6C5DB)",
                    opacity: disabled ? 0.42 : other ? 0.55 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    background: selected ? "var(--G, #3DD68C)" : "transparent",
                    border: today && !selected ? "1px solid var(--G, #3DD68C)" : "1px solid transparent",
                    fontWeight: selected ? 800 : 600,
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div style={st.footer}>
            <button
              type="button"
              onClick={() => {
                setDraft(new Date(maxDate));
                setEditing(true);
              }}
              style={{ ...st.footerButton, color: "var(--G, #3DD68C)" }}
            >
              Hôm nay
            </button>
            <button type="button" onClick={() => commitDate(parseInputDate(inputValue) || draftDate)} style={st.footerButton}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  root: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    height: 32,
    borderRadius: 12,
    border: "0.5px solid var(--bdr, #242E42)",
    background: "var(--elev, rgba(17,21,32,.78))",
    padding: 3,
    fontFamily: '-apple-system,"Inter","Segoe UI",sans-serif',
    verticalAlign: "middle",
  },
  dateButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 26,
    border: 0,
    borderRadius: 8,
    background: "transparent",
    padding: "0 4px",
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    letterSpacing: 0,
    whiteSpace: "nowrap",
  },
  calendarButton: {
    width: 18,
    height: 22,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: 6,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    padding: 0,
  },
  inlineDateButton: {
    border: 0,
    borderRadius: 6,
    background: "transparent",
    color: "inherit",
    cursor: "text",
    padding: "0 3px",
    font: "inherit",
    fontWeight: 700,
    lineHeight: 1,
  },
  inlineInput: {
    width: 78,
    height: 22,
    border: "0.5px solid transparent",
    borderRadius: 6,
    background: "rgba(255,255,255,.06)",
    color: "inherit",
    padding: "0 4px",
    font: "inherit",
    fontWeight: 700,
    lineHeight: 1,
    outline: "none",
  },
  popover: {
    position: "absolute",
    left: "50%",
    top: "calc(100% + 8px)",
    transform: "translateX(-50%)",
    zIndex: 40,
    width: 256,
    borderRadius: 16,
    border: "0.5px solid var(--bdr, #242E42)",
    background: "var(--surf, #0B0F18)",
    padding: 14,
    boxShadow: "0 22px 55px rgba(0,0,0,.18)",
  },
  monthHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  monthButton: {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: 7,
    background: "var(--elev, #111520)",
    color: "var(--t3, #8EA2C0)",
    cursor: "pointer",
    padding: 0,
  },
  monthTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--t1, #F0F4FF)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 4,
  },
  dow: {
    paddingBottom: 4,
    textAlign: "center",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--t3, #5C7090)",
  },
  day: {
    aspectRatio: "1 / 1",
    borderRadius: 7,
    fontSize: 11,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    transition: "background .15s, color .15s, border-color .15s",
    padding: 0,
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    borderTop: "0.5px solid var(--bdr, #171D2E)",
    marginTop: 10,
    paddingTop: 10,
  },
  footerButton: {
    border: 0,
    borderRadius: 7,
    background: "transparent",
    color: "var(--t3, #8EA2C0)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    padding: "5px 7px",
  },
};
