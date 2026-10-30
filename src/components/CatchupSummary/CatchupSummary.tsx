import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { CatchupSummary as CatchupSummaryData } from "@/hooks/useCatchupSummary";
import { Play, Square } from "lucide-react";
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
import { formatPitDuration } from "@/utils/pit";
import { formatBattleGain, pitBattleHeadline } from "@/utils/undercut";
import { useSettings } from "@/stores/settings";
import { toSafeExternalUrl } from "@/utils/url";
import { RadioAudio } from "@/components/RadioAudio";
import { DialogHeader } from "@/components/DialogHeader";
import { Chip } from "@/components/SettingsModal/SettingsPrimitives";
import { TyreChange } from "@/components/TyreChange/TyreChange";
import {
  COMMENTARY_BUTTON_CLASS,
  formatSessionElapsedTime,
} from "@/components/CommentaryPanels/commentaryList";
import {
  CommentaryDriver,
  CommentaryRow,
  type CommentaryBadge,
} from "@/components/CommentaryPanels/CommentaryRow";
import { useAudioProgress } from "@/hooks/useAudioProgress";
import { TOKEN_HEX } from "@/designTokens";
import { buttonClass } from "@/components/Button/buttonClass";

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
    color: TOKEN_HEX.orange,
    text: "#000",
    badge: null, // per-flag colour + label
    mkChipLabel: (n) => plural(n, "flag"),
  },
  penalty: {
    color: TOKEN_HEX.f1red,
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
    color: TOKEN_HEX.purple,
    text: "#fff",
    badge: "FASTEST",
    mkChipLabel: (n) => plural(n, "fastest lap"),
  },
  undercut: {
    color: TOKEN_HEX.teal,
    text: "#000",
    badge: null,
    mkChipLabel: (n) => plural(n, "undercut"),
  },
  investigation: {
    color: TOKEN_HEX.orange,
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
  RED: TOKEN_HEX.f1red,
  SAFETY_CAR: TOKEN_HEX.orange,
  VIRTUAL_SC: TOKEN_HEX.orange,
  VIRTUAL_SAFETY_CAR: TOKEN_HEX.orange,
  YELLOW: TOKEN_HEX.yellow,
  DOUBLE_YELLOW: TOKEN_HEX.yellow,
  CHEQUERED: "#ffffff",
  BLUE: "#3d78ff",
};

const DARK_FLAG_TEXT = new Set(["YELLOW", "DOUBLE_YELLOW", "CHEQUERED"]);

