import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Play, Square } from "lucide-react";
import type { ActiveToast } from "@/hooks/useEventToasts";
import type { Driver } from "@/api/types";
import { animateMotion, fadeUpMotion } from "@/lib/motion";
import type {
  RadioPayload,
  FlagPayload,
  OvertakePayload,
  PitPayload,
  FastestLapPayload,
  UndercutPayload,
} from "@/timeline/events";
import { teamColor } from "@/utils/color";
import { formatPitDuration } from "@/utils/pit";
import { formatBattleGain, pitBattleHeadline } from "@/utils/undercut";
import { toSafeExternalUrl } from "@/utils/url";
import { useAudioProgress } from "@/hooks/useAudioProgress";
import { beep, getAudioContext } from "@/lib/audio";
import { RadioAudio } from "@/components/RadioAudio";
import { TyreChange } from "@/components/TyreChange/TyreChange";

interface Props {
  toasts: ActiveToast[];
  drivers: Driver[];
  onDismiss: (id: string) => void;
  layout?: "overlay" | "inline";
  radioAutoplay?: boolean;
  soundsEnabled?: boolean;
  maxVisible?: 2 | 4 | 6 | 8;
  /** Called whenever the set of toast ids currently playing radio audio changes. */
  onPlayingIdsChange?: (playingIds: Set<string>) => void;
}

function playToastCue(kind: ActiveToast["event"]["kind"]) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.01;

  if (kind === "radio") {
    beep(ctx, 760, start, 0.08, 0.035);
    beep(ctx, 980, start + 0.09, 0.09, 0.032);
    return;
  }

  if (kind === "flag" || kind === "investigation" || kind === "penalty") {
    beep(ctx, 430, start, 0.1, 0.04);
    return;
  }

  beep(ctx, 700, start, 0.045, 0.03);
}

/** Toast header per flag: fill + text classes. */
const FLAG_HEADERS: Record<string, { className: string; label: string }> = {
  YELLOW: { className: "bg-yellow text-black", label: "YELLOW" },
  DOUBLE_YELLOW: { className: "bg-yellow text-black", label: "DBL YELLOW" },
  RED: { className: "bg-f1red text-white", label: "RED FLAG" },
  SAFETY_CAR: { className: "bg-orange text-black", label: "SAFETY CAR" },
  VIRTUAL_SC: { className: "bg-orange text-black", label: "VIRTUAL SC" },
  CHEQUERED: { className: "bg-white text-black", label: "CHEQUERED" },
  BLUE: { className: "bg-blue text-black", label: "BLUE FLAG" },
};

