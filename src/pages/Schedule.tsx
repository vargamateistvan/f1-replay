import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  CalendarDays,
  Clapperboard,
  Earth,
  LayoutGrid,
  ListOrdered,
  Play,
} from "lucide-react";
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
import { HighlightsDialog } from "@/components/HighlightsDialog";
import { buttonClass } from "@/components/Button/buttonClass";
import { parseGmtOffsetToMinutes } from "@/components/TrackMap/trackMapFormat";
import { PICKER_BAR } from "@/components/Nav/pickerStyles";
import { DEFAULT_YEAR, SCHEDULE_CLOCK_TICK_MS } from "@/constants";
import {
  buildSeasonSchedule,
  countdownParts,
  scheduleFocusRound,
  formatCountdown,
  type ScheduleRound,
  type ScheduleSession,
} from "@/utils/schedule";
import { replaceHistorySearchParams, replayPath, toSafeExternalUrl } from "@/utils/url";
import { getSessionHighlight } from "@/data/sessionHighlights";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import {
  SCHEDULE_OUTLINE_ARROW_FRACTION,
  SCHEDULE_OUTLINE_H,
  SCHEDULE_OUTLINE_PAD,
  SCHEDULE_OUTLINE_W,
} from "@/constants";
import { circuitThumbnail } from "@/utils/circuitInfo";

// The world map (land outline, circuit positions) is its own chunk.
const ScheduleMap = lazy(() =>
  import("@/components/ScheduleMap").then((m) => ({ default: m.ScheduleMap })),
);

type ViewMode = "cards" | "map" | "calendar";
const VIEW_MODES: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: "cards", label: "Cards", Icon: LayoutGrid },
  { mode: "map", label: "Map", Icon: Earth },
  { mode: "calendar", label: "Calendar", Icon: CalendarDays },
];
const MAP_PLACEHOLDER = (
  <div
    role="status"
    aria-label="Loading map"
    className="h-[55vh] min-h-64 animate-pulse bg-sunken md:h-auto md:flex-1"
  />
);

type TimeMode = "local" | "track";
const TIME_MODES: TimeMode[] = ["local", "track"];
const TIME_MODE_LABEL: Record<TimeMode, string> = {
  local: "Your time",
  track: "Track time",
};

const CHIP = "px-1.5 py-0.5 text-tiny font-black uppercase tracking-widest";
const CALENDAR_TOOLTIP_CLASS =
  "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[180px] -translate-x-1/2 whitespace-normal break-words rounded-sm border border-panel bg-sunken px-2 py-1 text-center text-caption font-black uppercase tracking-wider text-fg shadow-[0_8px_20px_rgba(0,0,0,0.45)] light:shadow-[0_8px_20px_rgba(15,23,42,0.18)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100";

function LiveDot() {
  return (
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-white motion-safe:animate-pulse"
    />
  );
}

// Race and sprint rows lead the weekend; practice and qualifying sit back.
const isMainEvent = (session: Session) =>
  session.session_type === "Race" || session.session_type === "Sprint";

function roundKicker(round: ScheduleRound): string {
  if (round.isTesting) return "Testing";
  return round.round !== null ? `Round ${round.round}` : "—";
}

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
  /** Date block parts: "06–08" + "NOV", or "30–01" + "OCT–NOV". */
  block: (
    startIso: string,
    endIso: string,
    gmtOffset: string,
  ) => { days: string; month: string };
}

interface SessionTimeFormat {
  label: string;
  formatter: TimeFormatter;
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
  const dayNumFmt = new Intl.DateTimeFormat(undefined, { day: "2-digit", ...tz });
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short", ...tz });
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
    block: (startIso, endIso, off) => {
      const start = shift(startIso, off);
      const end = shift(endIso, off);
      const [d1, d2] = [dayNumFmt.format(start), dayNumFmt.format(end)];
      const [m1, m2] = [monthFmt.format(start), monthFmt.format(end)].map((m) =>
        m.replace(".", "").toUpperCase(),
      );
      return {
        days: d1 === d2 && m1 === m2 ? d1 : `${d1}–${d2}`,
        month: m1 === m2 ? m1 : `${m1}–${m2}`,
      };
    },
  };
}

