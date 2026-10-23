import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CatchupSummary as CatchupSummaryData } from "@/hooks/useCatchupSummary";
import { FastForward, Play, RotateCcw, Square, X } from "lucide-react";
import type { Driver } from "@/api/types";
import type {
  OvertakePayload,
  FastestLapPayload,
  FlagPayload,
  PitPayload,
  RadioPayload,
  ToastEvent,
  ToastKind,
  UndercutPayload,
} from "@/timeline/events";
import { CATCHUP_REPLAY_LEAD_MS } from "@/constants";
import { teamColor } from "@/utils/color";
import { formatPitDuration } from "@/utils/pit";
import { formatBattleGain, pitBattleHeadline } from "@/utils/undercut";
import { useSettings } from "@/stores/settings";
import { toSafeExternalUrl } from "@/utils/url";
import { RadioAudio } from "@/components/RadioAudio";
import { TyreChange } from "@/components/TyreChange/TyreChange";
import { useAudioProgress } from "@/hooks/useAudioProgress";

interface Props {
  summary: CatchupSummaryData;
  drivers: Driver[];
  onDismiss: () => void;
  /** Seek the playhead (session ms). Without it, timestamps are plain text. */
  onJumpToSessionTime?: (sessionTimeMs: number) => void;
}

type DriverMap = Map<number, Driver>;

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m} min`;
}

function fmtRaceTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtLapTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

function eventLap(ev: ToastEvent): number | null {
  const lap = (ev.payload as { lapNumber?: number | null }).lapNumber;
  return typeof lap === "number" ? lap : null;
}

/** "Lap 12–18", "Lap 12", or null when no skipped event carries a lap. */
function lapRangeLabel(events: ToastEvent[]): string | null {
  const laps = events.map(eventLap).filter((l): l is number => l !== null);
  if (laps.length === 0) return null;
  const lo = Math.min(...laps);
  const hi = Math.max(...laps);
  return lo === hi ? `Lap ${lo}` : `Lap ${lo}–${hi}`;
}

// ─── Kind styling ─────────────────────────────────────────────────────────────

interface KindStyle {
  color: string;
  /** Badge text colour on `color`. */
  text: string;
  badge: string | null;
  mkChipLabel: (n: number) => string;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n > 1 ? many : one}`;

// Order is the chip order.
const KIND_STYLES: Record<ToastKind, KindStyle> = {
  pit: {
    color: "#3d78ff",
    text: "#fff",
    badge: "PIT",
    mkChipLabel: (n) => plural(n, "pit stop"),
  },
  flag: {
    color: "#f5a623",
    text: "#000",
    badge: null, // per-flag colour + label
    mkChipLabel: (n) => plural(n, "flag"),
  },
  penalty: {
    color: "#e8002d",
    text: "#fff",
    badge: "PENALTY",
    mkChipLabel: (n) => plural(n, "penalty", "penalties"),
  },
  overtake: {
    color: "#22c55e",
    text: "#000",
    badge: null,
    mkChipLabel: (n) => plural(n, "overtake"),
  },
  fastest_lap: {
    color: "#9b59f5",
    text: "#fff",
    badge: "FASTEST",
    mkChipLabel: (n) => plural(n, "fastest lap"),
  },
  undercut: {
    color: "#14b8a6",
    text: "#000",
    badge: null,
    mkChipLabel: (n) => plural(n, "undercut"),
  },
  investigation: {
    color: "#f5a623",
    text: "#000",
    badge: "INVESTIGATION",
    mkChipLabel: (n) => plural(n, "investigation"),
  },
  radio: {
    color: "#6b6b7a",
    text: "#fff",
    badge: "RADIO",
    mkChipLabel: (n) => `${n} radio`,
  },
};

const KIND_ORDER = Object.keys(KIND_STYLES) as ToastKind[];

const FLAG_COLORS: Record<string, string> = {
  RED: "#e8002d",
  SAFETY_CAR: "#f5a623",
  VIRTUAL_SC: "#f5a623",
  VIRTUAL_SAFETY_CAR: "#f5a623",
  YELLOW: "#f5d400",
  DOUBLE_YELLOW: "#f5d400",
  CHEQUERED: "#ffffff",
  BLUE: "#3d78ff",
};

const DARK_FLAG_TEXT = new Set(["YELLOW", "DOUBLE_YELLOW", "CHEQUERED"]);

function flagBadge(flag: string) {
  return {
    label: flag.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    color: FLAG_COLORS[flag] ?? "#636369",
    text: DARK_FLAG_TEXT.has(flag) ? "#000" : "#fff",
  };
}

