import type { Driver } from "@/api/types";
import type { PitLoss } from "@/data/circuitGeometryTypes";
import { parsePitLoss } from "@/utils/pitRejoin";
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

const CONDITION_CLASS: Record<PitLossCondition, string> = {
  normal: "border-green-line bg-green-tint text-green-fg",
  vsc: "border-yellow-line bg-yellow-tint text-yellow-fg",
  sc: "border-orange-line bg-orange-tint text-orange-fg",
};

const CONDITION_TEXT: Record<PitLossCondition, string> = {
  normal: "text-green-fg",
  vsc: "text-yellow-fg",
  sc: "text-orange-fg",
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
    <div className="flex items-center justify-between gap-2 text-caption">
      <span className="text-tiny font-bold uppercase tracking-caps text-muted">{label}</span>
      <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-fg">
        {driver?.name_acronym ?? `#${neighbour.driverNumber}`}{" "}
        <span className="text-muted">{neighbour.gapS.toFixed(1)}s</span>
      </span>
    </div>
  );
}

/** "If they pit now" summary for the focused driver ("Rejoin" while already in the pits). */
export function PitRejoinPanel({
  projection,
  lossS,
  pitLoss,
  condition,
  color,
  driverByNumber,
  inPit = false,
}: {
  projection: PitRejoinProjection;
  lossS: number;
  pitLoss?: PitLoss;
  condition: PitLossCondition;
  color: string;
  driverByNumber: ReadonlyMap<number, Driver>;
  inPit?: boolean;
}) {
  const losses = parsePitLoss(pitLoss);
  return (
    <div
      className="pointer-events-none w-32 overflow-hidden rounded-sm border border-panel border-l-2 bg-surface/80 text-fg shadow-sm backdrop-blur-sm"
      style={{ borderLeftColor: color }}
      data-testid="pit-rejoin-panel"
    >
      <div className="flex items-center justify-between gap-1 border-b border-panel px-1.5 py-0.5">
        <span className="text-caption font-black uppercase tracking-caps">
          {inPit ? "Rejoin" : "Pit now"}
        </span>
        <span
          className="rounded-sm border border-line bg-panel px-1 py-0.5 font-mono text-compact font-black tabular-nums leading-none"
        >
          P{projection.position}
        </span>
      </div>
      {(projection.ahead || projection.behind) && (
        <div className="flex flex-col gap-0.5 px-1.5 py-1">
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
        </div>
      )}
      <div className="grid grid-cols-3 gap-0.5 border-t border-panel bg-sunken/20 px-1 py-1" aria-label="Pit time loss">
        {(["normal", "sc", "vsc"] as const).map((key) => {
          const active = key === condition;
          const seconds = active ? lossS : losses?.[key];
          return (
            <div
              key={key}
              className={`flex flex-col items-center rounded-sm border py-0.5 ${
                active ? CONDITION_CLASS[key] : `border-transparent ${CONDITION_TEXT[key]}`
              }`}
              title={`${CONDITION_LABEL[key]} pit time loss${active ? " (current)" : ""}`}
            >
              <span className="text-tiny font-bold uppercase">{CONDITION_LABEL[key]}</span>
              <span className="font-mono text-caption font-semibold tabular-nums">
                {seconds == null ? "—" : `${seconds.toFixed(1)}s`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