function SessionRow({
  item,
  year,
  timeFormats,
  onShowResult,
  onShowHighlights,
}: {
  item: ScheduleSession;
  year: number;
  timeFormats: SessionTimeFormat[];
  onShowResult: (session: Session) => void;
  onShowHighlights: (session: Session) => void;
}) {
  const { session, status } = item;
  const canReplay = status === "completed" || status === "live";
  const hasResult = status === "completed";
  const highlight = hasResult ? getSessionHighlight(session.session_key) : null;
  const actionClass = buttonClass("quiet", "sm", "h-8 w-[4.5rem] bg-track/50");
  const main = isMainEvent(session);
  return (
    <div
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 text-small sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-2 ${
        status === "live" ? "bg-f1red/10" : ""
      } ${
        status === "live" || main
          ? "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-f1red"
          : ""
      }`}
    >
      <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`break-words uppercase tracking-wider ${
            status === "cancelled"
              ? "font-bold text-muted line-through"
              : main
                ? "font-black text-fg"
                : "font-bold text-fg/80"
          }`}
        >
          {session.session_name}
        </span>
        {status === "live" && (
          <span className={`inline-flex items-center gap-1 bg-f1red text-white ${CHIP}`}>
            <LiveDot />
            Live
          </span>
        )}
      </div>
      <div className="col-span-2 row-start-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:row-auto">
        {timeFormats.map(({ label, formatter }) => (
          <div key={label}>
            <span className="block whitespace-nowrap text-micro font-bold uppercase tracking-widest text-faint">
              {label}
            </span>
            <span className="mt-0.5 block whitespace-nowrap font-mono text-tiny tabular-nums text-fg/85">
              {formatter.day(session.date_start, session.gmt_offset)}{" "}
              {formatter.time(session.date_start, session.gmt_offset)}
            </span>
          </div>
        ))}
      </div>
      {(canReplay || hasResult) && (
        <div className="col-start-2 row-start-1 flex w-auto items-center justify-end gap-1.5 sm:col-span-1 sm:col-start-auto sm:row-auto sm:w-[11.75rem] sm:shrink-0 sm:justify-start">
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
          {highlight && (
            <button
              type="button"
              onClick={() => onShowHighlights(session)}
              aria-label={`${session.session_name} highlights`}
              title="Highlights"
              className={buttonClass("quiet", "sm", "h-8 w-8 bg-track/50 px-0")}
            >
              <Clapperboard aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
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
  timeFormats,
  nextSession,
  now,
  onShowResult,
  onShowHighlights,
}: {
  round: ScheduleRound;
  year: number;
  fmt: TimeFormatter;
  timeFormats: SessionTimeFormat[];
  nextSession: Session | null;
  now: number;
  onShowResult: (session: Session) => void;
  onShowHighlights: (session: Session) => void;
}) {
  const { meeting, status } = round;
  const flagUrl = toSafeExternalUrl(meeting.country_flag);
  const live = status === "live";
  const highlighted = live || round.isNext;
  const done = status === "completed" || status === "cancelled";
  const date = fmt.block(meeting.date_start, meeting.date_end, meeting.gmt_offset);
  const nextStart = nextSession ? new Date(nextSession.date_start).getTime() : null;
  return (
    <article
      data-next-round={round.isNext || undefined}
      data-meeting-key={meeting.meeting_key}
      className={`flex scroll-mt-3 flex-col overflow-hidden rounded-sm border bg-surface ${
        highlighted ? "border-f1red" : "border-panel"
      }`}
    >
      {highlighted && (
        <div className="flex h-6 items-center justify-between gap-2 bg-f1red px-3 text-tiny font-black uppercase tracking-widest text-white">
          <span className="flex items-center gap-1.5">
            {live && <LiveDot />}
            {live ? "Live weekend" : round.isTesting ? "Up next" : "Next race"}
          </span>
          {nextSession && nextStart !== null && (
            <span className="truncate font-mono font-bold normal-case tracking-normal">
              {nextStart > now
                ? `${nextSession.session_name} in ${formatCountdown(nextStart - now)}`
                : `${nextSession.session_name} now`}
            </span>
          )}
        </div>
      )}
      <header className="flex items-stretch border-b border-panel">
        <div
          aria-label={fmt.range(meeting.date_start, meeting.date_end, meeting.gmt_offset)}
          className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 border-r border-panel px-1 py-2.5"
        >
          <span
            aria-hidden="true"
            className={`whitespace-nowrap text-base font-black leading-none tabular-nums ${
              done ? "text-muted" : "text-fg"
            }`}
          >
            {date.days}
          </span>
          <span
            aria-hidden="true"
            className={`whitespace-nowrap ${CHIP} ${
              highlighted ? "bg-f1red text-white" : done ? "bg-panel text-muted" : "bg-panel text-fg"
            }`}
          >
            {date.month}
          </span>
        </div>
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-tiny font-black uppercase tracking-widest">
            <span className={highlighted ? "text-f1red-fg" : "text-muted"}>
              {roundKicker(round)}
            </span>
            {round.isSprint && (
              <span className={`border border-yellow-line bg-yellow-tint text-yellow-fg ${CHIP}`}>
                Sprint
              </span>
            )}
            {status === "cancelled" && (
              <span className={`bg-panel text-muted ${CHIP}`}>Cancelled</span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {flagUrl ? (
              <img
                src={flagUrl}
                alt=""
                className="h-3.5 w-5 shrink-0 border border-fg/20 object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="h-3.5 w-5 shrink-0 bg-panel" />
            )}
            <h2
              className={`truncate text-sm font-black uppercase tracking-wider ${
                status === "cancelled" ? "text-muted line-through" : "text-fg"
              }`}
            >
              {meeting.meeting_name}
            </h2>
          </div>
          <div className="mt-0.5 truncate text-small text-muted">
            {meeting.circuit_short_name} · {meeting.location}
          </div>
        </div>
      </header>
      {/* Grows to fill the stretched card, so the sessions line up at the
          bottom across a row even when facts are missing. */}
      <CircuitSummary meeting={meeting} year={year} className="flex-1" />
      {round.sessions.length > 0 ? (
        <div className="divide-y divide-panel/60">
          {round.sessions.map((item) => (
            <SessionRow
              key={item.session.session_key}
              item={item}
              year={year}
              timeFormats={timeFormats}
              onShowResult={onShowResult}
              onShowHighlights={onShowHighlights}
            />
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-small uppercase tracking-wider text-muted">
          {status === "cancelled" ? "Event cancelled" : "Session times TBC"}
        </div>
      )}
    </article>
  );
}

interface CalendarMonth {
  key: number;
  label: string;
  rounds: ScheduleRound[];
}

function buildCalendarMonths(rounds: ScheduleRound[]): CalendarMonth[] {
  if (rounds.length === 0) return [];
  const monthIndex = (round: ScheduleRound) => {
    const date = new Date(round.meeting.date_start);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  };
  const firstMonth = Math.min(...rounds.map(monthIndex));
  const lastMonth = Math.max(...rounds.map(monthIndex));
  const byMonth = new Map<number, ScheduleRound[]>();
  for (const round of rounds) {
    const key = monthIndex(round);
    const monthRounds = byMonth.get(key) ?? [];
    monthRounds.push(round);
    byMonth.set(key, monthRounds);
  }
  return Array.from({ length: lastMonth - firstMonth + 1 }, (_, offset) => {
    const key = firstMonth + offset;
    const date = new Date(Date.UTC(Math.floor(key / 12), key % 12, 1));
    return {
      key,
      label: new Intl.DateTimeFormat(undefined, {
        month: "long",
        timeZone: "UTC",
      })
        .format(date)
        .toUpperCase(),
      rounds: byMonth.get(key) ?? [],
    };
  });
}

function CalendarTrack({ round, year }: { round: ScheduleRound; year: number }) {
  const { data: geometry } = useCircuitGeometry(round.meeting.circuit_key, year);
  const thumbnail = useMemo(
    () =>
      geometry
        ? circuitThumbnail(
            geometry,
            SCHEDULE_OUTLINE_W,
            SCHEDULE_OUTLINE_H,
            SCHEDULE_OUTLINE_PAD,
            SCHEDULE_OUTLINE_ARROW_FRACTION,
          )
        : null,
    [geometry],
  );
  return (
    <div aria-hidden="true" className="flex h-12 items-center justify-center text-fg/70">
      {thumbnail ? (
        <svg
          viewBox={`0 0 ${SCHEDULE_OUTLINE_W} ${SCHEDULE_OUTLINE_H}`}
          className="h-full w-full"
        >
          <path
            d={thumbnail.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <line
            {...thumbnail.startLine}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <span className="h-8 w-full rounded-sm bg-panel/30" />
      )}
    </div>
  );
}

function TruncatedName({ name }: { name: string }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    const updateOverflow = () => setIsTruncated(element.scrollWidth > element.clientWidth);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [name]);

  return (
    <>
      <span
        ref={nameRef}
        data-calendar-name
        className="truncate text-caption font-black uppercase tracking-wider"
      >
        {name}
      </span>
      {isTruncated && (
        <span role="tooltip" className={CALENDAR_TOOLTIP_CLASS}>
          {name}
        </span>
      )}
    </>
  );
}

function CalendarRound({
  round,
  year,
  fmt,
  selected,
  onSelect,
}: {
  round: ScheduleRound;
  year: number;
  fmt: TimeFormatter;
  selected: boolean;
  onSelect: () => void;
}) {
  const date = fmt.block(
    round.meeting.date_start,
    round.meeting.date_end,
    round.meeting.gmt_offset,
  );
  const flagUrl = toSafeExternalUrl(round.meeting.country_flag);
  const next = round.isNext || round.status === "live";
  const number = round.round === null ? (round.isTesting ? "T" : "—") : `R ${round.round}`;
  return (
    <button
      type="button"
      data-calendar-round={round.meeting.meeting_key}
      aria-pressed={selected}
      aria-label={`${roundKicker(round)} ${round.meeting.meeting_name}, ${date.month} ${date.days}`}
      onClick={onSelect}
      className={`group relative flex min-h-32 w-full flex-col gap-1 border p-2 text-left transition-colors ${
        selected
          ? "border-f1red bg-surface"
          : next
            ? "border-f1red/70 bg-surface/70 hover:bg-surface"
            : "border-panel/60 bg-track/40 hover:border-fg/40 hover:bg-surface/70"
      } ${round.status === "completed" || round.status === "cancelled" ? "text-muted" : "text-fg"}`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="font-mono text-compact font-bold tabular-nums">{number}</span>
        {round.status === "cancelled" ? (
          <span className={`${CHIP} bg-panel text-muted`}>Cancelled</span>
        ) : round.status === "live" ? (
          <span className={`${CHIP} bg-f1red text-white`}>Live</span>
        ) : round.isNext ? (
          <span className={`${CHIP} bg-panel text-fg`}>Next</span>
        ) : null}
      </span>
      <CalendarTrack round={round} year={year} />
      <span className="flex min-w-0 items-center gap-1">
        {flagUrl && (
          <img
            src={flagUrl}
            alt=""
            className="h-3 w-5 shrink-0 border border-fg/20 object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        <TruncatedName name={round.meeting.meeting_name} />
      </span>
      <span className="font-mono text-micro font-bold uppercase tracking-widest text-muted">
        {date.month} {date.days}
      </span>
    </button>
  );
}

function CalendarRoundDetails({
  round,
  year,
  fmt,
  timeFormats,
  onShowResult,
  onShowHighlights,
}: {
  round: ScheduleRound;
  year: number;
  fmt: TimeFormatter;
  timeFormats: SessionTimeFormat[];
  onShowResult: (session: Session) => void;
  onShowHighlights: (session: Session) => void;
}) {
  const { meeting } = round;
  return (
    <section
      aria-label="Selected round"
      className="flex shrink-0 flex-col items-start gap-2 border-t border-panel bg-surface px-3 py-2.5 sm:px-4"
    >
      <div className="w-full min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-black uppercase tracking-wider text-fg sm:truncate">
            {roundKicker(round)} {meeting.meeting_name}
          </h2>
          <span className="font-mono text-tiny font-bold uppercase tracking-wider text-muted">
            {fmt.range(meeting.date_start, meeting.date_end, meeting.gmt_offset)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-small text-muted">
          {meeting.circuit_short_name} · {meeting.location}
        </p>
      </div>
      {round.sessions.length > 0 ? (
        <div className="w-full divide-y divide-panel/60">
          {round.sessions.map((item) => (
            <SessionRow
              key={item.session.session_key}
              item={item}
              year={year}
              timeFormats={timeFormats}
              onShowResult={onShowResult}
              onShowHighlights={onShowHighlights}
            />
          ))}
        </div>
      ) : (
        <p className="text-small uppercase tracking-wider text-muted">
          {round.status === "cancelled" ? "Event cancelled" : "Session times TBC"}
        </p>
      )}
    </section>
  );
}

function CalendarView({
  months,
  selectedRound,
  year,
  fmt,
  timeFormats,
  onSelect,
  onShowResult,
  onShowHighlights,
}: {
  months: CalendarMonth[];
  selectedRound: ScheduleRound | null;
  year: number;
  fmt: TimeFormatter;
  timeFormats: SessionTimeFormat[];
  onSelect: (meetingKey: number) => void;
  onShowResult: (session: Session) => void;
  onShowHighlights: (session: Session) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid w-full min-w-[48rem] grid-flow-col auto-cols-[minmax(7rem,1fr)] border-b border-panel">
          {months.map((month) => (
            <section
              key={month.key}
              aria-label={month.label}
              className="min-w-0 border-r border-panel/60 first:border-l"
            >
              <h2 className="sticky top-0 z-10 border-b border-panel bg-track px-2 py-2 text-caption font-black uppercase tracking-wider text-muted">
                {month.label}
              </h2>
              <div className="flex min-h-56 flex-col gap-1.5 p-1.5">
                {month.rounds.map((round) => (
                  <CalendarRound
                    key={round.meeting.meeting_key}
                    round={round}
                    year={year}
                    fmt={fmt}
                    selected={
                      selectedRound?.meeting.meeting_key === round.meeting.meeting_key
                    }
                    onSelect={() => onSelect(round.meeting.meeting_key)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {selectedRound && (
        <CalendarRoundDetails
          round={selectedRound}
          year={year}
          fmt={fmt}
          timeFormats={timeFormats}
          onShowResult={onShowResult}
          onShowHighlights={onShowHighlights}
        />
      )}
    </div>
  );
}

// One segment per numbered round: completed red, the live/next round white.
function SeasonProgress({ rounds }: { rounds: ScheduleRound[] }) {
  const numbered = rounds.filter((r) => r.round !== null);
  const completed = numbered.filter((r) => r.status === "completed").length;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-tiny font-bold uppercase tracking-widest text-muted">Season</span>
      <div
        role="progressbar"
        aria-label="Season progress"
        aria-valuemin={0}
        aria-valuemax={numbered.length}
        aria-valuenow={completed}
        aria-valuetext={`${completed} of ${numbered.length} rounds completed`}
        className="flex h-1.5 w-28 gap-px sm:w-44"
      >
        {numbered.map((r) => (
          <span
            key={r.meeting.meeting_key}
            className={`flex-1 ${
              r.status === "completed"
                ? "bg-f1red"
                : r.isNext || r.status === "live"
                  ? "bg-fg"
                  : "bg-line"
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-small tabular-nums text-fg">
        {completed}
        <span className="text-muted">/{numbered.length}</span>
      </span>
    </div>
  );
}

function CountdownTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-11 flex-col items-center border border-panel bg-track px-1.5 py-1">
      <span className="font-mono text-lg font-bold leading-tight tabular-nums text-fg">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-micro font-bold uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}

