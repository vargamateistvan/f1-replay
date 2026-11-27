import { useMemo, useState, type ReactNode } from "react";
import type { Driver, Lap, Overtake, Pit, RaceControl, Stint, TeamRadio } from "@/api/types";
import { CommentaryDriver, CommentaryRow } from "@/components/CommentaryPanels/CommentaryRow";
import {
  COMMENTARY_EMPTY_CLASS,
  COMMENTARY_GROUP_CLASS,
  COMMENTARY_GROUP_HEADER_CLASS,
  COMMENTARY_GROUP_ITEMS_CLASS,
  commentaryGroupLabel,
} from "@/components/CommentaryPanels/commentaryList";
import { raceControlEventAccent, raceControlEventBadge } from "@/components/RaceControl/eventStyle";
import { PitBattleLine, PitFeed } from "@/components/Pits/PitFeed";
import { RadioPlayback } from "@/components/RadioAudio";
import { Chip } from "@/components/UI";
import { useSettings } from "@/stores/settings";
import { DRIVER_HISTORY_EVENT_FILTERS } from "@/constants";
import { buildDriverEvents, type DriverEvent } from "@/utils/driverEvents";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";
import { teamColor } from "@/utils/color";
import { toSafeExternalUrl } from "@/utils/url";
import type { PitBattle } from "@/utils/undercut";
import { TimingHistoryPopover } from "./TimingHistoryPopover";

interface Props {
  driverNumber: number;
  drivers: Driver[];
  raceControl: RaceControl[];
  pits: Pit[];
  pitBattles?: PitBattle[];
  stints: Stint[];
  laps: Lap[];
  overtakes: Overtake[];
  radios: TeamRadio[];
  sessionStartMs: number;
  sessionTimeMs: number;
  lapStartCutoffMs?: number;
  onSelectDriver?: (driverNumber: number) => void;
  children: ReactNode;
}

export function DriverEventHistory(props: Props) {
  const enabled = useSettings((s) => s.timingDriverHistoryEnabled);
  const driver = props.drivers.find((entry) => entry.driver_number === props.driverNumber);
  const identity = driver?.name_acronym ?? String(props.driverNumber);
  return (
    <TimingHistoryPopover
      enabled={enabled}
      alignStart
      title="Driver events"
      identity={identity}
      triggerLabel={`Driver ${identity}: show events`}
      dialogLabel={`Events for ${identity}`}
      closeLabel="Close driver events"
      onActivate={() => props.onSelectDriver?.(props.driverNumber)}
      content={<DriverEvents {...props} />}
    >
      {props.children}
    </TimingHistoryPopover>
  );
}

