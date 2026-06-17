import { useState } from "react";
import { Play, Square } from "lucide-react";
import type { TeamRadio as TeamRadioEntry, Driver } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { teamColor } from "@/utils/color";

interface Props {
  readonly entries: TeamRadioEntry[];
  readonly sessionKey?: number | null;
  readonly drivers: Driver[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

function fmtSessionTime(entryDateMs: number, sessionStartMs: number) {
  const elapsed = Math.max(0, entryDateMs - sessionStartMs);
  const s = Math.floor(elapsed / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

export function TeamRadioFeed({
  entries,
  sessionKey = null,
  drivers,
  sessionTimeMs,
  sessionStartMs,
}: Props) {
  const [playing, setPlaying] = useState<string | null>(null);
  const currentT = sessionStartMs + sessionTimeMs;

  const driverByNumber = new Map(drivers.map((d) => [d.driver_number, d]));

  const visible = entries
    .filter((e) => new Date(e.date).getTime() <= currentT)
    .slice(-30)
    .reverse();

  function play(url: string) {
    if (playing === url) {
      setPlaying(null);
      return;
    }
    setPlaying(url);
  }

  if (visible.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        {sessionStartMs
          ? "No radio messages yet — scrub forward"
          : "Select a session"}
      </div>
    );
  }

  return (
    <div className="panel-scroll p-2 space-y-1">
      {sessionKey !== null && (
        <div className="flex justify-end pb-1">
          <button
            type="button"
            onClick={() => {
              void downloadEndpointCsv(
                "team_radio",
                { session_key: sessionKey },
                `team_radio_${sessionKey}.csv`,
              );
            }}
            className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-[#1e1e28] text-muted hover:text-white hover:bg-[#38383f]"
            aria-label="Export team radio CSV"
          >
            Export CSV
          </button>
        </div>
      )}
      {visible.map((e, i) => {
        const driver = driverByNumber.get(e.driver_number);
        const color = teamColor(driver?.team_colour);
        const entryMs = new Date(e.date).getTime();
        const isPlaying = playing === e.recording_url;
        return (
          <div
            key={i}
            className="flex items-start gap-2 border-b border-[#2a2a35] pb-1.5 pt-0.5"
          >
            {/* Team colour bar */}
            <span
              className="w-[3px] self-stretch shrink-0"
              style={{ background: color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs" style={{ color }}>
                  {driver?.name_acronym ?? e.driver_number}
                </span>
                <span className="text-muted font-mono tabular-nums text-[10px]">
                  {fmtSessionTime(entryMs, sessionStartMs)}
                </span>
              </div>
              <div className="mt-1">
                <button
                  onClick={() => play(e.recording_url)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    isPlaying
                      ? "bg-f1red text-white"
                      : "bg-panel text-muted hover:text-white hover:bg-[#38383f]"
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Square size={11} strokeWidth={2.4} aria-hidden="true" />{" "}
                      Stop
                    </>
                  ) : (
                    <>
                      <Play size={11} strokeWidth={2.4} aria-hidden="true" />{" "}
                      Play
                    </>
                  )}
                </button>
                {isPlaying && (
                  <audio
                    key={e.recording_url}
                    src={e.recording_url}
                    autoPlay
                    onEnded={() => setPlaying(null)}
                    className="hidden"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
