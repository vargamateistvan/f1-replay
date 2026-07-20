import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { CatchupSummary as CatchupSummaryData } from "@/hooks/useCatchupSummary";
import { FastForward, Play, Square } from "lucide-react";
import type { Driver } from "@/api/types";
import type {
  OvertakePayload,
  FastestLapPayload,
  FlagPayload,
  PitPayload,
  RadioPayload,
  ToastKind,
} from "@/timeline/events";
import { teamColor } from "@/utils/color";
import { TooltipCard } from "@/components/TooltipCard/TooltipCard";
import { useSettings } from "@/stores/settings";

interface Props {
  summary: CatchupSummaryData;
  drivers: Driver[];
  onDismiss: () => void;
}

const TOOLTIP_TEXT_THRESHOLD = 34;

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

function needsTooltip(text: string): boolean {
  return text.trim().length > TOOLTIP_TEXT_THRESHOLD;
}

function EventText({
  text,
  className,
  tooltipAccentClassName,
}: Readonly<{
  text: string;
  className: string;
  tooltipAccentClassName?: string;
}>) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      const tooltipWidth = Math.min(280, Math.max(200, rect.width));
      const viewportPad = 8;
      const left = Math.min(
        Math.max(viewportPad, rect.left),
        window.innerWidth - tooltipWidth - viewportPad,
      );

      setPosition({
        top: rect.bottom + 8,
        left,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  if (!needsTooltip(text)) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className="relative flex min-w-0 flex-1">
      <span
        ref={anchorRef}
        className={className}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {text}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <TooltipCard
            title="Full event"
            text={text}
            accentClassName={tooltipAccentClassName}
            className="pointer-events-none fixed z-[9999] w-full min-w-[200px] max-w-[280px]"
            style={{ top: position.top, left: position.left }}
          />,
          document.body,
        )}
    </span>
  );
}

// ─── Per-event row renderer ───────────────────────────────────────────────────

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