// ─── Row building blocks ──────────────────────────────────────────────────────

function Badge({
  label,
  color,
  text,
}: Readonly<{ label: string; color: string; text: string }>) {
  return (
    <span
      className="text-[8px] font-black px-1 py-0.5 uppercase tracking-widest shrink-0"
      style={{ backgroundColor: color, color: text }}
    >
      {label}
    </span>
  );
}

function DriverTag({
  driver,
  driverNumber,
  showName = true,
}: Readonly<{ driver?: Driver; driverNumber: number; showName?: boolean }>) {
  return (
    <>
      <span
        className="text-[12px] font-black"
        style={{ color: teamColor(driver?.team_colour) }}
      >
        {driver?.name_acronym ?? driverNumber}
      </span>
      {showName && driver?.full_name && (
        <span className="text-[10px] text-muted truncate">
          {driver.full_name}
        </span>
      )}
    </>
  );
}

function LapTag({ lap }: Readonly<{ lap: number | null | undefined }>) {
  if (typeof lap !== "number") return null;
  return <span className="text-[9px] text-muted font-mono">Lap {lap}</span>;
}

function EventTime({
  ms,
  onJump,
}: Readonly<{ ms: number; onJump?: (ms: number) => void }>) {
  const label = fmtRaceTime(ms);
  if (!onJump) {
    return (
      <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onJump(ms)}
      className="group/time -my-0.5 -mr-1 flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] font-mono tabular-nums text-muted transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-f1red"
      title="Replay from here"
      aria-label={`Replay from ${label}`}
    >
      <RotateCcw
        aria-hidden="true"
        className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/row:opacity-60 group-hover/time:opacity-100 group-focus-visible/time:opacity-100"
      />
      {label}
    </button>
  );
}

/** Shared row chrome: accent border, headline left, time (+ action) right, detail below. */
function EventRow({
  ev,
  accent,
  headline,
  detail,
  action,
  onJump,
  children,
}: Readonly<{
  ev: ToastEvent;
  accent: string;
  headline: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  onJump?: (ms: number) => void;
  children?: ReactNode;
}>) {
  return (
    <div
      className="group/row px-3 py-2 border-l-2"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">{headline}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          <EventTime ms={ev.ms} onJump={onJump} />
          {action}
        </div>
      </div>
      {detail && <div className="mt-0.5">{detail}</div>}
      {children}
    </div>
  );
}

// ─── Per-kind rows ────────────────────────────────────────────────────────────

interface RowProps {
  ev: ToastEvent;
  driverMap: DriverMap;
  playingUrl: string | null;
  onToggleRadio: (url: string) => void;
  onJump?: (ms: number) => void;
}

