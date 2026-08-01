import { useCallback, useMemo, useState } from "react";
import { useCashFlowBranch } from "../data/useCashFlowBranch";
import { findDateIndex, sortDatesDesc, toDateInputValue } from "./dateUtils";

export function useTradingDateControl() {
  const { datesAsc } = useCashFlowBranch();
  const [selectedDate, setSelectedDate] = useState("");

  const datesDesc = useMemo(() => sortDatesDesc(datesAsc), [datesAsc]);
  const latestDate = datesDesc[0] || "";
  const activeDateValue = selectedDate || toDateInputValue(latestDate);
  const activeDateIndex = useMemo(() => findDateIndex(datesDesc, activeDateValue), [datesDesc, activeDateValue]);
  const activeDate = activeDateIndex >= 0 ? datesDesc[activeDateIndex] : latestDate;
  const dateInputValue = toDateInputValue(activeDate);
  const canGoNewer = activeDateIndex > 0;
  const canGoOlder = activeDateIndex >= 0 && activeDateIndex < datesDesc.length - 1;

  const goToDate = useCallback((dateValue) => {
    const targetIndex = findDateIndex(datesDesc, dateValue);
    if (targetIndex >= 0) setSelectedDate(toDateInputValue(datesDesc[targetIndex]));
  }, [datesDesc]);

  const stepDate = useCallback((delta) => {
    if (!datesDesc.length) return;
    const currentIndex = activeDateIndex >= 0 ? activeDateIndex : 0;
    const targetIndex = Math.min(Math.max(currentIndex + delta, 0), datesDesc.length - 1);
    setSelectedDate(toDateInputValue(datesDesc[targetIndex]));
  }, [activeDateIndex, datesDesc]);

  return {
    dates: datesDesc,
    date: activeDate,
    dateInputValue,
    canGoNewer,
    canGoOlder,
    goToDate,
    stepDate,
  };
}