function CatchupEventRow({
  ev,
  driverMap,
  playingUrl,
  onToggleRadio,
}: {
  ev: import("@/timeline/events").ToastEvent;
  driverMap: Map<number, import("@/api/types").Driver>;
  playingUrl: string | null;
  onToggleRadio: (url: string) => void;
}) {
  if (ev.kind === "fastest_lap") {
    const p = ev.payload as FastestLapPayload;
    const d = driverMap.get(p.driverNumber);
    const driverColor = teamColor(d?.team_colour);
    return (
      <div
        className="px-3 py-2 border-l-2"
        style={{ borderLeftColor: "#9b59f5" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black px-1 py-0.5 bg-[#9b59f5] text-white uppercase tracking-widest shrink-0">
              FASTEST
            </span>
            <span
              className="text-[12px] font-black"
              style={{ color: driverColor }}
            >
              {d?.name_acronym ?? p.driverNumber}
            </span>
            {d?.full_name && (
              <span className="text-[10px] text-white/50">{d.full_name}</span>
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-white/40 font-mono">
              Lap {p.lapNumber}
            </span>
          )}
          <span
            className="text-[10px] font-mono tabular-nums font-bold"
            style={{ color: "#9b59f5" }}
          >
            {fmtLapTime(p.lapTime)}
          </span>
        </div>
      </div>
    );
  }

  if (ev.kind === "flag") {
    const p = ev.payload as FlagPayload;
    const color = FLAG_COLORS[p.flag] ?? "#636369";
    const flagLabel = p.flag
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return (
      <div className="px-3 py-2 border-l-2" style={{ borderLeftColor: color }}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[8px] font-black px-1 py-0.5 uppercase tracking-widest shrink-0"
            style={{
              backgroundColor: color,
              color: DARK_FLAG_TEXT.has(p.flag) ? "#000" : "#fff",
            }}
          >
            {flagLabel}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="mt-0.5">
          <EventText
            text={p.message}
            className="text-[10px] text-white/70 block"
            tooltipAccentClassName=""
          />
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-white/40 font-mono">
              Lap {p.lapNumber}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (ev.kind === "penalty") {
    const p = ev.payload as FlagPayload;
    return (
      <div className="px-3 py-2 border-l-2 border-l-[#e8002d]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] font-black px-1 py-0.5 bg-[#e8002d] text-white uppercase tracking-widest shrink-0">
            PENALTY
          </span>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="mt-0.5">
          <EventText
            text={p.message}
            className="text-[10px] text-white/70 block"
            tooltipAccentClassName="bg-[#e8002d]"
          />
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-white/40 font-mono">
              Lap {p.lapNumber}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (ev.kind === "investigation") {
    const p = ev.payload as FlagPayload;
    return (
      <div className="px-3 py-2 border-l-2 border-l-[#f5a623]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] font-black px-1 py-0.5 bg-[#f5a623] text-black uppercase tracking-widest shrink-0">
            INVESTIGATION
          </span>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="mt-0.5">
          <EventText
            text={p.message}
            className="text-[10px] text-white/70 block"
            tooltipAccentClassName="bg-[#f5a623]"
          />
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-white/40 font-mono">
              Lap {p.lapNumber}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (ev.kind === "overtake") {
    const p = ev.payload as OvertakePayload;
    const overtaking = driverMap.get(p.overtaking);
    const overtaken = driverMap.get(p.overtaken);
    const colorA = teamColor(overtaking?.team_colour);
    const colorB = teamColor(overtaken?.team_colour);
    return (
      <div className="px-3 py-2 border-l-2 border-l-[#22c55e]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-black" style={{ color: colorA }}>
              {overtaking?.name_acronym ?? p.overtaking}
            </span>
            <span className="text-[9px] text-white/30">▸</span>
            <span className="text-[11px] font-bold" style={{ color: colorB }}>
              {overtaken?.name_acronym ?? p.overtaken}
            </span>
            {p.position && (
              <span className="text-[9px] font-mono text-white/50">
                P{p.position}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
      </div>
    );
  }

  if (ev.kind === "pit") {
    const p = ev.payload as PitPayload;
    const d = driverMap.get(p.driverNumber);
    const driverColor = teamColor(d?.team_colour);
    return (
      <div className="px-3 py-2 border-l-2 border-l-[#3d78ff]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black px-1 py-0.5 bg-[#3d78ff] text-white uppercase tracking-widest shrink-0">
              PIT
            </span>
            <span
              className="text-[12px] font-black"
              style={{ color: driverColor }}
            >
              {d?.name_acronym ?? p.driverNumber}
            </span>
            {d?.full_name && (
              <span className="text-[10px] text-white/50">{d.full_name}</span>
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-white/40 font-mono">
              Lap {p.lapNumber}
            </span>
          )}
          {typeof p.pitDuration === "number" && (
            <span className="text-[9px] font-mono tabular-nums text-white/60">
              {p.pitDuration.toFixed(1)}s stop
            </span>
          )}
        </div>
      </div>
    );
  }

  if (ev.kind === "radio") {
    const p = ev.payload as RadioPayload;
    const d = driverMap.get(p.driverNumber);
    const driverColor = teamColor(d?.team_colour);
    const hasAudio = Boolean(
      p.recordingUrl && p.recordingUrl.trim().length > 0,
    );
    const isPlaying = playingUrl === p.recordingUrl;
    return (
      <div className="px-3 py-2 border-l-2 border-l-[#6b6b7a]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black px-1 py-0.5 bg-[#6b6b7a] text-white uppercase tracking-widest shrink-0">
              RADIO
            </span>
            <span
              className="text-[12px] font-black"
              style={{ color: driverColor }}
            >
              {d?.name_acronym ?? p.driverNumber}
            </span>
            {d?.full_name && (
              <span className="text-[10px] text-white/50">{d.full_name}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono tabular-nums text-white/40">
              {fmtRaceTime(ev.ms)}
            </span>
            <button
              onClick={() => hasAudio && onToggleRadio(p.recordingUrl)}
              disabled={!hasAudio}
              aria-label={isPlaying ? "Stop" : "Play"}
              className={[
                "flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                isPlaying
                  ? "bg-f1red text-white"
                  : "bg-[#2a2a35] text-muted hover:text-white",
                !hasAudio ? "opacity-30 cursor-not-allowed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isPlaying ? (
                <>
                  <Square size={9} strokeWidth={2.4} aria-hidden="true" /> Stop
                </>
              ) : (
                <>
                  <Play size={9} strokeWidth={2.4} aria-hidden="true" /> Play
                </>
              )}
            </button>
          </div>
        </div>
        {isPlaying && hasAudio && (
          <audio
            key={p.recordingUrl}
            src={p.recordingUrl}
            autoPlay
            onEnded={() => onToggleRadio(p.recordingUrl)}
            onError={() => onToggleRadio(p.recordingUrl)}
            className="hidden"
          >
            <track kind="captions" />
          </audio>
        )}
      </div>
    );
  }

  return null;
}

interface FilterChip {
  kind: ToastKind;
  label: string;
  count: number;
  color: string;
}

type ChipConfig = {
  kind: ToastKind;
  mkLabel: (n: number) => string;
  color: string;
};

const CHIP_CONFIGS: ChipConfig[] = [
  {
    kind: "pit",
    mkLabel: (n) => `${n} pit stop${n > 1 ? "s" : ""}`,
    color: "#3d78ff",
  },
  {
    kind: "flag",
    mkLabel: (n) => `${n} flag${n > 1 ? "s" : ""}`,
    color: "#f5a623",
  },
  {
    kind: "penalty",
    mkLabel: (n) => `${n} ${n > 1 ? "penalties" : "penalty"}`,
    color: "#e8002d",
  },
  {
    kind: "overtake",
    mkLabel: (n) => `${n} overtake${n > 1 ? "s" : ""}`,
    color: "#22c55e",
  },
  {
    kind: "fastest_lap",
    mkLabel: (n) => `${n} fastest lap${n > 1 ? "s" : ""}`,
    color: "#9b59f5",
  },
  {
    kind: "investigation",
    mkLabel: (n) => `${n} ${n > 1 ? "investigations" : "investigation"}`,
    color: "#f5a623",
  },
  { kind: "radio", mkLabel: (n) => `${n} radio`, color: "#6b6b7a" },
];

export function CatchupSummary({ summary, drivers, onDismiss }: Props) {
  const defaultFilters = useSettings((s) => s.catchupSummaryDefaultFilters);
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const duration = summary.toMs - summary.fromMs;

  // Group events by kind for the headline counts
  const counts: Partial<Record<ToastKind, number>> = {};
  for (const ev of summary.events) {
    counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
  }

  // Build filter chips (only for kinds that actually appear)
  const allChips: FilterChip[] = CHIP_CONFIGS.filter(
    (c) => (counts[c.kind] ?? 0) > 0,
  ).map((c) => ({
    kind: c.kind,
    label: c.mkLabel(counts[c.kind]!),
    count: counts[c.kind]!,
    color: c.color,
  }));

  // Which kinds are currently visible — seeded from the user's saved default
  const [activeKinds, setActiveKinds] = useState<Set<ToastKind>>(
    () =>
      new Set(
        (defaultFilters.length > 0
          ? defaultFilters
          : allChips.map((c) => c.kind)) as ToastKind[],
      ),
  );

  // Radio playback state
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  function toggleRadio(url: string) {
    setPlayingUrl((prev) => (prev === url ? null : url));
  }

  function toggleKind(kind: ToastKind) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        // Don't allow deselecting all — keep at least one
        if (next.size === 1) return prev;
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  // Filter events based on active kinds
  const visibleEvents = summary.events.filter((ev) => activeKinds.has(ev.kind));

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[min(380px,92vw)]">
      <div className="bg-[#1f1f27] border border-[#38383f] shadow-2xl overflow-hidden max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#15151e] border-b border-[#38383f]">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/70 flex items-center gap-1">
            <FastForward size={11} strokeWidth={2.4} aria-hidden="true" />
            While you were away
          </span>
          <span className="text-[10px] font-mono text-muted ml-1">
            ({fmtDuration(duration)})
          </span>
          <button
            onClick={onDismiss}
            className="ml-auto text-muted hover:text-white text-xs"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {/* Filter chips */}
          {allChips.length > 0 && (
            <div className="px-3 py-2 border-b border-[#2a2a35] flex flex-wrap gap-1.5">
              {allChips.map((chip) => {
                const isActive = activeKinds.has(chip.kind);
                return (
                  <button
                    key={chip.kind}
                    onClick={() => toggleKind(chip.kind)}
                    className={[
                      "text-[10px] font-bold px-2 py-0.5 rounded-sm border transition-all",
                      "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                      isActive
                        ? "border-transparent text-black"
                        : "border-[#38383f] text-white/40 bg-transparent",
                    ].join(" ")}
                    style={
                      isActive
                        ? {
                            backgroundColor: chip.color,
                            borderColor: chip.color,
                          }
                        : {}
                    }
                    aria-pressed={isActive}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Event list */}
          {visibleEvents.length > 0 ? (
            <div className="divide-y divide-[#2a2a35]">
              {visibleEvents.map((ev) => (
                <CatchupEventRow
                  key={ev.id}
                  ev={ev}
                  driverMap={driverMap}
                  playingUrl={playingUrl}
                  onToggleRadio={toggleRadio}
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-white/30 px-3 py-3 text-center">
              No events match the selected filters
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-muted hover:text-white border-t border-[#2a2a35] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
