import { useState } from "react";
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
import { useSettings } from "@/stores/settings";
import { toSafeExternalUrl } from "@/utils/url";
import { FALLBACK_LANGUAGE, type SupportedLanguage } from "@/i18n/language";
import { t } from "@/i18n/translations";

interface Props {
  summary: CatchupSummaryData;
  drivers: Driver[];
  onDismiss: () => void;
}

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
  language,
}: Readonly<{
  ev: import("@/timeline/events").ToastEvent;
  driverMap: Map<number, import("@/api/types").Driver>;
  playingUrl: string | null;
  onToggleRadio: (url: string) => void;
  language: SupportedLanguage;
}>) {
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
              {t(language, "catchupSummary.fastest")}
            </span>
            <span
              className="text-[12px] font-black"
              style={{ color: driverColor }}
            >
              {d?.name_acronym ?? p.driverNumber}
            </span>
            {d?.full_name && (
              <span className="text-[10px] text-muted">{d.full_name}</span>
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-muted font-mono">
              {t(language, "catchupSummary.lapWithNumber", {
                lap: p.lapNumber,
              })}
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
          <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="mt-0.5">
          <span className="text-[10px] text-white/70 block">{p.message}</span>
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-muted font-mono">
              {t(language, "catchupSummary.lapWithNumber", {
                lap: p.lapNumber,
              })}
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
            {t(language, "catchupSummary.penalty")}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="mt-0.5">
          <span className="text-[10px] text-white/70 block">{p.message}</span>
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-muted font-mono">
              {t(language, "catchupSummary.lapWithNumber", {
                lap: p.lapNumber,
              })}
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
            {t(language, "catchupSummary.investigation")}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="mt-0.5">
          <span className="text-[10px] text-white/70 block">{p.message}</span>
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-muted font-mono">
              {t(language, "catchupSummary.lapWithNumber", {
                lap: p.lapNumber,
              })}
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
            <span className="text-[9px] text-muted">▸</span>
            <span className="text-[11px] font-bold" style={{ color: colorB }}>
              {overtaken?.name_acronym ?? p.overtaken}
            </span>
            {p.position && (
              <span className="text-[9px] font-mono text-muted">
                P{p.position}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
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
              {t(language, "catchupSummary.pit")}
            </span>
            <span
              className="text-[12px] font-black"
              style={{ color: driverColor }}
            >
              {d?.name_acronym ?? p.driverNumber}
            </span>
            {d?.full_name && (
              <span className="text-[10px] text-muted">{d.full_name}</span>
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums text-muted shrink-0">
            {fmtRaceTime(ev.ms)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {typeof p.lapNumber === "number" && (
            <span className="text-[9px] text-muted font-mono">
              {t(language, "catchupSummary.lapWithNumber", {
                lap: p.lapNumber,
              })}
            </span>
          )}
          {typeof p.pitDuration === "number" && (
            <span className="text-[9px] font-mono tabular-nums text-white/70">
              {t(language, "catchupSummary.pitStopDuration", {
                duration: p.pitDuration.toFixed(1),
              })}
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
    const recordingUrl = toSafeExternalUrl(p.recordingUrl);
    const hasAudio = Boolean(recordingUrl);
    const isPlaying = recordingUrl !== null && playingUrl === recordingUrl;
    return (
      <div className="px-3 py-2 border-l-2 border-l-[#6b6b7a]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black px-1 py-0.5 bg-[#6b6b7a] text-white uppercase tracking-widest shrink-0">
              {t(language, "catchupSummary.radio")}
            </span>
            <span
              className="text-[12px] font-black"
              style={{ color: driverColor }}
            >
              {d?.name_acronym ?? p.driverNumber}
            </span>
            {d?.full_name && (
              <span className="text-[10px] text-muted">{d.full_name}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono tabular-nums text-muted">
              {fmtRaceTime(ev.ms)}
            </span>
            <button
              onClick={() => recordingUrl && onToggleRadio(recordingUrl)}
              disabled={!hasAudio}
              aria-label={
                isPlaying
                  ? t(language, "catchupSummary.stop")
                  : t(language, "catchupSummary.play")
              }
              className={[
                "flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                isPlaying
                  ? "bg-f1red text-white"
                  : "bg-panel text-muted hover:text-white",
                !hasAudio ? "opacity-30 cursor-not-allowed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isPlaying ? (
                <>
                  <Square size={9} strokeWidth={2.4} aria-hidden="true" />{" "}
                  {t(language, "catchupSummary.stop")}
                </>
              ) : (
                <>
                  <Play size={9} strokeWidth={2.4} aria-hidden="true" />{" "}
                  {t(language, "catchupSummary.play")}
                </>
              )}
            </button>
          </div>
        </div>
        {typeof p.lapNumber === "number" && (
          <div className="mt-0.5">
            <span className="text-[9px] text-muted font-mono">
              {t(language, "catchupSummary.lapWithNumber", {
                lap: p.lapNumber,
              })}
            </span>
          </div>
        )}
        {isPlaying && recordingUrl && (
          <audio
            key={recordingUrl}
            src={recordingUrl}
            autoPlay
            onEnded={() => onToggleRadio(recordingUrl)}
            onError={() => onToggleRadio(recordingUrl)}
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
  color: string;
};

const CHIP_CONFIGS: ChipConfig[] = [
  { kind: "pit", color: "#3d78ff" },
  { kind: "flag", color: "#f5a623" },
  { kind: "penalty", color: "#e8002d" },
  { kind: "overtake", color: "#22c55e" },
  { kind: "fastest_lap", color: "#9b59f5" },
  { kind: "investigation", color: "#f5a623" },
  { kind: "radio", color: "#6b6b7a" },
];

function chipLabel(
  kind: ToastKind,
  count: number,
  language: SupportedLanguage,
): string {
  switch (kind) {
    case "pit":
      return count === 1
        ? t(language, "catchupSummary.chips.pitOne")
        : t(language, "catchupSummary.chips.pitMany", { count });
    case "flag":
      return count === 1
        ? t(language, "catchupSummary.chips.flagOne")
        : t(language, "catchupSummary.chips.flagMany", { count });
    case "penalty":
      return count === 1
        ? t(language, "catchupSummary.chips.penaltyOne")
        : t(language, "catchupSummary.chips.penaltyMany", { count });
    case "overtake":
      return count === 1
        ? t(language, "catchupSummary.chips.overtakeOne")
        : t(language, "catchupSummary.chips.overtakeMany", { count });
    case "fastest_lap":
      return count === 1
        ? t(language, "catchupSummary.chips.fastestLapOne")
        : t(language, "catchupSummary.chips.fastestLapMany", { count });
    case "investigation":
      return count === 1
        ? t(language, "catchupSummary.chips.investigationOne")
        : t(language, "catchupSummary.chips.investigationMany", { count });
    case "radio":
      return count === 1
        ? t(language, "catchupSummary.chips.radioOne")
        : t(language, "catchupSummary.chips.radioMany", { count });
    default:
      return String(count);
  }
}

export function CatchupSummary({ summary, drivers, onDismiss }: Props) {
  const defaultFilters = useSettings((s) => s.catchupSummaryDefaultFilters);
  const language = useSettings((s) => s.language ?? FALLBACK_LANGUAGE);
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
    label: chipLabel(c.kind, counts[c.kind]!, language),
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
      <div className="bg-surface border border-panel shadow-2xl overflow-hidden max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-track border-b border-panel">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/80 flex items-center gap-1">
            <FastForward size={11} strokeWidth={2.4} aria-hidden="true" />
            {t(language, "catchupSummary.whileYouWereAway")}
          </span>
          <span className="text-[10px] font-mono text-muted ml-1">
            ({fmtDuration(duration)})
          </span>
          <button
            onClick={onDismiss}
            className="ml-auto text-muted hover:text-white text-xs"
            aria-label={t(language, "catchupSummary.dismiss")}
          >
            ×
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {/* Filter chips */}
          {allChips.length > 0 && (
            <div className="px-3 py-2 border-b border-panel flex flex-wrap gap-1.5">
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
                        : "border-panel text-muted bg-transparent",
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
            <div className="divide-y divide-panel">
              {visibleEvents.map((ev) => (
                <CatchupEventRow
                  key={ev.id}
                  ev={ev}
                  driverMap={driverMap}
                  playingUrl={playingUrl}
                  onToggleRadio={toggleRadio}
                  language={language}
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted px-3 py-3 text-center">
              {t(language, "catchupSummary.noEventsMatchFilters")}
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-muted hover:text-white border-t border-panel transition-colors"
        >
          {t(language, "catchupSummary.dismiss")}
        </button>
      </div>
    </div>
  );
}