// The live or next round, pinned above the cards with a countdown to its
// next session.
function NextRoundStrip({
  round,
  nextSession,
  now,
  fmt,
  year,
  onShowCard,
  onShowOnMap,
  onShowCalendar,
}: {
  round: ScheduleRound;
  nextSession: Session | null;
  now: number;
  fmt: TimeFormatter;
  year: number;
  onShowCard: () => void;
  onShowOnMap: () => void;
  onShowCalendar: () => void;
}) {
  const { meeting } = round;
  const flagUrl = toSafeExternalUrl(meeting.country_flag);
  const live = round.status === "live";
  const nextStart = nextSession ? new Date(nextSession.date_start).getTime() : null;
  const sessionLive = nextSession !== null && nextStart !== null && nextStart <= now;
  const parts = countdownParts(nextStart !== null ? nextStart - now : 0);
  return (
    <section
      aria-label={live ? "Live weekend" : "Up next"}
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-l-4 border-panel border-l-f1red bg-surface px-3 py-3 sm:px-4"
    >
      <div className="flex w-full min-w-0 items-center gap-3 lg:w-auto lg:flex-1">
        {flagUrl && (
          <img
            src={flagUrl}
            alt=""
            className="h-6 w-9 shrink-0 border border-fg/20 object-cover"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-tiny font-black uppercase tracking-widest">
            <span className={`inline-flex items-center gap-1 bg-f1red text-white ${CHIP}`}>
              {live && <LiveDot />}
              {live ? "Live now" : "Up next"}
            </span>
            <span className="text-muted">{roundKicker(round)}</span>
            {round.isSprint && (
              <span className={`border border-yellow-line bg-yellow-tint text-yellow-fg ${CHIP}`}>
                Sprint
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-lg font-black uppercase leading-tight tracking-wider text-fg sm:text-xl">
            {meeting.meeting_name}
          </p>
          <p className="truncate text-small text-muted">
            {meeting.circuit_short_name} ·{" "}
            <span className="font-mono tabular-nums text-fg/85">
              {fmt.range(meeting.date_start, meeting.date_end, meeting.gmt_offset)}
            </span>
          </p>
        </div>
      </div>

      {nextSession && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-tiny font-bold uppercase tracking-widest text-muted">
              {sessionLive ? "On track now" : "Starts in"}
            </div>
            <div className="text-small font-black uppercase tracking-wider text-fg">
              {nextSession.session_name}
            </div>
          </div>
          {sessionLive ? (
            <Link
              to={replayPath({
                year,
                meetingKey: nextSession.meeting_key,
                sessionKey: nextSession.session_key,
              })}
              className={buttonClass("primary")}
            >
              <Play aria-hidden="true" className="h-3 w-3" />
              Watch
            </Link>
          ) : (
            <div
              className="flex gap-1"
              role="timer"
              aria-label={`${nextSession.session_name} in ${formatCountdown(nextStart! - now)}`}
            >
              <CountdownTile value={parts.days} label="Days" />
              <CountdownTile value={parts.hours} label="Hrs" />
              <CountdownTile value={parts.minutes} label="Min" />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1.5">
        <button type="button" onClick={onShowCard} className={buttonClass("quiet", "sm", "h-8")}>
          <ArrowDown aria-hidden="true" className="h-3 w-3" />
          Session times
        </button>
        <button type="button" onClick={onShowOnMap} className={buttonClass("quiet", "sm", "h-8")}>
          <Earth aria-hidden="true" className="h-3 w-3" />
          Map
        </button>
        <button type="button" onClick={onShowCalendar} className={buttonClass("quiet", "sm", "h-8")}>
          <CalendarDays aria-hidden="true" className="h-3 w-3" />
          Calendar
        </button>
      </div>
    </section>
  );
}

export default function Schedule() {
  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const savedTimeMode = useSettings((s) => s.scheduleTimeMode);
  const [timeParam, setTimeMode] = useStringParam<TimeMode | "">("time", "");
  const timeMode: TimeMode = timeParam === "local" || timeParam === "track" ? timeParam : savedTimeMode;
  // Own param names: `view` and `meeting` belong to the replay page and the
  // nav carries the query string between pages.
  const savedView = useSettings((s) => s.scheduleViewMode);
  const setSetting = useSettings((s) => s.setSetting);
  const [viewParam, setViewParam] = useStringParam<ViewMode | "">("layout", "");
  const view: ViewMode =
    viewParam === "map" || viewParam === "cards" || viewParam === "calendar"
      ? viewParam
      : savedView;
  const [meetingParam, setMeetingParam] = useNumberParam("round", null);
  const [resultParam, setResultParam] = useNumberParam("result", null);
  const now = useNow(SCHEDULE_CLOCK_TICK_MS);
  const listRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [resultSession, setResultSession] = useState<Session | null>(null);
  const [highlightsSession, setHighlightsSession] = useState<Session | null>(null);
  const highlight = getSessionHighlight(highlightsSession?.session_key);
  const showHighlights = useCallback((session: Session) => {
    trackEvent("schedule_highlights_opened", {
      session_key: session.session_key,
      meeting_key: session.meeting_key,
      year: session.year,
    });
    setHighlightsSession(session);
  }, []);
  const closeHighlights = useCallback(() => setHighlightsSession(null), []);

  const meetingsQ = useMeetings(year);
  const sessionsQ = useSeasonSessions(year);
  const linkedResult = resultParam === null ? null :
    sessionsQ.data?.find((session) => session.session_key === resultParam) ?? null;
  const displayedResult = resultSession ?? linkedResult;
  const showResult = useCallback((session: Session) => {
    if (resultParam !== null) setResultParam(null);
    setResultSession(session);
  }, [resultParam, setResultParam]);
  const closeResult = useCallback(() => {
    setResultSession(null);
    if (resultParam !== null) setResultParam(null);
  }, [resultParam, setResultParam]);

  const schedule = useMemo(
    () => buildSeasonSchedule(meetingsQ.data ?? [], sessionsQ.data ?? [], now),
    [meetingsQ.data, sessionsQ.data, now],
  );
  const calendarMonths = useMemo(
    () => buildCalendarMonths(schedule.rounds),
    [schedule.rounds],
  );
  const fmt = useMemo(() => makeFormatter(timeMode), [timeMode]);
  const timeFormats = useMemo(
    () => [timeMode, ...TIME_MODES.filter((mode) => mode !== timeMode)].map(
      (mode) => ({
        label: TIME_MODE_LABEL[mode],
        formatter: makeFormatter(mode),
      }),
    ),
    [timeMode],
  );

  const nextRound = schedule.rounds.find((r) => r.isNext) ?? null;
  const nextSession =
    nextRound?.sessions.find((s) => s.status === "live" || s.status === "upcoming")
      ?.session ?? null;
  const isLoading = meetingsQ.isPending || sessionsQ.isPending;
  // Wait for sessions too: until they arrive, statuses come from meeting dates.
  const focusKey = isLoading
    ? null
    : (scheduleFocusRound(schedule.rounds)?.meeting.meeting_key ?? null);
  const mapSelectedKey = schedule.rounds.some((r) => r.meeting.meeting_key === meetingParam)
    ? meetingParam
    : focusKey;
  const calendarSelectedRound =
    schedule.rounds.find((r) => r.meeting.meeting_key === meetingParam) ??
    schedule.rounds.find((r) => r.meeting.meeting_key === focusKey) ??
    null;

  // Open on the current (or latest) race weekend, once per season — not on
  // every clock tick, so it never fights the user's own scrolling.
  const scrolledForYear = useRef<number | null>(null);
  useEffect(() => {
    if (focusKey === null || view !== "cards" || scrolledForYear.current === year) return;
    scrolledForYear.current = year;
    const card = listRef.current?.querySelector(`[data-meeting-key="${focusKey}"]`);
    card?.scrollIntoView?.({ block: "start" });
  }, [focusKey, year, view]);

  useEffect(() => {
    if (view !== "calendar" || calendarSelectedRound === null) return;
    calendarRef.current
      ?.querySelector(`[data-calendar-round="${calendarSelectedRound.meeting.meeting_key}"]`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [calendarSelectedRound, view]);

  // Layout and round change together in one URL update; two separate
  // setters would each start from the same params and drop the other.
  const [, setSearchParams] = useSearchParams();
  const showRoundInLayout = (layout: "map" | "calendar", meetingKey: number) => {
    trackEvent("schedule_view_changed", { view: layout, year });
    setSetting("scheduleViewMode", layout);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("layout", layout);
        params.set("round", String(meetingKey));
        replaceHistorySearchParams(params);
        return params;
      },
      { replace: true },
    );
  };
  const showRoundOnMap = (meetingKey: number) => showRoundInLayout("map", meetingKey);
  const showRoundOnCalendar = (meetingKey: number) =>
    showRoundInLayout("calendar", meetingKey);
  const changeView = (next: ViewMode) => {
    if (next === view) return;
    trackEvent("schedule_view_changed", { view: next, year });
    setSetting("scheduleViewMode", next);
    setViewParam(next);
  };
  const renderRoundCard = (round: ScheduleRound) => (
    <RoundCard
      round={round}
      year={year}
      fmt={fmt}
      timeFormats={timeFormats}
      nextSession={round.isNext ? nextSession : null}
      now={now}
      onShowResult={showResult}
      onShowHighlights={showHighlights}
    />
  );
  const isError = meetingsQ.isError;

  return (
    <div className="flex flex-col bg-track md:h-full md:overflow-hidden">
      <h1 className="sr-only">{`F1 ${year} season schedule`}</h1>
      <div className={PICKER_BAR}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4">
          {isLoading ? (
            <span className="text-tiny font-bold uppercase tracking-widest text-muted">
              Loading calendar…
            </span>
          ) : (
            <SeasonProgress rounds={schedule.rounds} />
          )}
          <div
            role="radiogroup"
            aria-label="Layout"
            className="ml-auto flex overflow-hidden rounded-sm border border-panel"
          >
            {VIEW_MODES.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={view === mode}
                onClick={() => changeView(mode)}
                className={`flex items-center gap-1 px-2 py-1 text-caption font-bold uppercase tracking-wider transition-colors ${
                  view === mode ? "bg-f1red text-white" : "text-muted hover:text-fg"
                }`}
              >
                <Icon aria-hidden="true" className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          <div
            role="radiogroup"
            aria-label="Time zone"
            className="flex overflow-hidden rounded-sm border border-panel"
          >
            {TIME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={timeMode === mode}
                onClick={() => {
                  setSetting("scheduleTimeMode", mode);
                  setTimeMode(mode);
                }}
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
      ) : view === "map" ? (
        isLoading ? (
          MAP_PLACEHOLDER
        ) : (
          <Suspense fallback={MAP_PLACEHOLDER}>
            <ScheduleMap
              key={year}
              rounds={schedule.rounds}
              selectedKey={mapSelectedKey}
              onSelect={setMeetingParam}
              renderRound={renderRoundCard}
            />
          </Suspense>
        )
      ) : view === "calendar" ? (
        <div ref={calendarRef} className="flex min-h-0 flex-1 flex-col">
          {isLoading ? (
            <div role="status" className="flex-1 animate-pulse bg-sunken p-4 text-small text-muted">
              Loading calendar…
            </div>
          ) : (
            <CalendarView
              months={calendarMonths}
              selectedRound={calendarSelectedRound}
              year={year}
              fmt={fmt}
              timeFormats={timeFormats}
              onSelect={setMeetingParam}
              onShowResult={showResult}
              onShowHighlights={showHighlights}
            />
          )}
        </div>
      ) : (
        <>
          {nextRound && (
            <NextRoundStrip
              round={nextRound}
              nextSession={nextSession}
              now={now}
              fmt={fmt}
              year={year}
              onShowCard={() => {
                trackEvent("schedule_next_round_action", { action: "session_times" });
                listRef.current
                  ?.querySelector(`[data-meeting-key="${nextRound.meeting.meeting_key}"]`)
                  ?.scrollIntoView?.({ block: "start", behavior: "smooth" });
              }}
              onShowOnMap={() => {
                trackEvent("schedule_next_round_action", { action: "map" });
                showRoundOnMap(nextRound.meeting.meeting_key);
              }}
              onShowCalendar={() => {
                trackEvent("schedule_next_round_action", { action: "calendar" });
                showRoundOnCalendar(nextRound.meeting.meeting_key);
              }}
            />
          )}
          <div ref={listRef} className="md:min-h-0 md:flex-1 md:overflow-auto">
            <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
              {schedule.rounds.map((round) => (
                <RoundCard
                  key={round.meeting.meeting_key}
                  round={round}
                  year={year}
                  fmt={fmt}
                  timeFormats={timeFormats}
                  nextSession={round.isNext ? nextSession : null}
                  now={now}
                  onShowResult={showResult}
                  onShowHighlights={showHighlights}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {displayedResult && (
        <SessionResultDialog
          session={displayedResult}
          meeting={meetingsQ.data?.find(
            (m) => m.meeting_key === displayedResult.meeting_key,
          )}
          onClose={closeResult}
        />
      )}

      {highlightsSession && highlight && (
        <HighlightsDialog
          highlight={highlight}
          sessionKey={highlightsSession.session_key}
          sessionName={highlightsSession.session_name}
          meta={`${highlightsSession.circuit_short_name} · ${highlightsSession.year}`}
          subtitle={
            meetingsQ.data?.find((m) => m.meeting_key === highlightsSession.meeting_key)
              ?.meeting_name
          }
          onClose={closeHighlights}
        />
      )}
    </div>
  );
}
