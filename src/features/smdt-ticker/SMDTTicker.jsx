import { useCallback, useEffect, useMemo, useState } from "react";
import { valToHmCls } from "../../styles/tokens";
import { useSMDTTicker, useRealtimeSMDTTickerFeed } from "../../data/useSMDTTicker";
import { useBranchPath } from "../../data/useBranchPath";
import { useNarrow } from "../../app/useNarrow";
import { fmtDay, fmtFull, fmtNum } from "../../app/formatters";
import { Card, Pagination, HM, Banner, LiveFooter, Loading } from "../../components/ui";
import { DateSessionSelect, HeatLegend, SMDTToolbarPill, SMDTSearchPill, linkBtn } from "../../components/ui/ModuleControls";
import { IndustryPicker } from "../cash-flow-ticker/IndustryPicker";
import { cashFlowGroupTh, cashFlowMatrixDateTd, cashFlowMatrixTd, cashFlowMatrixTh } from "../cash-flow-ticker/cashFlowUtils";

const HIDDEN_INDUSTRIES_KEY = "smdt_ticker_hidden_industries_v1";
const COLLAPSED_INDUSTRIES_KEY = "smdt_ticker_collapsed_industries_v1";
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

export function ModSMDTMa() {
  const narrow = useNarrow();
  const { tickers, datesAsc, matrix, status, error, updatedAt, refresh, applyTick } = useSMDTTicker();
  const { connected: live } = useRealtimeSMDTTickerFeed(applyTick);
  const { tickerToBranch, status: branchPathStatus, error: branchPathError, refresh: refreshBranchPath } = useBranchPath();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState(12);
  const [selectedDate, setSelectedDate] = useState("");
  const [dateSort, setDateSort] = useState("desc");
  const [hiddenInd, setHiddenInd] = useState(() => loadSet(HIDDEN_INDUSTRIES_KEY));
  const [collapsedInd, setCollapsedInd] = useState(() => loadSet(COLLAPSED_INDUSTRIES_KEY));

  const { tickerPool, industries } = useMemo(() => {
    const indSeen = new Set();
    const pool = tickers.flatMap((tk) => {
      const ind = tickerToBranch[tk.key];
      if (!ind) return [];
      indSeen.add(ind);
      return [{ ...tk, type: ind }];
    }).sort((a, b) => a.key.localeCompare(b.key));
    const indList = [...indSeen].sort((a, b) => a.localeCompare(b, "vi"));
    return { tickerPool: pool, industries: indList };
  }, [tickers, tickerToBranch]);

  const datesDesc = useMemo(() => [...datesAsc].reverse(), [datesAsc]);
  const latestDate = datesDesc[0] || null;
  const activeDateValue = selectedDate || toDateInputValue(latestDate);
  const activeDateIndex = useMemo(() => findDateIndex(datesDesc, activeDateValue), [datesDesc, activeDateValue]);
  const activeDate = activeDateIndex >= 0 ? datesDesc[activeDateIndex] : latestDate;
  const dateInputValue = toDateInputValue(activeDate);
  const canGoNewer = activeDateIndex > 0;
  const canGoOlder = activeDateIndex >= 0 && activeDateIndex < datesDesc.length - 1;

  const visibleTickers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickerPool.filter((tk) => {
      if (hiddenInd.has(tk.type)) return false;
      if (q && !tk.key.toLowerCase().includes(q) && !tk.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickerPool, hiddenInd, query]);

  const groups = useMemo(() => {
    const byInd = new Map();
    for (const tk of visibleTickers) {
      if (!byInd.has(tk.type)) byInd.set(tk.type, []);
      byInd.get(tk.type).push(tk);
    }
    return industries.filter((i) => byInd.has(i)).map((i) => ({ industry: i, tickers: byInd.get(i) }));
  }, [visibleTickers, industries]);

  const groupStarts = useMemo(() => new Set(groups.map((g) => g.tickers[0]?.key).filter(Boolean)), [groups]);
  const colCount = useMemo(
    () => groups.reduce((a, g) => a + (collapsedInd.has(g.industry) ? 1 : g.tickers.length), 0),
    [groups, collapsedInd]
  );

  const industrySig = useMemo(() => {
    const sigMap = {};
    for (const ind of industries) {
      let sum = 0;
      let count = 0;
      for (const tk of tickerPool) {
        if (tk.type !== ind) continue;
        const value = matrix[tk.key]?.[activeDate];
        if (Number.isFinite(value)) {
          sum += value;
          count += 1;
        }
      }
      sigMap[ind] = count ? getSmdtSig(sum / count) : null;
    }
    return sigMap;
  }, [activeDate, industries, matrix, tickerPool]);

  const totalPages = Math.max(1, Math.ceil(datesDesc.length / sessions));
  const safePage = Math.min(page, totalPages);
  const orderedDates = useMemo(() => dateSort === "desc" ? datesDesc : [...datesDesc].reverse(), [dateSort, datesDesc]);
  const activeDisplayIndex = useMemo(() => orderedDates.findIndex((date) => toDateInputValue(date) === dateInputValue), [dateInputValue, orderedDates]);
  const pageStartIndex = selectedDate && activeDisplayIndex >= 0
    ? dateSort === "desc" ? activeDisplayIndex : Math.max(0, activeDisplayIndex - sessions + 1)
    : (safePage - 1) * sessions;
  const pageDates = orderedDates.slice(pageStartIndex, pageStartIndex + sessions);

  useEffect(() => {
    if (!industries.length) return;
    const valid = new Set(industries);
    setHiddenInd((prev) => {
      const next = new Set([...prev].filter((ind) => valid.has(ind)));
      return next.size === prev.size ? prev : next;
    });
    setCollapsedInd((prev) => {
      const next = new Set([...prev].filter((ind) => valid.has(ind)));
      return next.size === prev.size ? prev : next;
    });
  }, [industries]);

  useEffect(() => {
    saveSet(HIDDEN_INDUSTRIES_KEY, hiddenInd);
  }, [hiddenInd]);

  useEffect(() => {
    saveSet(COLLAPSED_INDUSTRIES_KEY, collapsedInd);
  }, [collapsedInd]);

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
  const changeSessions = useCallback((nextSessions) => {
    setSessions(nextSessions);
    if (!selectedDate) {
      setPage(1);
      return;
    }
    const displayIndex = orderedDates.findIndex((date) => toDateInputValue(date) === selectedDate);
    const startIndex = dateSort === "desc" ? displayIndex : Math.max(0, displayIndex - nextSessions + 1);
    setPage(Math.floor(Math.max(0, startIndex) / nextSessions) + 1);
  }, [dateSort, orderedDates, selectedDate]);
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

  const toggleCollapse = useCallback((ind) => {
    setCollapsedInd((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind); else next.add(ind);
      return next;
    });
  }, []);

  const selectAllInd = useCallback(() => setHiddenInd(new Set()), []);
  const clearAllInd = useCallback(() => setHiddenInd(new Set(industries)), [industries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={narrow ? { display: "grid", gridTemplateColumns: "minmax(102px, 1fr) minmax(124px, 1.08fr) minmax(72px, .72fr)", alignItems: "center", gap: 6, overflow: "visible", paddingBottom: 2 } : { display: "flex", alignItems: "center", gap: 7, flexWrap: "nowrap", overflow: "visible", paddingBottom: 2 }}>
        <IndustryPicker
          industries={industries}
          hidden={hiddenInd}
          industrySig={industrySig}
          onToggle={toggleInd}
          onAll={selectAllInd}
          onNone={clearAllInd}
          onShowIndustries={showIndustries}
          onHideIndustries={hideIndustries}
          style={narrow ? { width: "100%", minWidth: 0 } : undefined}
          buttonStyle={narrow ? { width: "100%", minWidth: 0, justifyContent: "center", gap: 5, padding: "0 8px", overflow: "hidden" } : undefined}
        />
        <SMDTToolbarPill style={narrow ? { width: "100%", minWidth: 0, gap: 2, padding: "0 4px", flexShrink: 1, justifyContent: "center" } : { gap: 3, padding: "0 6px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => stepDate(1)}
            disabled={!canGoOlder}
            title="Lùi 1 phiên"
            style={{ width: narrow ? 16 : 18, height: 22, border: "none", borderRadius: 6, background: "transparent", color: canGoOlder ? "var(--t2)" : "var(--t4)", cursor: canGoOlder ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
          >
            <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
          </button>
          <DateSessionSelect value={dateInputValue} dates={datesDesc} onChange={goToDate} buttonStyle={narrow ? { minWidth: 74, gap: 4, fontSize: 11 } : undefined} />
          <button
            type="button"
            onClick={() => stepDate(-1)}
            disabled={!canGoNewer}
            title="Tiến 1 phiên"
            style={{ width: narrow ? 16 : 18, height: 22, border: "none", borderRadius: 6, background: "transparent", color: canGoNewer ? "var(--t2)" : "var(--t4)", cursor: canGoNewer ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
          >
            <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
          </button>
        </SMDTToolbarPill>
        <SMDTToolbarPill as="label" style={narrow ? { width: "100%", minWidth: 0, cursor: "pointer", padding: "0 8px", flexShrink: 1, justifyContent: "center", gap: 4 } : { cursor: "pointer", padding: "0 10px", flexShrink: 0 }}>
          <select
            value={sessions}
            onChange={(e) => changeSessions(Number(e.target.value))}
            style={{ minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--t2)", font: "inherit", fontWeight: 700, cursor: "pointer", appearance: "none", padding: 0 }}
          >
            {SMDT_SESSION_OPTIONS.map((n) => (
              <option key={n} value={n} style={{ background: "var(--surf)", color: "var(--t1)" }}>
                {n} phiên
              </option>
            ))}
          </select>
          <i className="ti ti-chevron-down" style={{ fontSize: 12, color: "var(--t4)" }} />
        </SMDTToolbarPill>
        <SMDTSearchPill placeholder="Tìm mã..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ gridColumn: narrow ? "1 / -1" : undefined, width: narrow ? "100%" : 118, padding: "0 10px", flexShrink: narrow ? 1 : 0 }} />
      </div>

      {status === "loading" && !datesDesc.length && <Loading label="Đang tải dữ liệu SMDT cổ phiếu…" />}
      {status === "error" && !datesDesc.length && (
        <Banner tone="error">Lỗi tải dữ liệu: {error} <button onClick={refresh} style={linkBtn}>Thử lại</button></Banner>
      )}
      {branchPathStatus === "loading" && !Object.keys(tickerToBranch).length && <Loading label="Đang tải danh sách ngành cổ phiếu…" compact />}
      {branchPathStatus === "error" && !Object.keys(tickerToBranch).length && (
        <Banner tone="error">Lỗi tải danh sách ngành: {branchPathError} <button onClick={refreshBranchPath} style={linkBtn}>Thử lại</button></Banner>
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
                  <div style={{ display: "grid", gap: 9 }}>
                    {groups.map((g) => {
                      const collapsed = collapsedInd.has(g.industry);
                      const values = g.tickers.map((tk) => matrix[tk.key]?.[date]).filter(Number.isFinite);
                      const avg = values.length ? values.reduce((a, v) => a + v, 0) / values.length : null;
                      const avgCls = valToHmCls(avg);
                      return (
                        <div key={g.industry} style={{ background: "var(--surf)", border: "0.5px solid var(--bdrs)", borderRadius: 9, padding: "9px 10px" }}>
                          <button
                            type="button"
                            onClick={() => toggleCollapse(g.industry)}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, border: "none", background: "transparent", padding: 0, color: "var(--t2)", fontFamily: "inherit", cursor: "pointer" }}
                          >
                            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{g.industry}</span>
                            <span style={{ marginLeft: "auto", color: "var(--t4)", fontSize: 10, fontWeight: 800 }}>{g.tickers.length} mã</span>
                            <span style={{ color: "var(--t4)", fontSize: 14 }}>{collapsed ? "›" : "‹"}</span>
                          </button>
                          {collapsed ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                              <span style={{ color: "var(--t4)", fontSize: 11 }}>Tổng hợp</span>
                              {avgCls ? <HM cls={avgCls} val={avg.toFixed(2)} /> : <span style={{ color: "var(--t4)" }}>—</span>}
                            </div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 7, marginTop: 8 }}>
                              {g.tickers.map((tk) => {
                                const v = matrix[tk.key]?.[date];
                                const cls = valToHmCls(v);
                                return (
                                  <div key={tk.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0, background: "var(--elev)", border: "0.5px solid var(--bdrs)", borderRadius: 8, padding: "7px 8px" }}>
                                    <span title={tk.name} style={{ color: "var(--B)", fontSize: 11, fontWeight: 900 }}>{tk.key}</span>
                                    {cls ? <HM cls={cls} val={v.toFixed(0)} /> : <span style={{ color: "var(--t4)" }}>—</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {visibleTickers.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "var(--t3)" }}>Không tìm thấy mã phù hợp.</div>}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: Math.max(700, 150 + colCount * 76) }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...cashFlowMatrixTh, position: "sticky", left: 0, zIndex: 4, width: 150, textAlign: "left" }}>
                    <button type="button" onClick={toggleDateSort} title={dateSort === "desc" ? "Last date ở trên cùng" : "Last date ở dưới cùng"} style={dateSortBtn}>
                      NGÀY {dateSort === "desc" ? "↓" : "↑"}
                    </button>
                  </th>
                  {groups.map((g) => {
                    const collapsed = collapsedInd.has(g.industry);
                    return (
                      <th
                        key={g.industry}
                        colSpan={collapsed ? 1 : g.tickers.length}
                        onClick={() => toggleCollapse(g.industry)}
                        title={collapsed ? "Mở rộng nhóm" : "Thu gọn nhóm"}
                        style={{ ...cashFlowGroupTh, cursor: "pointer", borderLeft: "1px solid var(--bdr)" }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <span>{g.industry.toUpperCase()}</span>
                          {!collapsed && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: "var(--B)", background: "var(--Bs)", borderRadius: 4, padding: "1px 5px" }}>{g.tickers.length}</span>
                          )}
                          <span style={{ color: "var(--t4)", fontSize: 12 }}>{collapsed ? "›" : "‹"}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {groups.map((g) => {
                    if (collapsedInd.has(g.industry)) {
                      return <th key={g.industry} style={{ ...cashFlowMatrixTh, borderLeft: "1px solid var(--bdr)" }}>Tổng hợp</th>;
                    }
                    return g.tickers.map((tk) => (
                      <th key={tk.key} title={tk.name} style={{ ...cashFlowMatrixTh, borderLeft: groupStarts.has(tk.key) ? "1px solid var(--bdr)" : cashFlowMatrixTh.borderRight }}>{tk.key}</th>
                    ));
                  })}
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
                      {groups.map((g) => {
                        if (collapsedInd.has(g.industry)) {
                          const values = g.tickers.map((tk) => matrix[tk.key]?.[date]).filter(Number.isFinite);
                          const value = values.length ? values.reduce((a, v) => a + v, 0) / values.length : null;
                          const cls = valToHmCls(value);
                          return (
                            <td key={g.industry} style={{ ...cashFlowMatrixTd, borderLeft: "1px solid var(--bdr)", background: isActive || isLatest ? "var(--elev)" : cashFlowMatrixTd.background }}>
                              {cls ? <HM cls={cls} val={value.toFixed(2)} /> : <span style={{ color: "var(--t4)" }}>—</span>}
                            </td>
                          );
                        }
                        return g.tickers.map((tk) => {
                          const v = matrix[tk.key]?.[date];
                          const cls = valToHmCls(v);
                          return (
                            <td key={tk.key} style={{ ...cashFlowMatrixTd, borderLeft: groupStarts.has(tk.key) ? "1px solid var(--bdr)" : cashFlowMatrixTd.borderRight, background: isActive || isLatest ? "var(--elev)" : cashFlowMatrixTd.background }}>
                              {cls ? <HM cls={cls} val={v.toFixed(2)} /> : <span style={{ color: "var(--t4)" }}>—</span>}
                            </td>
                          );
                        });
                      })}
                    </tr>
                  );
                })}
                {visibleTickers.length === 0 && (
                  <tr><td colSpan={2} style={{ padding: 28, textAlign: "center", color: "var(--t3)" }}>Không tìm thấy mã phù hợp.</td></tr>
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
      <LiveFooter live={live} updatedAt={updatedAt} extra={`${fmtNum(visibleTickers.length)} / ${fmtNum(tickerPool.length)} mã · ${datesDesc.length}`} />
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
