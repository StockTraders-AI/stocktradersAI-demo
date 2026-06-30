import { fmtDay } from "../../app/formatters";
import { tickerContentToSig } from "../../data/useCashFlowTicker";
import { CfBadge } from "./CfBadge";
import {
  cashFlowGroupTh,
  cashFlowMatrixDateTd,
  cashFlowMatrixTd,
  cashFlowMatrixTh,
} from "./cashFlowUtils";

function toDateInputValue(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return date.slice(0, 10);
}

export function CashFlowMatrixTable({
  collapsedInd,
  colCount,
  groupStarts,
  groups,
  matrix,
  pageDates,
  dateSort,
  onToggleDateSort,
  activeDate,
  latestDate,
  branchIndustrySigByDate,
  toggleCollapse,
  visibleTickers,
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: Math.max(640, 150 + colCount * 96) }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...cashFlowMatrixTh, position: "sticky", left: 0, zIndex: 4, width: 150, textAlign: "left" }}>
              <button type="button" onClick={onToggleDateSort} title={dateSort === "desc" ? "Last date ở trên cùng" : "Last date ở dưới cùng"} style={dateSortBtn}>
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
              return g.tickers.map((ticker) => (
                <th key={ticker} style={{ ...cashFlowMatrixTh, borderLeft: groupStarts.has(ticker) ? "1px solid var(--bdr)" : cashFlowMatrixTh.borderRight }}>{ticker}</th>
              ));
            })}
          </tr>
        </thead>
        <tbody>
          {pageDates.map((bucket, di) => {
            const isLatest = toDateInputValue(bucket.date) === toDateInputValue(latestDate);
            const isActive = activeDate === toDateInputValue(bucket.date);
            const dateBg = isActive || isLatest ? "var(--elev)" : "var(--surf)";
            return (
              <tr key={bucket.date}>
                <td style={{ ...cashFlowMatrixDateTd, position: "sticky", left: 0, zIndex: 2, background: dateBg, fontWeight: isActive || isLatest ? 800 : 700 }}>
                  {fmtDay(bucket.date)}
                  {isLatest && <span style={{ fontSize: 8, background: "var(--Bs)", color: "var(--B)", borderRadius: 3, padding: "1px 5px", marginLeft: 5, fontWeight: 800 }}>HN</span>}
                </td>
                {groups.map((g) => {
                  if (collapsedInd.has(g.industry)) {
                    const sig = branchIndustrySigByDate?.[g.industry]?.[toDateInputValue(bucket.date)] || null;
                    return (
                      <td key={g.industry} style={{ ...cashFlowMatrixTd, borderLeft: "1px solid var(--bdr)", background: isActive || isLatest ? "var(--elev)" : cashFlowMatrixTd.background }}>
                        <CfBadge sig={sig} compact />
                      </td>
                    );
                  }
                  return g.tickers.map((ticker) => (
                    <td key={ticker} style={{ ...cashFlowMatrixTd, borderLeft: groupStarts.has(ticker) ? "1px solid var(--bdr)" : cashFlowMatrixTd.borderRight, background: isActive || isLatest ? "var(--elev)" : cashFlowMatrixTd.background }}>
                      <CfBadge sig={tickerContentToSig(matrix[bucket.date]?.[ticker])} compact />
                    </td>
                  ));
                })}
              </tr>
            );
          })}
          {visibleTickers.length === 0 && (
            <tr><td colSpan={2} style={{ padding: 28, textAlign: "center", color: "var(--t3)" }}>Không có mã phù hợp.</td></tr>
          )}
        </tbody>
      </table>
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
