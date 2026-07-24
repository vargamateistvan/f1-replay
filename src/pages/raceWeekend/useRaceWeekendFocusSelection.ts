import { useCallback } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";

interface UseRaceWeekendFocusSelectionArgs {
  focusDriver: number | null;
  setSearchParams: SetURLSearchParams;
}

export function useRaceWeekendFocusSelection({
  focusDriver,
  setSearchParams,
}: Readonly<UseRaceWeekendFocusSelectionArgs>) {
  const setFocusSelection = useCallback(
    (
      focus: number | null,
      compare: number | null,
      source: string = "unknown",
    ) => {
      trackEvent("raceweekend_focus_changed", {
        focus_driver: focus ?? -1,
        compare_driver: compare ?? -1,
        source,
      });

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (focus === null || Number.isNaN(focus)) next.delete("focus");
          else next.set("focus", String(focus));

          if (compare === null || Number.isNaN(compare)) next.delete("compare");
          else next.set("compare", String(compare));

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toggleFocus = useCallback(
    (driverNumber: number) => {
      if (focusDriver === null) {
        setFocusSelection(driverNumber, null, "select_initial");
        return;
      }

      if (focusDriver === driverNumber) {
        setFocusSelection(null, null, "deselect_same");
        return;
      }

      // Clicking a different driver should move focus immediately to that driver.
      setFocusSelection(driverNumber, null, "switch_focus");
    },
    [focusDriver, setFocusSelection],
  );

  const clearFocusSelection = useCallback(() => {
    setFocusSelection(null, null, "clear_focus");
  }, [setFocusSelection]);

  return {
    setFocusSelection,
    toggleFocus,
    clearFocusSelection,
  } as const;
}
