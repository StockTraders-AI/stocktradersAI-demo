import { useCallback, useEffect, useMemo, useState } from "react";
import { valToHmCls } from "../../styles/tokens";
import { useSMDT, useRealtimeFeed } from "../../data/useSMDT";
import { useNarrow } from "../../app/useNarrow";
import { fmtDay, fmtFull, fmtNum } from "../../app/formatters";
import { Card, Pagination, HM, Banner, LiveFooter } from "../../components/ui";
import { HeatLegend, SMDTToolbarPill, SMDTSearchPill, linkBtn } from "../../components/ui/ModuleControls";
import { IndustryPicker } from "../cash-flow-ticker/IndustryPicker";
import { cashFlowMatrixDateTd, cashFlowMatrixTd, cashFlowMatrixTh } from "../cash-flow-ticker/cashFlowUtils";

const HIDDEN_INDUSTRIES_KEY = "smdt_branch_hidden_industries_v1";
const SMDT_SESSION_OPTIONS = [12, 25, 50];

function loadSet(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}

function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return date.slice(0, 10);
}

function findDateIndex(datesDesc, dateValue) {
  if (!dateValue || datesDesc.length === 0) return -1;
  const exactIndex = datesDesc.findIndex((date) => toDateInputValue(date) === dateValue);
  if (exactIndex >= 0) return exactIndex;
  const previousIndex = datesDesc.findIndex((date) => toDateInputValue(date) <= dateValue);
  return previousIndex === -1 ? datesDesc.length - 1 : previousIndex;
}

function getSmdtSig(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 70) return "si";
  if (value >= 20) return "sn";
  if (value > -20) return "so";
  return "st";
}