function CatchupEventRow(props: Readonly<RowProps>) {
  const { ev, driverMap, onJump } = props;
  const style = KIND_STYLES[ev.kind];

  switch (ev.kind) {
    case "fastest_lap": {
      const p = ev.payload as FastestLapPayload;
      return (
        <EventRow
          ev={ev}
          accent={style.color}
          onJump={onJump}
          headline={
            <>
              <Badge
                label={style.badge!}
                color={style.color}
                text={style.text}
              />
              <DriverTag
                driver={driverMap.get(p.driverNumber)}
                driverNumber={p.driverNumber}
              />
            </>
          }
          detail={
            <div className="flex items-center gap-2">
              <LapTag lap={p.lapNumber} />
              <span
                className="text-[10px] font-mono tabular-nums font-bold"
                style={{ color: style.color }}
              >
                {fmtLapTime(p.lapTime)}
              </span>
            </div>
          }
        />
      );
    }

    case "flag":
    case "penalty":
    case "investigation": {
      const p = ev.payload as FlagPayload;
      const badge =
        ev.kind === "flag"
          ? flagBadge(p.flag)
          : { label: style.badge!, color: style.color, text: style.text };
      return (
        <EventRow
          ev={ev}
          accent={badge.color}
          onJump={onJump}
          headline={<Badge {...badge} />}
          detail={
            <>
              <span className="text-[10px] text-white/70 block">
                {p.message}
              </span>
              <LapTag lap={p.lapNumber} />
            </>
          }
        />
      );
    }

    case "overtake": {
      const p = ev.payload as OvertakePayload;
      const overtaken = driverMap.get(p.overtaken);
      return (
        <EventRow
          ev={ev}
          accent={style.color}
          onJump={onJump}
          headline={
            <>
              <DriverTag
                driver={driverMap.get(p.overtaking)}
                driverNumber={p.overtaking}
                showName={false}
              />
              <span className="text-[9px] text-muted">▸</span>
              <span
                className="text-[11px] font-bold"
                style={{ color: teamColor(overtaken?.team_colour) }}
              >
                {overtaken?.name_acronym ?? p.overtaken}
              </span>
              {p.position && (
                <span className="text-[9px] font-mono text-muted">
                  P{p.position}
                </span>
              )}
            </>
          }
        />
      );
    }

    case "undercut": {
      const p = ev.payload as UndercutPayload;
      return (
        <EventRow
          ev={ev}
          accent={style.color}
          onJump={onJump}
          headline={
            <>
              <DriverTag
                driver={driverMap.get(p.attacker)}
                driverNumber={p.attacker}
                showName={false}
              />
              <span className="text-[10px] font-bold text-white/80">
                {pitBattleHeadline(p)}
              </span>
              <span className="text-[9px] text-muted">vs</span>
              <DriverTag
                driver={driverMap.get(p.defender)}
                driverNumber={p.defender}
                showName={false}
              />
            </>
          }
          detail={
            <div className="flex items-center gap-2">
              <LapTag lap={p.firstStopLap} />
              {p.attackerGainS !== null && (
                <span className="text-[9px] font-mono tabular-nums text-muted">
                  {formatBattleGain(p.attackerGainS)}
                </span>
              )}
            </div>
          }
        />
      );
    }

    case "pit": {
      const p = ev.payload as PitPayload;
      const hasLap = typeof p.lapNumber === "number";
      const hasDuration = typeof p.pitDuration === "number";
      const hasTyres = Boolean(p.tyreOff || p.tyreOn);
      return (
        <EventRow
          ev={ev}
          accent={style.color}
          onJump={onJump}
          headline={
            <>
              <Badge
                label={style.badge!}
                color={style.color}
                text={style.text}
              />
              <DriverTag
                driver={driverMap.get(p.driverNumber)}
                driverNumber={p.driverNumber}
              />
            </>
          }
          detail={
            (hasLap || hasDuration || hasTyres) && (
              <div className="flex items-center gap-2">
                <LapTag lap={p.lapNumber} />
                {hasDuration && (
                  <span className="text-[9px] font-mono tabular-nums text-white/70">
                    {formatPitDuration(p.pitDuration!) ?? "--:--"} stop
                  </span>
                )}
                {hasTyres && (
                  <TyreChange off={p.tyreOff} on={p.tyreOn} compact />
                )}
              </div>
            )
          }
        />
      );
    }

    case "radio":
      return <CatchupRadioRow {...props} />;

    default:
      return null;
  }
}

