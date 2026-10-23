import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { Session } from "@/api/types";
import { useMeetings, useSeasonSessions } from "@/hooks/useSession";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { ErrorMessage } from "@/components/ErrorMessage";
import { parseGmtOffsetToMinutes } from "@/components/TrackMap/trackMapFormat";
import { PICKER_BAR } from "@/components/Nav/pickerStyles";
import { DEFAULT_YEAR, SCHEDULE_CLOCK_TICK_MS } from "@/constants";
import {
  buildSeasonSchedule,
  formatCountdown,
  type ScheduleRound,
  type ScheduleSession,
  type ScheduleStatus,
} from "@/utils/schedule";
import { replayPath, toSafeExternalUrl } from "@/utils/url";

type TimeMode = "local" | "track";
const TIME_MODES: TimeMode[] = ["local", "track"];
const TIME_MODE_LABEL: Record<TimeMode, string> = {
  local: "Your time",
  track: "Track time",
};

const STATUS_BADGE: Record<ScheduleStatus, { label: string; cls: string } | null> = {
  completed: null,
  live: { label: "Live weekend", cls: "bg-f1red text-white" },
  upcoming: null,
  cancelled: { label: "Cancelled", cls: "bg-panel text-muted" },
};

// Re-renders periodically so live/next badges and countdowns stay current.
function useNow(tickMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

interface TimeFormatter {
  day: (iso: string, gmtOffset: string) => string;
  time: (iso: string, gmtOffset: string) => string;
  range: (startIso: string, endIso: string, gmtOffset: string) => string;
}

// Track time shifts the instant by the venue's GMT offset and formats it as UTC.
function makeFormatter(mode: TimeMode): TimeFormatter {
  const tz = mode === "track" ? { timeZone: "UTC" } : {};
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", ...tz });
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...tz,
  });
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...tz,
  });
  const shift = (iso: string, gmtOffset: string) =>
    new Date(
      new Date(iso).getTime() +
        (mode === "track" ? parseGmtOffsetToMinutes(gmtOffset) * 60_000 : 0),
    );
  return {
    day: (iso, off) => dayFmt.format(shift(iso, off)),
    time: (iso, off) => timeFmt.format(shift(iso, off)),
    range: (startIso, endIso, off) =>
      dateFmt.formatRange(shift(startIso, off), shift(endIso, off)),
  };
}

function SessionRow({
  item,
  year,
  fmt,
}: {
  item: ScheduleSession;
  year: number;
  fmt: TimeFormatter;
}) {
  const { session, status } = item;
  const canReplay = status === "completed" || status === "live";
  const label = (
    <>
      <span
        className={`min-w-0 flex-1 truncate ${
          status === "cancelled" ? "text-muted line-through" : "text-white"
        }`}
      >
        {session.session_name}
      </span>
      <span className="w-9 shrink-0 text-muted">
        {fmt.day(session.date_start, session.gmt_offset)}
      </span>
      <span className="w-12 shrink-0 text-right tabular-nums text-white/85">
        {fmt.time(session.date_start, session.gmt_offset)}
      </span>
      <span className="flex w-16 shrink-0 justify-end">
        {status === "live" ? (
          <span className="rounded-sm bg-f1red px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
            Live
          </span>
        ) : canReplay ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted group-hover:text-f1red">
            <Play aria-hidden="true" className="h-2.5 w-2.5" />
            Replay
          </span>
        ) : null}
      </span>
    </>
  );
  const rowCls =
    "group flex items-center gap-2 px-3 py-1.5 font-mono text-[11px]";
  return canReplay ? (
    <Link
      to={replayPath({
        year,
        meetingKey: session.meeting_key,
        sessionKey: session.session_key,
      })}
      className={`${rowCls} transition-colors hover:bg-white/5`}
      aria-label={`Replay ${session.session_name}`}
    >
      {label}
    </Link>
  ) : (
    <div className={rowCls}>{label}</div>
  );
}

