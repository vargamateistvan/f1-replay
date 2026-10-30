import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ListOrdered, Play } from "lucide-react";
import type { Meeting, Session } from "@/api/types";
import {
  useDrivers,
  useMeetings,
  useSeasonSessions,
  useSessionResult,
} from "@/hooks/useSession";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { CircuitSummary } from "@/components/CircuitSummary";
import { ErrorMessage } from "@/components/ErrorMessage";
import { FinalClassificationDialog } from "@/components/FinalClassification";
import { buttonClass } from "@/components/Button/buttonClass";
import { parseGmtOffsetToMinutes } from "@/components/TrackMap/trackMapFormat";
import { PICKER_BAR } from "@/components/Nav/pickerStyles";
import { DEFAULT_YEAR, SCHEDULE_CLOCK_TICK_MS } from "@/constants";
import {
  buildSeasonSchedule,
  scheduleFocusRound,
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
  onShowResult,
}: {
  item: ScheduleSession;
  year: number;
  fmt: TimeFormatter;
  onShowResult: (session: Session) => void;
}) {
  const { session, status } = item;
  const canReplay = status === "completed" || status === "live";
  const hasResult = status === "completed";
  const actionClass = buttonClass(
    "quiet",
    "sm",
    "h-8 w-[4.5rem] rounded-sm bg-track/50",
  );
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-small">
      <div className="min-w-0">
        <div
          className={`truncate ${
            status === "cancelled" ? "text-muted line-through" : "text-fg"
          }`}
        >
          {session.session_name}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-caption tabular-nums text-muted">
          <span>
            {fmt.day(session.date_start, session.gmt_offset)}{" "}
            {fmt.time(session.date_start, session.gmt_offset)}
          </span>
          {status === "live" && (
            <span className="font-bold uppercase tracking-caps text-f1red-fg">
              Live
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {canReplay && (
          <Link
            to={replayPath({
              year,
              meetingKey: session.meeting_key,
              sessionKey: session.session_key,
            })}
            className={actionClass}
            aria-label={`Replay ${session.session_name}`}
          >
            <Play aria-hidden="true" className="h-3 w-3" />
            Replay
          </Link>
        )}
        {hasResult && (
          <button
            type="button"
            onClick={() => onShowResult(session)}
            aria-label={`${session.session_name} result`}
            className={actionClass}
          >
            <ListOrdered aria-hidden="true" className="h-3 w-3" />
            Result
          </button>
        )}
      </div>
    </div>
  );
}

function SessionResultDialog({
  session,
  meeting,
  onClose,
}: {
  session: Session;
  meeting: Meeting | undefined;
  onClose: () => void;
}) {
  const results = useSessionResult(session.session_key);
  const drivers = useDrivers(session.session_key);
  const status = results.isError
    ? "error"
    : results.isPending || drivers.isPending
      ? "loading"
      : "ready";
  return (
    <FinalClassificationDialog
      results={results.data ?? []}
      drivers={drivers.data ?? []}
      sessionName={session.session_name}
      year={session.year}
      sessionKey={session.session_key}
      meta={`${session.circuit_short_name} · ${session.year}`}
      subtitle={meeting?.meeting_name}
      status={status}
      footer={
        <Link
          to={replayPath({
            year: session.year,
            meetingKey: session.meeting_key,
            sessionKey: session.session_key,
          })}
          className={buttonClass("primary")}
        >
          <Play aria-hidden="true" className="h-3 w-3" />
          Replay session
        </Link>
      }
      onClose={onClose}
    />
  );
}

function RoundCard({
  round,
  year,
  fmt,
  nextSession,
  now,
  onShowResult,
}: {
  round: ScheduleRound;
  year: number;
  fmt: TimeFormatter;
  nextSession: Session | null;
  now: number;
  onShowResult: (session: Session) => void;
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
      data-meeting-key={meeting.meeting_key}
      className={`flex scroll-mt-3 flex-col overflow-hidden rounded-sm border bg-surface ${
        round.isNext ? "border-f1red/80 ring-1 ring-f1red/40" : "border-panel"
      } ${round.status === "completed" || round.status === "cancelled" ? "opacity-80" : ""}`}
    >
      <header className="flex items-start gap-3 border-b border-panel px-3 py-2.5">
        {flagUrl ? (
          <img
            src={flagUrl}
            alt=""
            className="mt-0.5 h-4 w-6 shrink-0 rounded-sm border border-fg/20 object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="mt-0.5 h-4 w-6 shrink-0 rounded-sm bg-panel" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-tiny font-black uppercase tracking-widest">
            <span className={round.isNext ? "text-f1red" : "text-muted"}>
              {kicker}
            </span>
            {round.isSprint && (
              <span className="rounded-sm border border-yellow-line px-1 text-yellow-fg">
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
          <h2 className="truncate text-sm font-bold text-fg">
            {meeting.meeting_name}
          </h2>
          <div className="truncate text-small text-muted">
            {meeting.circuit_short_name} · {meeting.location}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-small text-fg/85">
          {fmt.range(meeting.date_start, meeting.date_end, meeting.gmt_offset)}
          {round.isNext && nextSession && (
            <div className="mt-0.5 text-caption text-f1red">
              {new Date(nextSession.date_start).getTime() > now
                ? `${nextSession.session_name} in ${formatCountdown(
                    new Date(nextSession.date_start).getTime() - now,
                  )}`
                : `${nextSession.session_name} now`}
            </div>
          )}
        </div>
      </header>
      {/* Grows to fill the stretched card, so the fastest lap and sessions
          line up at the bottom across a row even when facts are missing. */}
      <CircuitSummary meeting={meeting} year={year} className="flex-1" />
      {round.sessions.length > 0 ? (
        <div className="divide-y divide-panel/60 py-0.5">
          {round.sessions.map((item) => (
            <SessionRow
              key={item.session.session_key}
              item={item}
              year={year}
              fmt={fmt}
              onShowResult={onShowResult}
            />
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-small text-muted">
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
  const [resultSession, setResultSession] = useState<Session | null>(null);

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
  const isLoading = meetingsQ.isPending || sessionsQ.isPending;
  // Wait for sessions too: until they arrive, statuses come from meeting dates.
  const focusKey = isLoading
    ? null
    : (scheduleFocusRound(schedule.rounds)?.meeting.meeting_key ?? null);

  // Open on the current (or latest) race weekend, once per season — not on
  // every clock tick, so it never fights the user's own scrolling.
  const scrolledForYear = useRef<number | null>(null);
  useEffect(() => {
    if (focusKey === null || scrolledForYear.current === year) return;
    scrolledForYear.current = year;
    const card = listRef.current?.querySelector(`[data-meeting-key="${focusKey}"]`);
    card?.scrollIntoView?.({ block: "start" });
  }, [focusKey, year]);
  const isError = meetingsQ.isError;

  return (
    <div className="flex flex-col bg-track md:h-full md:overflow-hidden">
      <h1 className="sr-only">{`F1 ${year} season schedule`}</h1>
      <div className={PICKER_BAR}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4">
          <span className="font-mono text-small text-muted">
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
                className={`px-2 py-1 text-caption font-bold uppercase tracking-wider transition-colors ${
                  timeMode === mode
                    ? "bg-f1red text-white"
                    : "text-muted hover:text-fg"
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
                onShowResult={setResultSession}
              />
            ))}
          </div>
        </div>
      )}

      {resultSession && (
        <SessionResultDialog
          session={resultSession}
          meeting={meetingsQ.data?.find(
            (m) => m.meeting_key === resultSession.meeting_key,
          )}
          onClose={() => setResultSession(null)}
        />
      )}
    </div>
  );
}
