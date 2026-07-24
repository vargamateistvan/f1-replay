import { lazy, Suspense } from "react";
import type { Driver } from "@/api/types";
import { PanelFallback } from "./PanelFallback";

const FocusedTelemetry = lazy(() =>
  import("@/components/FocusedTelemetry/FocusedTelemetry").then((m) => ({
    default: m.FocusedTelemetry,
  })),
);

interface TrackerFocusedTelemetryContentProps {
  sessionKey: number | null;
  drivers: Driver[];
  focusDriver: number | null;
  compareDriver: number | null;
  sessionStartMs: number;
  focusDriverLap: number | null;
  compareDriverLap: number | null;
  onClearFocus: () => void;
  onClearCompare: () => void;
}

export function TrackerFocusedTelemetryContent({
  sessionKey,
  drivers,
  focusDriver,
  compareDriver,
  sessionStartMs,
  focusDriverLap,
  compareDriverLap,
  onClearFocus,
  onClearCompare,
}: Readonly<TrackerFocusedTelemetryContentProps>) {
  if (focusDriver === null) return null;

  const focusDriverData =
    drivers.find((driver) => driver.driver_number === focusDriver) ?? null;
  const compareDriverData =
    drivers.find((driver) => driver.driver_number === compareDriver) ?? null;

  return (
    <Suspense fallback={<PanelFallback />}>
      <FocusedTelemetry
        sessionKey={sessionKey}
        driver={focusDriverData}
        compareDriver={compareDriverData}
        sessionStartMs={sessionStartMs}
        driverLap={focusDriverLap}
        compareDriverLap={compareDriverLap}
        onClear={onClearFocus}
        onClearCompare={onClearCompare}
      />
    </Suspense>
  );
}
