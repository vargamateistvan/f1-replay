import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Play, Square } from "lucide-react";
import type { ActiveToast } from "@/hooks/useEventToasts";
import type { Driver } from "@/api/types";
import type {
  RadioPayload,
  FlagPayload,
  OvertakePayload,
  PitPayload,
  FastestLapPayload,
} from "@/timeline/events";
import { classifyPenaltyToastMessage } from "@/timeline/events";
import { teamColor } from "@/utils/color";
import { useSettings } from "@/stores/settings";
import { toSafeExternalUrl } from "@/utils/url";

interface Props {
  toasts: ActiveToast[];
  drivers: Driver[];
  onDismiss: (id: string) => void;
  layout?: "overlay" | "inline";
  radioAutoplay?: boolean;
  soundsEnabled?: boolean;
  maxVisible?: 2 | 4 | 6 | 8;
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function beep(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  volume = 0.04,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
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

const FLAG_COLORS: Record<string, { bg: string; text: string; label: string }> =
  {
    YELLOW: { bg: "#f5d400", text: "#000", label: "YELLOW" },
    DOUBLE_YELLOW: { bg: "#f5d400", text: "#000", label: "DBL YELLOW" },
    RED: { bg: "#e8002d", text: "#fff", label: "RED FLAG" },
    SAFETY_CAR: { bg: "#f5a623", text: "#000", label: "SAFETY CAR" },
    VIRTUAL_SC: { bg: "#f5a623", text: "#000", label: "VIRTUAL SC" },
    CHEQUERED: { bg: "#fff", text: "#000", label: "CHEQUERED" },
    BLUE: { bg: "#4da6ff", text: "#000", label: "BLUE FLAG" },
  };

export function EventToastStack({
  toasts,
  drivers,
  onDismiss,
  layout = "overlay",
  radioAutoplay = false,
  soundsEnabled = false,
  maxVisible = 4,
}: Props) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const visibleToasts = toasts.slice(0, maxVisible);
  const playedRef = useRef(new Set<string>());

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
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        /* Ignore blocked autoplay contexts. */
      });
    }

    for (const at of unseen) {
      playedRef.current.add(at.event.id);
      playToastCue(at.event.kind);
    }
  }, [toasts, soundsEnabled]);

  if (visibleToasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-slide-desktop {
          from { opacity: 0; transform: translateX(24px) scale(0.98); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toast-slide-mobile {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .toast-in { animation: toast-slide-mobile 0.2s ease-out both; }
        @media (max-width: 767px) {
          .toast-in { animation: toast-slide-mobile 0.2s ease-out both; }
        }
        @media (min-width: 768px) {
          .toast-in { animation: toast-slide-desktop 0.2s ease-out both; }
        }
      `}</style>

      <div
        className={[
          "pointer-events-none flex flex-col gap-1.5",
          layout === "overlay"
            ? "fixed z-40 right-2 top-[calc(4.5rem+env(safe-area-inset-top)+20px)] w-[198px] md:right-4 md:top-[calc(3.75rem+env(safe-area-inset-top)+20px)] md:w-[220px]"
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
              onDismiss={onDismiss}
              radioAutoplay={radioAutoplay}
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
  children,
}: {
  id: string;
  onDismiss: (id: string) => void;
  children: ReactNode;
}) {
  const startXRef = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0]!.clientX;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startXRef.current === null) return;
    const dx = e.touches[0]!.clientX - startXRef.current;
    setOffset(dx);
  }

  function onTouchEnd() {
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
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
  radioAutoplay: boolean;
}) {
  const inner = (() => {
    if (at.event.kind === "radio")
      return (
        <RadioToast
          at={at}
          driverMap={driverMap}
          onDismiss={onDismiss}
          radioAutoplay={radioAutoplay}
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
    return null;
  })();

  if (!inner) return null;

  return (
    <SwipeCard id={at.event.id} onDismiss={onDismiss}>
      <div className="toast-in w-full">{inner}</div>
    </SwipeCard>
  );
}

// ── Shared dismiss button ─────────────────────────────────────────────────────
// 44px tap target on mobile, compact on desktop.

function DismissBtn({
  id,
  onDismiss,
}: {
  id: string;
  onDismiss: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onDismiss(id)}
      className="absolute top-1 right-1 z-10 flex items-center justify-center pointer-events-auto
                 w-6 h-6 text-muted hover:text-white transition-colors text-xs"
      style={{ touchAction: "manipulation" }}
      aria-label="Dismiss"
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
}: {
  at: ActiveToast;
  driverMap: Map<number, Driver>;
  onDismiss: (id: string) => void;
  radioAutoplay: boolean;
}) {
  const [playing, setPlaying] = useState(radioAutoplay);
  const p = at.event.payload as RadioPayload;
  const driver = driverMap.get(p.driverNumber);
  const color = teamColor(driver?.team_colour);
  const recordingUrl = toSafeExternalUrl(p.recordingUrl);
  const hasAudio = Boolean(recordingUrl);

  useEffect(() => {
    if (!hasAudio && playing) setPlaying(false);
  }, [hasAudio, playing]);

  return (
    <div className="relative pointer-events-auto rounded-lg bg-surface border border-panel shadow-xl flex overflow-hidden w-full">
      <span className="w-[3px] shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-[9px] text-muted uppercase tracking-widest mb-0.5">
          Radio
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="font-black text-[12px] md:text-[13px]"
            style={{ color }}
          >
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          <button
            onClick={() => hasAudio && setPlaying((v) => !v)}
            disabled={!hasAudio}
            style={{ touchAction: "manipulation" }}
            className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${playing ? "bg-f1red text-white" : "bg-panel text-muted hover:text-white"}`}
          >
            {!hasAudio ? (
              <>N/A</>
            ) : playing ? (
              <>
                <Square size={11} strokeWidth={2.4} aria-hidden="true" /> Stop
              </>
            ) : (
              <>
                <Play size={11} strokeWidth={2.4} aria-hidden="true" /> Play
              </>
            )}
          </button>
          {playing && recordingUrl && (
            <audio
              key={recordingUrl}
              src={recordingUrl}
              autoPlay
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          )}
        </div>
      </div>
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
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
  const cfg = FLAG_COLORS[p.flag] ?? {
    bg: "rgb(var(--color-panel) / 1)",
    text: "#fff",
    label: p.flag,
  };

  const header =
    kind === "investigation"
      ? { bg: "#3a3320", text: "#ffd36a", label: "INVESTIGATION" }
      : kind === "penalty"
        ? { bg: "#4a1820", text: "#ff9ca9", label: "PENALTY" }
        : cfg;
  const penaltySubtype =
    kind === "penalty" ? classifyPenaltyToastMessage(p.message) : null;

  return (
    <div className="pointer-events-auto rounded-lg bg-surface border border-panel shadow-xl overflow-hidden w-full">
      <div
        className="flex items-center gap-2 px-2.5 py-1 md:px-3 md:py-1"
        style={{ background: header.bg }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-widest"
          style={{ color: header.text }}
        >
          {header.label}
        </span>
        {penaltySubtype && (
          <span
            className="rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide"
            style={{
              color: header.text,
              borderColor: header.text,
              opacity: 0.92,
            }}
          >
            {penaltySubtype === "warning_notice" ? "NOTICE" : "MAJOR"}
          </span>
        )}
        {p.lapNumber && (
          <span
            className="text-[9px] font-mono"
            style={{ color: header.text, opacity: 0.75 }}
          >
            L{p.lapNumber}
          </span>
        )}
        <button
          onClick={() => onDismiss(at.event.id)}
          className="ml-auto flex items-center justify-center w-5 h-5 text-xs transition-opacity opacity-70 hover:opacity-100"
          style={{ color: header.text, touchAction: "manipulation" }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="flex items-center gap-1 px-2.5 py-1.5 md:px-3 md:py-2">
        <p className="flex-1 text-[10px] text-white/85 leading-snug line-clamp-2">
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
    <div className="relative pointer-events-auto rounded-lg bg-surface border border-panel shadow-xl flex items-center overflow-hidden w-full">
      <span
        className="w-[3px] self-stretch shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-[9px] text-muted uppercase tracking-widest mb-0.5">
          Overtake
        </div>
        <div className="flex items-center gap-1 font-black text-[12px] md:text-[13px]">
          <span style={{ color }}>
            {overtaking?.name_acronym ?? p.overtaking}
          </span>
          <span className="text-muted text-[10px]">▸</span>
          <span className="text-white/60">
            {overtaken?.name_acronym ?? p.overtaken}
          </span>
          {p.position && (
            <span className="ml-1 text-[10px] font-bold text-muted">
              P{p.position}
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
    <div className="relative pointer-events-auto rounded-lg bg-surface border border-panel shadow-xl flex items-center overflow-hidden w-full">
      <span
        className="w-[3px] self-stretch shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0 px-2.5 py-1.5 pr-8 md:px-3 md:py-2 md:pr-8">
        <div className="text-[9px] text-muted uppercase tracking-widest mb-0.5">
          Pit · L{p.lapNumber}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="font-black text-[12px] md:text-[13px]"
            style={{ color }}
          >
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          {p.pitDuration !== null && (
            <span className="text-white/70 text-[11px] font-mono tabular-nums">
              {p.pitDuration.toFixed(1)}s
            </span>
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
  const lightMode = useSettings((s) => s.lightMode);
  const p = at.event.payload as FastestLapPayload;
  const driver = driverMap.get(p.driverNumber);

  return (
    <div
      className="pointer-events-auto rounded-lg shadow-xl overflow-hidden w-full"
      style={{
        background: lightMode ? "#f3e9ff" : "#1a0e2e",
        border: `1px solid ${lightMode ? "#a965f0" : "#9b59f5"}`,
      }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1 md:px-3 md:py-1"
        style={{ background: lightMode ? "#c88dff" : "#9b59f5" }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-widest"
          style={{ color: lightMode ? "#12121a" : "#ffffff" }}
        >
          Fastest Lap
        </span>
        <span
          className="text-[9px] font-mono"
          style={{ color: lightMode ? "rgba(18,18,26,0.7)" : "#ffffff" }}
        >
          L{p.lapNumber}
        </span>
        <button
          onClick={() => onDismiss(at.event.id)}
          className={
            lightMode
              ? "ml-auto flex items-center justify-center w-5 h-5 text-xs text-[#12121a]/65 hover:text-[#12121a] transition-colors"
              : "ml-auto flex items-center justify-center w-5 h-5 text-xs text-white/70 hover:text-white transition-colors"
          }
          style={{ touchAction: "manipulation" }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="flex items-center px-2.5 py-1.5 md:px-3 md:py-2">
        <span
          className="font-black text-[12px] md:text-[13px] flex-1"
          style={{ color: lightMode ? "#7d22de" : "#9b59f5" }}
        >
          {driver?.name_acronym ?? p.driverNumber}
        </span>
        <span
          className="font-mono text-[10px] md:text-[12px] tabular-nums"
          style={{ color: lightMode ? "#7d22de" : "#9b59f5" }}
        >
          {fmtLapTime(p.lapTime)}
        </span>
      </div>
    </div>
  );
}