function CatchupRadioRow({
  ev,
  driverMap,
  playingUrl,
  onToggleRadio,
  onJump,
}: Readonly<RowProps>) {
  const style = KIND_STYLES.radio;
  const p = ev.payload as RadioPayload;
  const recordingUrl = toSafeExternalUrl(p.recordingUrl);
  const hasAudio = Boolean(recordingUrl);
  const isPlaying = recordingUrl !== null && playingUrl === recordingUrl;
  const { progress, audioRef, onTimeUpdate } = useAudioProgress(isPlaying);

  return (
    <EventRow
      ev={ev}
      accent={style.color}
      onJump={onJump}
      headline={
        <>
          <Badge label={style.badge!} color={style.color} text={style.text} />
          <DriverTag
            driver={driverMap.get(p.driverNumber)}
            driverNumber={p.driverNumber}
          />
        </>
      }
      action={
        <button
          onClick={() => recordingUrl && onToggleRadio(recordingUrl)}
          disabled={!hasAudio}
          aria-label={isPlaying ? "Stop" : "Play"}
          className={[
            "relative flex h-6 min-w-[64px] items-center justify-center gap-1 overflow-hidden rounded px-2 text-[9px] font-black uppercase tracking-widest transition-colors",
            isPlaying
              ? "bg-track text-white"
              : "bg-panel text-muted hover:text-white hover:bg-track",
            !hasAudio ? "opacity-30 cursor-not-allowed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {isPlaying && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-f1red transition-[width] duration-150 ease-linear"
              style={{ width: `${progress * 100}%` }}
              data-progress={Math.round(progress * 100)}
            />
          )}
          <span className="relative flex items-center gap-1">
            {isPlaying ? (
              <>
                <Square size={11} strokeWidth={2.4} aria-hidden="true" /> Stop
              </>
            ) : (
              <>
                <Play size={11} strokeWidth={2.4} aria-hidden="true" /> Play
              </>
            )}
          </span>
        </button>
      }
      detail={typeof p.lapNumber === "number" && <LapTag lap={p.lapNumber} />}
    >
      {isPlaying && recordingUrl && (
        <RadioAudio
          key={recordingUrl}
          audioRef={audioRef}
          src={recordingUrl}
          onTimeUpdate={onTimeUpdate}
          onEnded={() => onToggleRadio(recordingUrl)}
          onError={() => onToggleRadio(recordingUrl)}
        />
      )}
    </EventRow>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function CatchupSummary({
  summary,
  drivers,
  onDismiss,
  onJumpToSessionTime,
}: Props) {
  const defaultFilters = useSettings((s) => s.catchupSummaryDefaultFilters);
  const driverMap: DriverMap = new Map(
    drivers.map((d) => [d.driver_number, d]),
  );
  const duration = summary.toMs - summary.fromMs;
  const lapRange = lapRangeLabel(summary.events);

  const counts: Partial<Record<ToastKind, number>> = {};
  for (const ev of summary.events) {
    counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
  }
  const presentKinds = KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0);

  // Seeded from the saved default; kinds missing from it start hidden.
  const [activeKinds, setActiveKinds] = useState<Set<ToastKind>>(
    () =>
      new Set(
        (defaultFilters.length > 0
          ? defaultFilters
          : presentKinds) as ToastKind[],
      ),
  );
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  function toggleRadio(url: string) {
    setPlayingUrl((prev) => (prev === url ? null : url));
  }

  function toggleKind(kind: ToastKind) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        // Keep at least one kind visible
        if (next.size === 1) return prev;
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  const jump = onJumpToSessionTime
    ? (ms: number) => {
        setPlayingUrl(null);
        onJumpToSessionTime(Math.max(0, ms - CATCHUP_REPLAY_LEAD_MS));
        // The modal covers the map, so get out of the way of the replay.
        onDismiss();
      }
    : undefined;

  const visibleEvents = summary.events.filter((ev) => activeKinds.has(ev.kind));

  // Portalled: the route shell's enter animation leaves a transform, which
  // would make it the containing block for `fixed` — on phones (where the
  // page scrolls) the dialog then centres on the whole page, off screen.
  const dialog = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      data-testid="catchup-backdrop"
    >
      <div
        className="bg-surface border border-panel shadow-2xl overflow-hidden max-h-[70dvh] w-[min(380px,92vw)] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="While you were away"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-track border-b border-panel">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/80 flex items-center gap-1">
            <FastForward size={11} strokeWidth={2.4} aria-hidden="true" />
            While you were away
          </span>
          <span className="text-[10px] font-mono text-muted ml-1 truncate">
            {lapRange ? `${lapRange} · ` : ""}
            {fmtDuration(duration)}
          </span>
          <button
            onClick={onDismiss}
            className="ml-auto -mr-1 rounded p-0.5 text-muted hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            aria-label="Dismiss"
          >
            <X size={13} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {/* Filter chips */}
          {presentKinds.length > 0 && (
            <div className="px-3 py-2 border-b border-panel flex flex-wrap gap-1.5">
              {presentKinds.map((kind) => {
                const { color, mkChipLabel } = KIND_STYLES[kind];
                const isActive = activeKinds.has(kind);
                return (
                  <button
                    key={kind}
                    onClick={() => toggleKind(kind)}
                    className={[
                      "text-[10px] font-bold px-2 py-0.5 rounded-sm border transition-all",
                      "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                      isActive
                        ? "border-transparent text-black"
                        : "border-panel text-muted bg-transparent hover:text-white",
                    ].join(" ")}
                    style={
                      isActive
                        ? { backgroundColor: color, borderColor: color }
                        : {}
                    }
                    aria-pressed={isActive}
                  >
                    {mkChipLabel(counts[kind]!)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Event list */}
          {visibleEvents.length > 0 ? (
            <div className="divide-y divide-panel">
              {visibleEvents.map((ev) => (
                <CatchupEventRow
                  key={ev.id}
                  ev={ev}
                  driverMap={driverMap}
                  playingUrl={playingUrl}
                  onToggleRadio={toggleRadio}
                  onJump={jump}
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted px-3 py-3 text-center">
              No events match the selected filters
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-muted hover:text-white border-t border-panel transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