export function EventToastStack({
  toasts,
  drivers,
  onDismiss,
  layout = "overlay",
  radioAutoplay = false,
  soundsEnabled = false,
  maxVisible = 4,
  onPlayingIdsChange,
}: Props) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const visibleToasts = toasts.slice(0, maxVisible);
  const playedRef = useRef(new Set<string>());
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set());

  const handlePlayingChange = useCallback((id: string, playing: boolean) => {
    setPlayingIds((prev) => {
      const isPlaying = prev.has(id);
      if (playing === isPlaying) return prev;
      const next = new Set(prev);
      if (playing) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    onPlayingIdsChange?.(playingIds);
  }, [playingIds, onPlayingIdsChange]);

  const guardedDismiss = useCallback(
    (id: string) => {
      if (playingIds.has(id)) return;
      onDismiss(id);
    },
    [playingIds, onDismiss],
  );

  useEffect(() => {
    if (!soundsEnabled) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    )
      return;

    const unseen = toasts.filter((at) => !playedRef.current.has(at.event.id));
    if (unseen.length === 0) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    for (const at of unseen) {
      playedRef.current.add(at.event.id);
      playToastCue(at.event.kind);
    }
  }, [toasts, soundsEnabled]);

  if (visibleToasts.length === 0) return null;

  return (
    <>
      <div
        className={[
          "pointer-events-none flex flex-col gap-1.5",
          layout === "overlay"
            ? "absolute z-40 top-2 right-2 w-[198px] md:top-4 md:right-4 md:w-[220px]"
            : "relative z-10 w-[198px] ml-auto px-1 pt-0.5 pb-0.5 md:self-end md:w-[220px] md:px-0 md:pt-1 md:pb-1",
        ].join(" ")}
        role="region"
        aria-label="Live race notifications"
      >
        <div className="toast-cards pointer-events-none flex flex-col gap-1.5">
          {visibleToasts.map((at) => (
            <ToastCard
              key={at.event.id}
              at={at}
              driverMap={driverMap}
              onDismiss={guardedDismiss}
              radioAutoplay={radioAutoplay}
              onPlayingChange={handlePlayingChange}
              playingIds={playingIds}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Swipeable wrapper ─────────────────────────────────────────────────────────
// Swipe right (or left) on mobile to dismiss without needing to hit the × button.

function SwipeCard({
  id,
  onDismiss,
  kind,
  disabled = false,
  children,
}: {
  id: string;
  onDismiss: (id: string) => void;
  kind: ActiveToast["event"]["kind"];
  disabled?: boolean;
  children: ReactNode;
}) {
  const startXRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const animation = animateMotion(
      cardRef.current,
      fadeUpMotion({
        opacity: [0, 1],
        translateY: [12, 0],
        translateX: [kind === "radio" ? 20 : 14, 0],
        scale: [0.98, 1],
        duration: 220,
      }),
    );

    return () => {
      animation?.revert();
    };
  }, [kind]);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    startXRef.current = e.touches[0]!.clientX;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (disabled || startXRef.current === null) return;
    const dx = e.touches[0]!.clientX - startXRef.current;
    setOffset(dx);
  }

  function onTouchEnd() {
    if (disabled) {
      startXRef.current = null;
      return;
    }
    if (Math.abs(offset) > 80) {
      setLeaving(true);
      setTimeout(() => onDismiss(id), 180);
    } else {
      setOffset(0);
    }
    startXRef.current = null;
  }

  return (
    <div
      ref={cardRef}
      className="toast-card"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: leaving
          ? `translateX(${offset > 0 ? "120%" : "-120%"})`
          : `translateX(${offset}px)`,
        opacity: leaving ? 0 : Math.max(0, 1 - Math.abs(offset) / 160),
        transition:
          offset === 0 || leaving
            ? "transform 0.18s ease, opacity 0.18s ease"
            : "none",
        touchAction: "pan-y",
      }}
    >
      {children}
    </div>
  );
}

// ── Card dispatcher ───────────────────────────────────────────────────────────

function ToastCard({
  at,
  driverMap,
  onDismiss,
  radioAutoplay,
  onPlayingChange,
  playingIds,
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
  radioAutoplay: boolean;
  onPlayingChange?: (id: string, playing: boolean) => void;
  playingIds: Set<string>;
}) {
  const inner = (() => {
    if (at.event.kind === "radio")
      return (
        <RadioToast
          at={at}
          driverMap={driverMap}
          onDismiss={onDismiss}
          radioAutoplay={radioAutoplay}
          onPlayingChange={onPlayingChange}
        />
      );
    if (
      at.event.kind === "flag" ||
      at.event.kind === "investigation" ||
      at.event.kind === "penalty"
    )
      return <FlagToast at={at} onDismiss={onDismiss} />;
    if (at.event.kind === "overtake")
      return (
        <OvertakeToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
      );
    if (at.event.kind === "pit")
      return <PitToast at={at} driverMap={driverMap} onDismiss={onDismiss} />;
    if (at.event.kind === "fastest_lap")
      return (
        <FastestLapToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
      );
    if (at.event.kind === "undercut")
      return (
        <UndercutToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
      );
    return null;
  })();

  if (!inner) return null;

  return (
    <SwipeCard
      id={at.event.id}
      onDismiss={onDismiss}
      kind={at.event.kind}
      disabled={playingIds.has(at.event.id)}
    >
      {inner}
    </SwipeCard>
  );
}

// ── Shared dismiss button ─────────────────────────────────────────────────────
// 44px tap target on mobile, compact on desktop.

function DismissBtn({
  id,
  onDismiss,
  disabled = false,
}: {
  id: string;
  onDismiss: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onDismiss(id)}
      disabled={disabled}
      className="absolute top-1 right-1 z-10 flex items-center justify-center pointer-events-auto
                 w-6 h-6 text-muted hover:text-fg transition-colors text-xs disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ touchAction: "manipulation" }}
      aria-label={disabled ? "Playing — dismiss disabled" : "Dismiss"}
    >
      ×
    </button>
  );
}

// ─── Radio ───────────────────────────────────────────────────────────────────

