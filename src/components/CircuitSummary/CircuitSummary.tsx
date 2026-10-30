import { useId, useMemo } from "react";
import type { Meeting } from "@/api/types";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useSettings } from "@/stores/settings";
import { circuitStats, circuitThumbnail } from "@/utils/circuitInfo";
import { distanceUnitLabel, toDisplayDistanceKm } from "@/utils/units";
import {
  SCHEDULE_OUTLINE_ARROW_FRACTION,
  SCHEDULE_OUTLINE_H,
  SCHEDULE_OUTLINE_PAD,
  SCHEDULE_OUTLINE_W,
} from "@/constants";

const CIRCUIT_TYPE_LABEL: Record<Meeting["circuit_type"], string> = {
  Permanent: "Permanent",
  "Temporary - Street": "Street",
  "Temporary - Road": "Road",
};

function formatPitLoss(raw: string | undefined): string | null {
  const seconds = Number(raw);
  return raw && Number.isFinite(seconds) ? `${seconds.toFixed(1)}s` : null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-tiny font-bold uppercase tracking-widest text-muted">
        {label}
      </dt>
      <dd className="truncate font-mono text-small text-fg/90">{value}</dd>
    </div>
  );
}

// Track outline (start/finish tick + direction arrow) and key circuit facts
// from the baked geometry. Circuits without geometry show the facts the
// meeting itself carries.
export function CircuitSummary({
  meeting,
  year,
  className = "",
}: {
  meeting: Pick<Meeting, "circuit_key" | "circuit_short_name" | "circuit_type">;
  year: number;
  className?: string;
}) {
  const { data: geometry, isPending } = useCircuitGeometry(meeting.circuit_key, year);
  const metricSystem = useSettings((s) => s.metricSystem);
  const arrowId = useId();

  const stats = useMemo(() => (geometry ? circuitStats(geometry) : null), [geometry]);
  const thumb = useMemo(
    () =>
      geometry
        ? circuitThumbnail(
            geometry,
            SCHEDULE_OUTLINE_W,
            SCHEDULE_OUTLINE_H,
            SCHEDULE_OUTLINE_PAD,
            SCHEDULE_OUTLINE_ARROW_FRACTION,
          )
        : null,
    [geometry],
  );

  const pitLoss = formatPitLoss(geometry?.pitLoss?.normal);
  const pitLossSc = formatPitLoss(geometry?.pitLoss?.sc);
  const typeLabel = CIRCUIT_TYPE_LABEL[meeting.circuit_type] ?? meeting.circuit_type;

  return (
    <div className={`flex items-center gap-3 border-b border-panel px-3 py-2 ${className}`}>
      <div
        className="shrink-0 text-fg/80"
        style={{ width: SCHEDULE_OUTLINE_W / 1.25, height: SCHEDULE_OUTLINE_H / 1.25 }}
      >
        {thumb ? (
          <svg
            viewBox={`0 0 ${SCHEDULE_OUTLINE_W} ${SCHEDULE_OUTLINE_H}`}
            className="h-full w-full"
            role="img"
            aria-label={`${meeting.circuit_short_name} track outline`}
          >
            <defs>
              <marker
                id={arrowId}
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10Z" className="fill-f1red" />
              </marker>
            </defs>
            <path
              d={thumb.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <path
              d={thumb.arrowPath}
              fill="none"
              className="stroke-f1red"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={`url(#${arrowId})`}
            />
            <line
              {...thumb.startLine}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div
            className={`h-full w-full rounded-sm bg-panel/40 ${isPending ? "animate-pulse" : ""}`}
          />
        )}
      </div>
      <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1">
        {stats && (
          <Fact
            label="Length"
            value={`${toDisplayDistanceKm(stats.lengthKm, metricSystem).toFixed(2)} ${distanceUnitLabel(metricSystem)}`}
          />
        )}
        {stats?.turns != null && <Fact label="Turns" value={String(stats.turns)} />}
        {stats && (
          <Fact
            label="Direction"
            value={stats.direction === "clockwise" ? "Clockwise" : "Anticlockwise"}
          />
        )}
        <Fact label="Type" value={typeLabel} />
        {pitLoss && (
          <Fact
            label="Pit loss"
            value={pitLossSc ? `${pitLoss} · SC ${pitLossSc}` : pitLoss}
          />
        )}
      </dl>
    </div>
  );
}