export function ModSMDTNganh() {
  const narrow = useNarrow();
  const { branches, datesAsc, matrix, status, error, updatedAt, refresh, applyTick } = useSMDT();
  const { connected: live } = useRealtimeFeed(applyTick);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState(12);
  const [selectedDate, setSelectedDate] = useState("");
  const [dateSort, setDateSort] = useState("desc");
  const [hiddenInd, setHiddenInd] = useState(() => loadSet(HIDDEN_INDUSTRIES_KEY));

  const industries = useMemo(() => branches.map((b) => b.label), [branches]);

  const visibleBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return branches
      .filter((b) => !hiddenInd.has(b.label))
      .filter((b) => (q ? b.label.toLowerCase().includes(q) : true));
  }, [branches, hiddenInd, query]);

  const datesDesc = useMemo(() => [...datesAsc].reverse(), [datesAsc]);
  const latestDate = datesDesc[0] || null;
  const activeDateValue = selectedDate || toDateInputValue(latestDate);
  const activeDateIndex = useMemo(() => findDateIndex(datesDesc, activeDateValue), [datesDesc, activeDateValue]);
  const activeDate = activeDateIndex >= 0 ? datesDesc[activeDateIndex] : latestDate;
  const minDate = toDateInputValue(datesDesc[datesDesc.length - 1]);
  const maxDate = toDateInputValue(latestDate);
  const dateInputValue = toDateInputValue(activeDate);
  const canGoNewer = activeDateIndex > 0;
  const canGoOlder = activeDateIndex >= 0 && activeDateIndex < datesDesc.length - 1;
  const totalPages = Math.max(1, Math.ceil(datesDesc.length / sessions));
  const safePage = Math.min(page, totalPages);
  const orderedDates = useMemo(() => dateSort === "desc" ? datesDesc : [...datesDesc].reverse(), [dateSort, datesDesc]);
  const activeDisplayIndex = useMemo(() => orderedDates.findIndex((date) => toDateInputValue(date) === dateInputValue), [dateInputValue, orderedDates]);
  const pageStartIndex = selectedDate && activeDisplayIndex >= 0
    ? dateSort === "desc" ? activeDisplayIndex : Math.max(0, activeDisplayIndex - sessions + 1)
    : (safePage - 1) * sessions;
  const pageDates = orderedDates.slice(pageStartIndex, pageStartIndex + sessions);
  const colCount = visibleBranches.length;
  const industrySig = useMemo(() => {
    const map = {};
    for (const b of branches) map[b.label] = getSmdtSig(matrix[b.key]?.[activeDate]);
    return map;
  }, [activeDate, branches, matrix]);

  useEffect(() => {
    if (!industries.length) return;
    const valid = new Set(industries);
    setHiddenInd((prev) => {
      const next = new Set([...prev].filter((ind) => valid.has(ind)));
      return next.size === prev.size ? prev : next;
    });
  }, [industries]);

  useEffect(() => {
    saveSet(HIDDEN_INDUSTRIES_KEY, hiddenInd);
  }, [hiddenInd]);

  const goToDate = useCallback((dateValue) => {
    const targetIndex = findDateIndex(datesDesc, dateValue);
    if (targetIndex >= 0) {
      const targetValue = toDateInputValue(datesDesc[targetIndex]);
      const displayIndex = orderedDates.findIndex((date) => toDateInputValue(date) === targetValue);
      const startIndex = dateSort === "desc" ? displayIndex : Math.max(0, displayIndex - sessions + 1);
      setSelectedDate(targetValue);
      setPage(Math.floor(Math.max(0, startIndex) / sessions) + 1);
    }
  }, [dateSort, datesDesc, orderedDates, sessions]);

  const stepDate = useCallback((delta) => {
    if (datesDesc.length === 0) return;
    const currentIndex = activeDateIndex >= 0 ? activeDateIndex : 0;
    const targetIndex = Math.min(Math.max(currentIndex + delta, 0), datesDesc.length - 1);
    const targetValue = toDateInputValue(datesDesc[targetIndex]);
    const displayIndex = orderedDates.findIndex((date) => toDateInputValue(date) === targetValue);
    const startIndex = dateSort === "desc" ? displayIndex : Math.max(0, displayIndex - sessions + 1);
    setSelectedDate(targetValue);
    setPage(Math.floor(Math.max(0, startIndex) / sessions) + 1);
  }, [activeDateIndex, dateSort, datesDesc, orderedDates, sessions]);
  const changePage = useCallback((nextPage) => {
    setSelectedDate("");
    setPage(nextPage);
  }, []);
  const toggleDateSort = useCallback(() => {
    const next = dateSort === "desc" ? "asc" : "desc";
    const nextOrderedDates = next === "desc" ? datesDesc : [...datesDesc].reverse();
    const displayIndex = nextOrderedDates.findIndex((date) => toDateInputValue(date) === dateInputValue);
    const startIndex = selectedDate && displayIndex >= 0
      ? next === "desc" ? displayIndex : Math.max(0, displayIndex - sessions + 1)
      : 0;
    setDateSort(next);
    setPage(Math.floor(Math.max(0, startIndex) / sessions) + 1);
  }, [dateInputValue, dateSort, datesDesc, selectedDate, sessions]);

  const toggleInd = useCallback((ind) => {
    setHiddenInd((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind); else next.add(ind);
      return next;
    });
  }, []);
  const showIndustries = useCallback((items) => {
    setHiddenInd((prev) => {
      const next = new Set(prev);
      for (const ind of items) next.delete(ind);
      return next;
    });
  }, []);
  const hideIndustries = useCallback((items) => {
    setHiddenInd((prev) => {
      const next = new Set(prev);
      for (const ind of items) next.add(ind);
      return next;
    });
  }, []);
  const selectAllInd = useCallback(() => setHiddenInd(new Set()), []);
  const clearAllInd = useCallback(() => setHiddenInd(new Set(industries)), [industries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: narrow ? "wrap" : "nowrap", overflow: "visible", paddingBottom: 2 }}>
        <IndustryPicker
          industries={industries}
          hidden={hiddenInd}
          industrySig={industrySig}
          onToggle={toggleInd}
          onAll={selectAllInd}
          onNone={clearAllInd}
          onShowIndustries={showIndustries}
          onHideIndustries={hideIndustries}
        />
        <SMDTToolbarPill style={{ gap: 3, padding: "0 6px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => stepDate(1)}
            disabled={!canGoOlder}
            title="Lùi 1 phiên"
            style={{ width: 18, height: 22, border: "none", borderRadius: 6, background: "transparent", color: canGoOlder ? "var(--t2)" : "var(--t4)", cursor: canGoOlder ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
          </button>
          <label style={{ cursor: "pointer", position: "relative", display: "inline-flex", alignItems: "center", gap: 5, minWidth: 96, justifyContent: "center" }}>
            <i className="ti ti-calendar" style={{ fontSize: 13, color: "var(--t4)" }} />
            {dateInputValue ? fmtFull(dateInputValue) : "—"}
            <input
              type="date"
              value={dateInputValue}
              min={minDate}
              max={maxDate}
              onChange={(e) => goToDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
            />
          </label>
          <button
            type="button"
            onClick={() => stepDate(-1)}
            disabled={!canGoNewer}
            title="Tiến 1 phiên"
            style={{ width: 18, height: 22, border: "none", borderRadius: 6, background: "transparent", color: canGoNewer ? "var(--t2)" : "var(--t4)", cursor: canGoNewer ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
          </button>
        </SMDTToolbarPill>
        <SMDTToolbarPill as="label" style={{ cursor: "pointer", padding: "0 10px", flexShrink: 0 }}>
          <select
            value={sessions}
            onChange={(e) => {
              setSessions(Number(e.target.value));
              setPage(1);
              setSelectedDate("");
            }}
            style={{ border: "none", outline: "none", background: "transparent", color: "var(--t2)", font: "inherit", fontWeight: 700, cursor: "pointer", appearance: "none", padding: 0 }}
          >
            {SMDT_SESSION_OPTIONS.map((n) => (
              <option key={n} value={n} style={{ background: "var(--surf)", color: "var(--t1)" }}>
                {n} phiên
              </option>
            ))}
          </select>
          <i className="ti ti-chevron-down" style={{ fontSize: 12, color: "var(--t4)" }} />
        </SMDTToolbarPill>
        <SMDTSearchPill placeholder="Tìm ngành..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: narrow ? "100%" : 150, padding: "0 10px", flexShrink: narrow ? 1 : 0 }} />
      </div>

      {status === "loading" && !datesDesc.length && <Banner>Đang tải dữ liệu…</Banner>}
      {status === "error" && !datesDesc.length && (
        <Banner tone="error">Lỗi tải dữ liệu: {error} <button onClick={refresh} style={linkBtn}>Thử lại</button></Banner>
      )}

      <Card noPad>
        {narrow ? (
          <div style={{ display: "grid", gap: 10, padding: 12 }}>
            {pageDates.map((date, di) => {
              const isLatest = toDateInputValue(date) === toDateInputValue(latestDate);
              const isActive = dateInputValue === toDateInputValue(date);
              return (
                <div key={date} style={{ background: isActive || isLatest ? "var(--elev)" : "var(--surf)", border: "0.5px solid var(--bdr)", borderRadius: 11, padding: "12px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                    <span style={{ color: "var(--t1)", fontSize: 13, fontWeight: 800 }}>{fmtDay(date)}</span>
                    {isLatest && <span style={{ fontSize: 8, background: "var(--Bs)", color: "var(--B)", borderRadius: 3, padding: "1px 5px", fontWeight: 800 }}>HN</span>}
                    <span style={{ marginLeft: "auto", color: "var(--t4)", fontSize: 11 }}>{fmtFull(date)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 8 }}>
                    {visibleBranches.map((b) => {
                      const v = matrix[b.key]?.[date];
                      const cls = valToHmCls(v);
                      return (
                        <div key={b.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, background: "var(--surf)", border: "0.5px solid var(--bdrs)", borderRadius: 8, padding: "8px 9px" }}>
                          <span title={b.label} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--t2)", fontSize: 11, fontWeight: 700 }}>{b.label}</span>
                          {cls ? <HM cls={cls} val={v.toFixed(2)} /> : <span style={{ color: "var(--t4)" }}>—</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {visibleBranches.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "var(--t3)" }}>Không tìm thấy ngành phù hợp.</div>}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: Math.max(700, 150 + colCount * 90) }}>
            <thead>
              <tr>
                <th style={{ ...cashFlowMatrixTh, position: "sticky", left: 0, zIndex: 4, width: 150, textAlign: "left" }}>
                  <button type="button" onClick={toggleDateSort} title={dateSort === "desc" ? "Last date ở trên cùng" : "Last date ở dưới cùng"} style={dateSortBtn}>
                    NGÀY {dateSort === "desc" ? "↓" : "↑"}
                  </button>
                </th>
                {visibleBranches.map((b) => (
                  <th key={b.key} title={b.key} style={{ ...cashFlowMatrixTh, minWidth: 90 }}>{b.label.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageDates.map((date, di) => {
                const isLatest = toDateInputValue(date) === toDateInputValue(latestDate);
                const isActive = dateInputValue === toDateInputValue(date);
                const dateBg = isActive || isLatest ? "var(--elev)" : "var(--surf)";
                return (
                  <tr key={date}>
                    <td style={{ ...cashFlowMatrixDateTd, position: "sticky", left: 0, zIndex: 2, background: dateBg, fontWeight: isActive || isLatest ? 800 : 700 }}>
                      {fmtDay(date)}
                      {isLatest && <span style={{ fontSize: 8, background: "var(--Bs)", color: "var(--B)", borderRadius: 3, padding: "1px 5px", marginLeft: 5, fontWeight: 800 }}>HN</span>}
                    </td>
                    {visibleBranches.map((b) => {
                      const v = matrix[b.key]?.[date];
                      const cls = valToHmCls(v);
                      return (
                        <td key={b.key} style={{ ...cashFlowMatrixTd, background: isActive || isLatest ? "var(--elev)" : cashFlowMatrixTd.background }}>
                          {cls ? <HM cls={cls} val={v.toFixed(2)} /> : <span style={{ color: "var(--t4)" }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {visibleBranches.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 28, textAlign: "center", color: "var(--t3)" }}>Không tìm thấy ngành phù hợp.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <HeatLegend />
        <Pagination page={safePage} totalPages={totalPages} onChange={changePage} />
      </div>
      <LiveFooter live={live} updatedAt={updatedAt} extra={`${fmtNum(visibleBranches.length)} / ${fmtNum(branches.length)} ngành · ${datesDesc.length} phiên`} />
    </div>
  );
}

const dateSortBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-start",
  width: "100%",
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
};