function RadioToast({
  at,
  driverMap,
  onDismiss,
  radioAutoplay,
  onPlayingChange,
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
  radioAutoplay: boolean;
  onPlayingChange?: (id: string, playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(radioAutoplay);
  const p = at.event.payload as RadioPayload;
  const driver = driverMap.get(p.driverNumber);
  const color = teamColor(driver?.team_colour);
  const recordingUrl = toSafeExternalUrl(p.recordingUrl);
  const hasAudio = Boolean(recordingUrl);
  const { progress, audioRef, onTimeUpdate } = useAudioProgress(playing);

  useEffect(() => {
    if (!hasAudio && playing) setPlaying(false);
  }, [hasAudio, playing]);

  useEffect(() => {
    onPlayingChange?.(at.event.id, playing && hasAudio);
    return () => onPlayingChange?.(at.event.id, false);
  }, [playing, hasAudio, at.event.id, onPlayingChange]);

  return (
    <div className="relative pointer-events-auto rounded-sm bg-surface border border-panel shadow-xl flex overflow-hidden w-full">
      <span className="w-[3px] shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-tiny text-muted uppercase tracking-widest mb-0.5">
          Radio
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="font-black text-compact md:text-body"
            style={{ color }}
          >
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          <button
            onClick={() => hasAudio && setPlaying((v) => !v)}
            disabled={!hasAudio}
            style={{ touchAction: "manipulation" }}
            className={`relative overflow-hidden text-tiny font-black uppercase tracking-widest px-2 py-1 rounded-sm transition-colors flex items-center gap-1 min-w-[64px] justify-center ${playing ? "bg-track text-fg" : "bg-panel text-muted hover:text-fg"}`}
          >
            {playing && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-f1red transition-[width] duration-150 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            )}
            <span className="relative flex items-center gap-1">
              {!hasAudio ? (
                <>N/A</>
              ) : playing ? (
                <>
                  <Square size={11} strokeWidth={2.4} aria-hidden="true" />{" "}
                  Stop
                </>
              ) : (
                <>
                  <Play size={11} strokeWidth={2.4} aria-hidden="true" /> Play
                </>
              )}
            </span>
          </button>
          {playing && recordingUrl && (
            <RadioAudio
              key={recordingUrl}
              audioRef={audioRef}
              src={recordingUrl}
              onTimeUpdate={onTimeUpdate}
              onEnded={() => setPlaying(false)}
            />
          )}
        </div>
      </div>
      <DismissBtn
        id={at.event.id}
        onDismiss={onDismiss}
        disabled={playing}
      />
    </div>
  );
}

// ─── Flag / Race Control ─────────────────────────────────────────────────────

function FlagToast({
  at,
  onDismiss,
}: {
  at: ActiveToast;
  onDismiss: (id: string) => void;
}) {
  const p = at.event.payload as FlagPayload;
  const kind = at.event.kind;
  const header =
    kind === "investigation"
      ? { className: "bg-yellow-tint text-yellow-fg", label: "INVESTIGATION" }
      : kind === "penalty"
        ? { className: "bg-red-tint text-red-fg", label: "PENALTY" }
        : (FLAG_HEADERS[p.flag] ?? { className: "bg-panel text-fg", label: p.flag });

  return (
    <div className="pointer-events-auto rounded-sm bg-surface border border-panel shadow-xl overflow-hidden w-full">
      <div
        className={`flex items-center gap-2 px-2.5 py-1 md:px-3 md:py-1 ${header.className}`}
      >
        <span className="text-caption font-black uppercase tracking-widest">
          {header.label}
        </span>
        {p.lapNumber && (
          <span className="text-tiny font-mono opacity-75">
            L{p.lapNumber}
          </span>
        )}
        <button
          onClick={() => onDismiss(at.event.id)}
          className="ml-auto flex items-center justify-center w-5 h-5 text-xs transition-opacity opacity-70 hover:opacity-100"
          style={{ touchAction: "manipulation" }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="flex items-center gap-1 px-2.5 py-1.5 md:px-3 md:py-2">
        <p className="flex-1 text-caption text-fg/85 leading-snug line-clamp-2">
          {p.message}
        </p>
      </div>
    </div>
  );
}

// ─── Overtake ────────────────────────────────────────────────────────────────

function OvertakeToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
}) {
  const p = at.event.payload as OvertakePayload;
  const overtaking = driverMap.get(p.overtaking);
  const overtaken = driverMap.get(p.overtaken);
  const color = teamColor(overtaking?.team_colour);

  return (
    <div className="relative pointer-events-auto rounded-sm bg-surface border border-panel shadow-xl flex items-center overflow-hidden w-full">
      <span
        className="w-[3px] self-stretch shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-tiny text-muted uppercase tracking-widest mb-0.5">
          Overtake
        </div>
        <div className="flex items-center gap-1 font-black text-compact md:text-body">
          <span style={{ color }}>
            {overtaking?.name_acronym ?? p.overtaking}
          </span>
          <span className="text-muted text-caption">▸</span>
          <span className="text-fg/60">
            {overtaken?.name_acronym ?? p.overtaken}
          </span>
          {p.position && (
            <span className="ml-1 text-caption font-bold text-muted">
              P{p.position}
            </span>
          )}
        </div>
      </div>
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
    </div>
  );
}

