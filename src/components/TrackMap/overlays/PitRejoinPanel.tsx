import type { Driver } from "@/api/types";
import type {
  PitLossCondition,
  PitRejoinNeighbour,
  PitRejoinProjection,
} from "@/utils/pitRejoin";

const CONDITION_LABEL: Record<PitLossCondition, string> = {
  normal: "Green",
  vsc: "VSC",
  sc: "SC",
};

function NeighbourRow({
  label,
  neighbour,
  driverByNumber,
}: {
  label: string;
  neighbour: PitRejoinNeighbour | null;
  driverByNumber: ReadonlyMap<number, Driver>;
}) {
  if (!neighbour) return null;
  const driver = driverByNumber.get(neighbour.driverNumber);
  return (
    <div className="flex items-center justify-between gap-2 text-[9px]">
      <span className="text-muted uppercase tracking-[0.12em]">{label}</span>
      <span className="font-mono tabular-nums text-white">
        {driver?.name_acronym ?? `#${neighbour.driverNumber}`}{" "}
        <span className="text-muted">{neighbour.gapS.toFixed(1)}s</span>
      </span>
    </div>
  );
}

/** "If they pit now" summary for the focused driver. */
export function PitRejoinPanel({
  projection,
  lossS,
  condition,
  color,
  background,
  driverByNumber,
}: {
  projection: PitRejoinProjection;
  lossS: number;
  condition: PitLossCondition;
  color: string;
  background: string;
  driverByNumber: ReadonlyMap<number, Driver>;
}) {
  return (
    <div
      className="pointer-events-none flex flex-col gap-0.5 px-2 py-1.5"
      style={{
        background,
        backdropFilter: "blur(4px)",
        minWidth: 132,
        border: `1px solid ${color}33`,
      }}
      data-testid="pit-rejoin-panel"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[8px] font-black uppercase tracking-[0.14em] text-muted">
          Pit now
        </span>
        <span
          className="text-[14px] font-black tabular-nums leading-none"
          style={{ color }}
        >
          P{projection.position}
        </span>
      </div>
      <NeighbourRow
        label="Behind"
        neighbour={projection.ahead}
        driverByNumber={driverByNumber}
      />
      <NeighbourRow
        label="Ahead of"
        neighbour={projection.behind}
        driverByNumber={driverByNumber}
      />
      <div className="text-[7px] uppercase tracking-[0.12em] text-muted">
        Loss {lossS.toFixed(1)}s · {CONDITION_LABEL[condition]}
      </div>
    </div>
  );
}