function RoundCard({
  round,
  year,
  fmt,
  nextSession,
  now,
}: {
  round: ScheduleRound;
  year: number;
  fmt: TimeFormatter;
  nextSession: Session | null;
  now: number;
}) {
  const { meeting } = round;
  const flagUrl = toSafeExternalUrl(meeting.country_flag);
  const badge = STATUS_BADGE[round.status];
  const kicker = round.isTesting
    ? "Testing"
    : round.round !== null
      ? `Round ${round.round}`
      : "—";
  return (
    <article
      data-next-round={round.isNext || undefined}
      className={`flex flex-col overflow-hidden rounded-sm border bg-surface ${
        round.isNext ? "border-f1red/80 ring-1 ring-f1red/40" : "border-panel"
      } ${round.status === "completed" || round.status === "cancelled" ? "opacity-80" : ""}`}
    >
      <header className="flex items-start gap-3 border-b border-panel px-3 py-2.5">
        {flagUrl ? (
          <img
            src={flagUrl}
            alt=""
            className="mt-0.5 h-4 w-6 shrink-0 rounded-[2px] border border-white/20 object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="mt-0.5 h-4 w-6 shrink-0 rounded-[2px] bg-panel" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-widest">
            <span className={round.isNext ? "text-f1red" : "text-muted"}>
              {kicker}
            </span>
            {round.isSprint && (
              <span className="rounded-sm border border-amber-400/50 px-1 text-amber-300">
                Sprint
              </span>
            )}
            {badge && (
              <span className={`rounded-sm px-1 ${badge.cls}`}>{badge.label}</span>
            )}
            {round.isNext && round.status === "upcoming" && (
              <span className="rounded-sm bg-f1red px-1 text-white">Next</span>
            )}
          </div>
          <h2 className="truncate text-sm font-bold text-white">
            {meeting.meeting_name}
          </h2>
          <div className="truncate text-[11px] text-muted">
            {meeting.circuit_short_name} · {meeting.location}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] text-white/85">
          {fmt.range(meeting.date_start, meeting.date_end, meeting.gmt_offset)}
          {round.isNext && nextSession && (
            <div className="mt-0.5 text-[10px] text-f1red">
              {new Date(nextSession.date_start).getTime() > now
                ? `${nextSession.session_name} in ${formatCountdown(
                    new Date(nextSession.date_start).getTime() - now,
                  )}`
                : `${nextSession.session_name} now`}
            </div>
          )}
        </div>
      </header>
      {round.sessions.length > 0 ? (
        <div className="divide-y divide-panel/60 py-0.5">
          {round.sessions.map((item) => (
            <SessionRow key={item.session.session_key} item={item} year={year} fmt={fmt} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-[11px] text-muted">
          {round.status === "cancelled" ? "Event cancelled" : "Session times TBC"}
        </div>
      )}
    </article>
  );
}

export default function Schedule() {
  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [timeParam, setTimeMode] = useStringParam<TimeMode>("time", "local");
  const timeMode: TimeMode = TIME_MODES.includes(timeParam) ? timeParam : "local";
  const now = useNow(SCHEDULE_CLOCK_TICK_MS);
  const listRef = useRef<HTMLDivElement>(null);

  const meetingsQ = useMeetings(year);
  const sessionsQ = useSeasonSessions(year);

  const schedule = useMemo(
    () => buildSeasonSchedule(meetingsQ.data ?? [], sessionsQ.data ?? [], now),
    [meetingsQ.data, sessionsQ.data, now],
  );
  const fmt = useMemo(() => makeFormatter(timeMode), [timeMode]);

  const nextRound = schedule.rounds.find((r) => r.isNext) ?? null;
  const nextSession =
    nextRound?.sessions.find((s) => s.status === "live" || s.status === "upcoming")
      ?.session ?? null;
  const nextKey = nextRound?.meeting.meeting_key ?? null;

  // Bring the next round into view once per season (not on every clock tick).
  const scrolledForYear = useRef<number | null>(null);
  useEffect(() => {
    if (nextKey === null || scrolledForYear.current === year) return;
    scrolledForYear.current = year;
    const card = listRef.current?.querySelector("[data-next-round]");
    card?.scrollIntoView?.({ block: "center" });
  }, [nextKey, year]);

  const isLoading = meetingsQ.isPending || sessionsQ.isPending;
  const isError = meetingsQ.isError;

  return (
    <div className="flex flex-col bg-track md:h-full md:overflow-hidden">
      <h1 className="sr-only">{`F1 ${year} season schedule`}</h1>
      <div className={PICKER_BAR}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4">
          <span className="font-mono text-[11px] text-muted">
            {isLoading
              ? "Loading calendar…"
              : `${schedule.completedRounds}/${schedule.totalRounds} rounds completed`}
          </span>
          <div
            role="radiogroup"
            aria-label="Time zone"
            className="ml-auto flex overflow-hidden rounded-sm border border-panel"
          >
            {TIME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={timeMode === mode}
                onClick={() => setTimeMode(mode)}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  timeMode === mode
                    ? "bg-f1red text-white"
                    : "text-muted hover:text-white"
                }`}
              >
                {TIME_MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isError ? (
        <div className="flex-1">
          <ErrorMessage message="Failed to load the season calendar" />
        </div>
      ) : !isLoading && schedule.rounds.length === 0 ? (
        <div className="flex-1">
          <ErrorMessage message={`No ${year} events published yet`} variant="empty" />
        </div>
      ) : (
        <div ref={listRef} className="md:min-h-0 md:flex-1 md:overflow-auto">
          <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
            {schedule.rounds.map((round) => (
              <RoundCard
                key={round.meeting.meeting_key}
                round={round}
                year={year}
                fmt={fmt}
                nextSession={round.isNext ? nextSession : null}
                now={now}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