// ─── Undercut / overcut ──────────────────────────────────────────────────────

function UndercutToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
}) {
  const p = at.event.payload as UndercutPayload;
  const attacker = driverMap.get(p.attacker);
  const defender = driverMap.get(p.defender);
  const color = teamColor(attacker?.team_colour);

  return (
    <div className="relative pointer-events-auto rounded-sm bg-surface border border-panel shadow-xl flex items-center overflow-hidden w-full">
      <span className="w-[3px] self-stretch shrink-0 bg-teal" />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-tiny text-muted uppercase tracking-widest mb-0.5">
          {pitBattleHeadline(p)} · L{p.firstStopLap}
          {p.neutralised && " · SC/VSC"}
        </div>
        <div className="flex items-center gap-1 font-black text-compact md:text-body">
          <span style={{ color }}>{attacker?.name_acronym ?? p.attacker}</span>
          <span className="text-muted text-caption">vs</span>
          <span className="text-fg/60">
            {defender?.name_acronym ?? p.defender}
          </span>
          {p.attackerGainS !== null && (
            <span className="ml-auto text-small font-mono tabular-nums text-fg/70">
              {formatBattleGain(p.attackerGainS)}
            </span>
          )}
        </div>
      </div>
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
    </div>
  );
}

// ─── Pit ─────────────────────────────────────────────────────────────────────

function PitToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
}) {
  const p = at.event.payload as PitPayload;
  const driver = driverMap.get(p.driverNumber);
  const color = teamColor(driver?.team_colour);

  return (
    <div className="relative pointer-events-auto rounded-sm bg-surface border border-panel shadow-xl flex items-center overflow-hidden w-full">
      <span
        className="w-[3px] self-stretch shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-tiny text-muted uppercase tracking-widest mb-0.5">
          Pit · L{p.lapNumber}
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="shrink-0 font-black text-compact md:text-body"
            style={{ color }}
          >
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          {p.pitDuration !== null && (
            <span className="shrink-0 text-fg/70 text-small font-mono tabular-nums">
              {formatPitDuration(p.pitDuration) ?? "--:--:---"}
            </span>
          )}
          {(p.tyreOff || p.tyreOn) && (
            <TyreChange off={p.tyreOff} on={p.tyreOn} compact />
          )}
        </div>
      </div>
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
    </div>
  );
}

// ─── Fastest lap ─────────────────────────────────────────────────────────────

function fmtLapTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

function FastestLapToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
}) {
  const p = at.event.payload as FastestLapPayload;
  const driver = driverMap.get(p.driverNumber);

  return (
    <div className="pointer-events-auto rounded-sm shadow-xl overflow-hidden w-full border border-purple bg-purple-tint">
      <div className="flex items-center gap-2 bg-purple px-2.5 py-1 md:px-3 md:py-1">
        <span className="text-caption font-black uppercase tracking-widest text-white">
          Fastest Lap
        </span>
        <span className="text-tiny font-mono text-white/80">L{p.lapNumber}</span>
        <button
          onClick={() => onDismiss(at.event.id)}
          className="ml-auto flex items-center justify-center w-5 h-5 text-xs text-white/70 hover:text-white transition-colors"
          style={{ touchAction: "manipulation" }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="flex items-center px-2.5 py-1.5 md:px-3 md:py-2">
        <span className="font-black text-compact md:text-body flex-1 text-purple">
          {driver?.name_acronym ?? p.driverNumber}
        </span>
        <span className="font-mono text-caption md:text-compact tabular-nums text-purple">
          {fmtLapTime(p.lapTime)}
        </span>
      </div>
    </div>
  );
}