function DriverEvents({
  driverNumber, drivers, raceControl, pits, pitBattles, stints, laps, overtakes,
  radios, sessionStartMs, sessionTimeMs, lapStartCutoffMs,
}: Props) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [failedRadio, setFailedRadio] = useState<string | null>(null);
  const defaultFilters = useSettings((s) => s.timingDriverHistoryDefaultFilters);
  const [activeKinds, setActiveKinds] = useState(
    () => new Set<DriverEvent["kind"]>(defaultFilters),
  );
  const events = useMemo(() => buildDriverEvents({
    driverNumber, raceControl, pits, overtakes, radios, laps, pitBattles, sessionStartMs, sessionTimeMs, lapStartCutoffMs,
  }), [driverNumber, raceControl, pits, overtakes, radios, laps, pitBattles, sessionStartMs, sessionTimeMs, lapStartCutoffMs]);
  const counts: Partial<Record<DriverEvent["kind"], number>> = {};
  for (const event of events) {
    const kind = event.kind === "pit_battle" ? "pit" : event.kind;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const presentFilters = DRIVER_HISTORY_EVENT_FILTERS.filter((filter) => counts[filter.kind]);
  const visibleEvents = useMemo(
    () => events.filter((event) => activeKinds.has(event.kind === "pit_battle" ? "pit" : event.kind)),
    [events, activeKinds],
  );
  const driverMap = useMemo(() => new Map(drivers.map((entry) => [entry.driver_number, entry])), [drivers]);
  const lapGroups = useMemo(() => {
    const lookup = buildLapLookup(
      laps.filter((lap) => lap.driver_number === driverNumber),
      sessionStartMs,
    );
    const groups: { lapNumber: number | null; events: DriverEvent[] }[] = [];
    for (const event of visibleEvents) {
      let lapNumber: number | null;
      switch (event.kind) {
        case "pit":
        case "lap":
          lapNumber = event.entry.lap_number;
          break;
        case "pit_battle":
          lapNumber = event.entry.firstStopLap;
          break;
        case "race_control":
          lapNumber = event.entry.lapNumber ?? lapNumberAtMs(lookup, event.ms);
          break;
        default:
          lapNumber = lapNumberAtMs(lookup, event.ms);
      }
      const current = groups.at(-1);
      if (current && current.lapNumber === lapNumber) {
        current.events.push(event);
      } else {
        groups.push({ lapNumber, events: [event] });
      }
    }
    return groups;
  }, [visibleEvents, laps, driverNumber, sessionStartMs]);
  const color = teamColor(driverMap.get(driverNumber)?.team_colour);
  if (!events.length) return <p className={COMMENTARY_EMPTY_CLASS}>No driver events yet</p>;

  function toggleKind(kind: DriverEvent["kind"]) {
    if (
      activeKinds.has(kind) &&
      presentFilters.filter((filter) => activeKinds.has(filter.kind)).length === 1
    ) return;
    setActiveKinds((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
    if (kind === "radio") setPlaying(null);
  }

  function renderEvent(event: DriverEvent) {
        switch (event.kind) {
          case "race_control": {
            const driver = driverMap.get(event.entry.driverNumber ?? driverNumber);
            return (
              <CommentaryRow
                key={event.id} compact ms={event.ms}
                badge={raceControlEventBadge(event.entry)}
                accent={raceControlEventAccent(event.entry, driver?.team_colour)}
                titleLines="all"
                title={event.entry.description}
                className={event.entry.kind === "penalty" ? "bg-red/[0.08]" : ""}
              />
            );
          }
          case "pit":
            return (
              <PitFeed
                key={event.id} compact showLapHeaders={false}
                entries={[event.entry]} pitBattles={pitBattles}
                stints={stints} drivers={drivers} sessionStartMs={sessionStartMs}
                sessionTimeMs={sessionTimeMs}
              />
            );
          case "pit_battle":
            return (
              <CommentaryRow
                key={event.id} compact ms={event.ms} accent={color}
                badge={{ label: "Pits", className: "bg-teal text-teal-on" }}
                title={event.entry.kind === "undercut" ? "Undercut battle" : "Overcut battle"}
                meta={`Lap ${event.entry.firstStopLap}`}
              >
                <PitBattleLine battle={event.entry} driverByNumber={driverMap} />
              </CommentaryRow>
            );
          case "overtake": {
            const gained = event.entry.overtaking_driver_number === driverNumber;
            const rivalNumber = gained ? event.entry.overtaken_driver_number : event.entry.overtaking_driver_number;
            return (
              <CommentaryRow
                key={event.id} compact ms={event.ms} accent={color}
                badge={{ label: gained ? "Pass" : "Passed", className: gained ? "bg-green text-green-on" : "bg-yellow text-yellow-on" }}
                title={<>{gained ? "Overtook " : "Passed by "}<CommentaryDriver driver={driverMap.get(rivalNumber)} driverNumber={rivalNumber} /></>}
                meta={event.entry.position !== null ? `P${event.entry.position}` : undefined}
              />
            );
          }
          case "lap":
            return (
              <CommentaryRow
                key={event.id} compact ms={event.ms} accent={color}
                badge={{ label: event.fastest ? "Fastest" : "PB", className: event.fastest ? "bg-purple text-purple-on" : "bg-green text-green-on" }}
                title={event.fastest ? "Session fastest lap" : "Personal best lap"}
                meta={`Lap ${event.entry.lap_number} · ${formatLapTime(event.lapTime)}`}
              />
            );
          case "radio": {
            const url = toSafeExternalUrl(event.entry.recording_url);
            const isPlaying = playing === event.id;
            return (
              <CommentaryRow
                key={event.id} compact ms={event.ms} accent={color}
                badge={{ label: "Radio", className: "bg-blue text-blue-on" }}
                title="Team radio"
                meta={!url || failedRadio === event.id ? "Recording unavailable" : undefined}
                actions={
                  <RadioPlayback
                    src={url}
                    playing={isPlaying}
                    ariaLabel={`${isPlaying ? "Stop" : "Play"} team radio at ${event.entry.date}`}
                    onToggle={() => {
                      setFailedRadio(null);
                      setPlaying(isPlaying ? null : event.id);
                    }}
                    onEnded={() => setPlaying(null)}
                    onError={() => {
                      setFailedRadio(event.id);
                      setPlaying(null);
                    }}
                  />
                }
              />
            );
          }

        }
  }

  return (
    <div className="space-y-2 px-2 pb-2 normal-case tracking-normal">
      <div
        role="group"
        aria-label="Filter driver events"
        className="flex flex-wrap gap-1.5 border-b border-panel pb-2"
      >
        {presentFilters.map((filter) => (
          <Chip
            key={filter.kind}
            label={`${filter.label} (${counts[filter.kind]})`}
            tone={filter.tone}
            active={activeKinds.has(filter.kind)}
            onToggle={() => toggleKind(filter.kind)}
          />
        ))}
      </div>
      {visibleEvents.length === 0 && (
        <p className={COMMENTARY_EMPTY_CLASS}>No events match the selected filters</p>
      )}
      {lapGroups.map((group, index) => (
        <div key={`${group.lapNumber ?? "session"}-${index}`} className={COMMENTARY_GROUP_CLASS}>
          <div className={COMMENTARY_GROUP_HEADER_CLASS}>
            {commentaryGroupLabel(undefined, group.lapNumber)}
          </div>
          <div className={COMMENTARY_GROUP_ITEMS_CLASS}>
            {group.events.map(renderEvent)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60_000);
  const wholeSeconds = Math.floor(totalMs / 1000) % 60;
  const milliseconds = totalMs % 1000;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}:${String(milliseconds).padStart(3, "0")}`;
}