function flagBadge(flag: string) {
  return {
    label: flag.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    color: FLAG_COLORS[flag] ?? TOKEN_HEX.faint,
    text: DARK_FLAG_TEXT.has(flag) ? "#000" : "#fff",
  };
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

function LapTag({ lap }: Readonly<{ lap: number | null | undefined }>) {
  if (typeof lap !== "number") return null;
  return <span>Lap {lap}</span>;
}

function kindBadge(style: KindStyle, label = style.badge ?? ""): CommentaryBadge {
  return { label, style: { backgroundColor: style.color, color: style.text } };
}

interface RowProps {
  ev: ToastEvent;
  driverMap: DriverMap;
  playingUrl: string | null;
  onToggleRadio: (url: string) => void;
  onJump?: (ms: number) => void;
}

/** Shared row props: time, replay button wording and accent. */
function rowBase(ev: ToastEvent, accent: string, onJump?: (ms: number) => void) {
  return {
    ms: ev.ms,
    accent,
    onJump,
    jumpName: `Replay from ${formatSessionElapsedTime(Math.max(0, ev.ms))}`,
  };
}

function CatchupEventRow(props: Readonly<RowProps>) {
  const { ev, driverMap, onJump } = props;
  const style = KIND_STYLES[ev.kind];

  switch (ev.kind) {
    case "fastest_lap": {
      const p = ev.payload as FastestLapPayload;
      return (
        <CommentaryRow
          {...rowBase(ev, style.color, onJump)}
          badge={kindBadge(style)}
          title={
            <CommentaryDriver
              driver={driverMap.get(p.driverNumber)}
              driverNumber={p.driverNumber}
              showName
            />
          }
          meta={
            <>
              <LapTag lap={p.lapNumber} />
              <span className="font-bold" style={{ color: style.color }}>
                {fmtLapTime(p.lapTime)}
              </span>
            </>
          }
        />
      );
    }

    case "flag":
    case "penalty":
    case "investigation": {
      const p = ev.payload as FlagPayload;
      const flag = ev.kind === "flag" ? flagBadge(p.flag) : null;
      const accent = flag?.color ?? style.color;
      return (
        <CommentaryRow
          {...rowBase(ev, accent, onJump)}
          badge={
            flag
              ? {
                  label: flag.label,
                  style: { backgroundColor: flag.color, color: flag.text },
                }
              : kindBadge(style)
          }
          titleLines="all"
          title={p.message}
          meta={
            typeof p.lapNumber === "number" ? (
              <LapTag lap={p.lapNumber} />
            ) : undefined
          }
        />
      );
    }

    case "overtake": {
      const p = ev.payload as OvertakePayload;
      return (
        <CommentaryRow
          {...rowBase(ev, style.color, onJump)}
          badge={kindBadge(style, "PASS")}
          title={
            <>
              <CommentaryDriver
                driver={driverMap.get(p.overtaking)}
                driverNumber={p.overtaking}
              />{" "}
              <span className="font-normal text-muted">passed</span>{" "}
              <CommentaryDriver
                driver={driverMap.get(p.overtaken)}
                driverNumber={p.overtaken}
              />
            </>
          }
          meta={p.position ? <span>for P{p.position}</span> : undefined}
        />
      );
    }

    case "undercut": {
      const p = ev.payload as UndercutPayload;
      return (
        <CommentaryRow
          {...rowBase(ev, style.color, onJump)}
          badge={kindBadge(style, p.kind === "undercut" ? "UNDERCUT" : "OVERCUT")}
          title={
            <>
              <CommentaryDriver
                driver={driverMap.get(p.attacker)}
                driverNumber={p.attacker}
              />{" "}
              <span className="font-normal text-muted">vs</span>{" "}
              <CommentaryDriver
                driver={driverMap.get(p.defender)}
                driverNumber={p.defender}
              />
            </>
          }
          meta={
            <>
              <span className="text-fg/80">{pitBattleHeadline(p)}</span>
              <LapTag lap={p.firstStopLap} />
              {p.attackerGainS !== null && (
                <span>{formatBattleGain(p.attackerGainS)}</span>
              )}
            </>
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
        <CommentaryRow
          {...rowBase(ev, style.color, onJump)}
          badge={kindBadge(style)}
          title={
            <CommentaryDriver
              driver={driverMap.get(p.driverNumber)}
              driverNumber={p.driverNumber}
              showName
            />
          }
          meta={
            hasLap || hasDuration || hasTyres ? (
              <>
                <LapTag lap={p.lapNumber} />
                {hasDuration && (
                  <span className="text-fg/70">
                    {formatPitDuration(p.pitDuration!) ?? "--:--"} stop
                  </span>
                )}
                {hasTyres && (
                  <TyreChange off={p.tyreOff} on={p.tyreOn} compact />
                )}
              </>
            ) : undefined
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
    <CommentaryRow
      {...rowBase(ev, style.color, onJump)}
      badge={kindBadge(style)}
      title={
        <CommentaryDriver
          driver={driverMap.get(p.driverNumber)}
          driverNumber={p.driverNumber}
          showName
        />
      }
      meta={
        typeof p.lapNumber === "number" ? <LapTag lap={p.lapNumber} /> : undefined
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => recordingUrl && onToggleRadio(recordingUrl)}
            disabled={!hasAudio}
            aria-label={isPlaying ? "Stop" : "Play"}
            className={`${COMMENTARY_BUTTON_CLASS} relative w-[64px] overflow-hidden ${
              isPlaying ? "border-f1red text-fg" : ""
            }`}
          >
            {isPlaying && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-f1red transition-[width] duration-150 ease-linear"
                style={{ width: `${progress * 100}%` }}
                data-progress={Math.round(progress * 100)}
              />
            )}
            <span className="relative flex items-center gap-1.5">
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
        </>
      }
    />
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
  const titleId = useId();

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
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      data-testid="catchup-backdrop"
    >
      <div
        className="flex max-h-[75dvh] w-[min(420px,92vw)] flex-col overflow-hidden border border-panel bg-surface shadow-2xl sm:w-[min(720px,92vw)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <DialogHeader
          eyebrow="Catch-up"
          meta={`${lapRange ? `${lapRange} · ` : ""}${fmtDuration(duration)}`}
          title="While you were away"
          titleId={titleId}
          subtitle={`${summary.events.length} event${summary.events.length === 1 ? "" : "s"} skipped`}
          closeLabel="Dismiss"
          onClose={onDismiss}
        />

        <div className="min-h-0 overflow-y-auto">
          {presentKinds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-panel px-4 py-3 sm:px-5">
              {presentKinds.map((kind) => {
                const { color, mkChipLabel } = KIND_STYLES[kind];
                return (
                  <Chip
                    key={kind}
                    label={mkChipLabel(counts[kind]!)}
                    color={color}
                    active={activeKinds.has(kind)}
                    onToggle={() => toggleKind(kind)}
                  />
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
            <p className="px-4 py-4 text-center font-mono text-caption uppercase tracking-caps text-muted">
              No events match the selected filters
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-panel px-4 py-3 sm:px-5">
          <span className="font-mono text-tiny uppercase tracking-caps text-muted">
            {jump ? "Tap › to replay from there" : "Default filters: Settings → Playback"}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className={buttonClass("primary")}
          >
            Continue watching
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
