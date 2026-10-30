import {
  NavLink,
  useSearchParams,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLatestMeeting,
  useLatestSession,
  useMeetings,
  useSessions,
} from "@/hooks/useSession";
import { api } from "@/api/endpoints";
import type { Meeting, Session } from "@/api/types";
import { isAuthError } from "@/api/client";
import { isSessionLive } from "@/utils/live";
import { DEFAULT_YEAR, CURRENT_SEASON_STALE_MS, YEARS } from "@/constants";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { AppLogo } from "@/components/AppLogo";
import { LiveDataNotice } from "@/components/LiveDataNotice";
import { useTimeline } from "@/timeline/clock";
import { useSettings } from "@/stores/settings";
import { TOUR_TARGET } from "@/components/AppTour/targets";
import {
  toDisplayAltitudeM,
  altitudeUnitLabel,
  toDisplayDistanceKm,
  distanceUnitLabel,
} from "@/utils/units";
import {
  fetchCircuitFactsFromApi,
  type CircuitFacts,
} from "@/api/circuitFactsLookup";
import { replaceHistorySearchParams, toSafeExternalUrl } from "@/utils/url";
import { trackEvent } from "@/lib/analytics";
import {
  ChevronDown,
  Settings as SettingsIcon,
  Maximize,
  Minimize,
} from "lucide-react";
import { EventPicker } from "./EventPicker";

export type MainView = "leaderboard" | "tracker" | "commentary";

const VIEW_TABS: { id: MainView; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "tracker", label: "Driver Tracker" },
  { id: "commentary", label: "Commentary" },
];
const VALID_VIEWS = new Set<MainView>(["leaderboard", "tracker", "commentary"]);

const TRACK_FACTS_ENABLED = false;
// How old cached calendar/alias data may be before the Latest button refetches.
const LATEST_MANUAL_STALE_MS = 5 * 60 * 1000;

// Pages that only need ?year= (no meeting/session picker).
function isSeasonPath(pathname: string) {
  return pathname === "/schedule" || pathname.startsWith("/standings");
}

function isRaceWeekend(meetingName: string, officialName: string) {
  return /grand prix/i.test(meetingName) || /grand prix/i.test(officialName);
}

function parseGmtOffsetToMinutes(offset: string | null | undefined): number {
  if (!offset) return 0;
  const sign = offset.startsWith("-") ? -1 : 1;
  const raw = offset.replace(/^[-+]/, "");
  const [h = "0", m = "0", s = "0"] = raw.split(":");
  const hours = Number(h) || 0;
  const minutes = Number(m) || 0;
  const seconds = Number(s) || 0;
  return sign * (hours * 60 + minutes + Math.round(seconds / 60));
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatTwo(n: number): string {
  return String(n).padStart(2, "0");
}

function withOffsetUtcDate(dateIso: string, offsetMin: number): Date {
  const utcMs = new Date(dateIso).getTime();
  return new Date(utcMs + offsetMin * 60_000);
}

function formatTrackLocal(dateIso: string, offsetMin: number): string {
  const shifted = withOffsetUtcDate(dateIso, offsetMin);
  return `${formatTwo(shifted.getUTCHours())}:${formatTwo(shifted.getUTCMinutes())}`;
}

function formatTrackLocalDayMonth(dateIso: string, offsetMin: number): string {
  const shifted = withOffsetUtcDate(dateIso, offsetMin);
  return `${formatTwo(shifted.getUTCDate())} ${MONTHS_SHORT[shifted.getUTCMonth()]}`;
}

function resolveTrackOffsetMin(
  sessionOffset: string | null | undefined,
  meetingOffset: string | null | undefined,
): number {
  const sessionMin = parseGmtOffsetToMinutes(sessionOffset);
  if (sessionOffset && sessionOffset.trim().length > 0) return sessionMin;
  return parseGmtOffsetToMinutes(meetingOffset);
}

function clearReplayTimeParam(params: URLSearchParams) {
  params.delete("t");
  return params;
}

export function Nav() {
  const openSettings = useSettings((s) => s.openModal);
  const openHelp = useSettings((s) => s.openHelp);
  const setSetting = useSettings((s) => s.setSetting);
  const metricSystem = useSettings((s) => s.metricSystem);
  const showNextRaceWeekendBanner = useSettings(
    (s) => s.showNextRaceWeekendBanner,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showCircuitFacts, setShowCircuitFacts] = useState(false);
  const [apiFacts, setApiFacts] = useState<CircuitFacts | null>(null);
  const [apiFactsLoading, setApiFactsLoading] = useState(false);
  const [showNextAgenda, setShowNextAgenda] = useState(false);
  const [brokenCircuitImages, setBrokenCircuitImages] = useState<
    Record<string, true>
  >({});
  const [selectLatestSessionOnLoad, setSelectLatestSessionOnLoad] =
    useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && document.fullscreenElement != null,
  );

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement != null);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);
  const autoLatestBootstrappedRef = useRef(false);

  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);
  const [view] = useStringParam<MainView>("view", "tracker");

  const meetings = useMeetings(year);
  // Observe-only: selectLatestEvent fetches these on demand; the observers
  // just surface an auth failure without spending two requests on every load.
  const latestMeetingQuery = useLatestMeeting({ enabled: false });
  const latestSessionQuery = useLatestSession({ enabled: false });
  // Fetch the current calendar year only when the next-race banner needs it
  // and the user is browsing a different year.
  const currentCalendarYear = new Date().getFullYear();
  const needsCurrentYearMeetings =
    showNextRaceWeekendBanner && year !== currentCalendarYear;
  const currentYearMeetings = useMeetings(currentCalendarYear, {
    enabled: needsCurrentYearMeetings,
  });
  const sessions = useSessions(meetingKey);
  const authError = [
    meetings.error,
    sessions.error,
    latestMeetingQuery.error,
    latestSessionQuery.error,
  ].find((e) => isAuthError(e));
  const authFailed = authError !== undefined;
  const queryClient = useQueryClient();
  const [isSelectingLatest, setIsSelectingLatest] = useState(false);

  const selectedMeeting = meetings.data?.find(
    (m) => m.meeting_key === meetingKey,
  );
  const selectedSession = sessions.data?.find(
    (s) => s.session_key === sessionKey,
  );
  const selectedCircuitImageUrl = toSafeExternalUrl(
    selectedMeeting?.circuit_image,
  );
  const selectedCountryFlagUrl = toSafeExternalUrl(
    selectedMeeting?.country_flag,
  );
  const selectedCircuitInfoUrl = toSafeExternalUrl(
    selectedMeeting?.circuit_info_url,
  );
  const isCircuitImageBroken = Boolean(
    selectedCircuitImageUrl && brokenCircuitImages[selectedCircuitImageUrl],
  );
  const visibleFacts = apiFacts;
  const live = isSessionLive(selectedSession);

  function markCircuitImageBroken(url: string | null | undefined) {
    if (!url) return;
    setBrokenCircuitImages((prev) => {
      if (prev[url]) return prev;
      return { ...prev, [url]: true };
    });
  }

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setShowCircuitFacts(false);
  }, [selectedMeeting?.meeting_key]);

  useEffect(() => {
    let cancelled = false;
    setApiFacts(null);
    setApiFactsLoading(false);

    async function loadApiFacts() {
      if (!TRACK_FACTS_ENABLED || !selectedMeeting) return;
      setApiFactsLoading(true);
      try {
        const fetched = await fetchCircuitFactsFromApi(
          selectedMeeting.circuit_short_name,
          selectedMeeting.country_name,
        );
        if (!cancelled && fetched) setApiFacts(fetched);
      } finally {
        if (!cancelled) setApiFactsLoading(false);
      }
    }

    void loadApiFacts();
    return () => {
      cancelled = true;
    };
  }, [selectedMeeting]);

  useEffect(() => {
    if (!showCircuitFacts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowCircuitFacts(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCircuitFacts]);

  // Automatically select the latest session once sessions load
  useEffect(() => {
    if (
      selectLatestSessionOnLoad &&
      sessions.data &&
      sessions.data.length > 0
    ) {
      const startedSessions = sessions.data.filter(
        (s) => new Date(s.date_start).getTime() <= nowMs,
      );
      const pool = startedSessions.length > 0 ? startedSessions : sessions.data;
      const liveSession = pool.find((s) => isSessionLive(s));
      const latestSession =
        liveSession ??
        pool
          .slice()
          .sort(
            (a, b) =>
              new Date(b.date_start).getTime() -
              new Date(a.date_start).getTime(),
          )[0];
      if (latestSession) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("session", String(latestSession.session_key));
          clearReplayTimeParam(next);
          replaceHistorySearchParams(next);
          return next;
        });
        setSelectLatestSessionOnLoad(false);
      }
    }
  }, [selectLatestSessionOnLoad, sessions.data, setSearchParams, nowMs]);

  const startedMeetings = useMemo(
    () =>
      (meetings.data ?? []).filter(
        (m) => !m.is_cancelled && new Date(m.date_start).getTime() <= nowMs,
      ),
    [meetings.data, nowMs],
  );

  const startedSessions = useMemo(
    () =>
      (sessions.data ?? []).filter(
        (s) => new Date(s.date_start).getTime() <= nowMs,
      ),
    [sessions.data, nowMs],
  );

  const calendarYearMeetings = useMemo(
    () =>
      year === currentCalendarYear
        ? (meetings.data ?? [])
        : (currentYearMeetings.data ?? []),
    [year, currentCalendarYear, meetings.data, currentYearMeetings.data],
  );

  const nextMeeting = useMemo(
    () =>
      calendarYearMeetings
        .filter(
          (m) =>
            !m.is_cancelled &&
            isRaceWeekend(m.meeting_name, m.meeting_official_name) &&
            new Date(m.date_start).getTime() > nowMs,
        )
        .sort(
          (a, b) =>
            new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
        )[0] ?? null,
    [calendarYearMeetings, nowMs],
  );
  const hasOngoingRaceWeekend = useMemo(
    () =>
      calendarYearMeetings.some(
        (m) =>
          !m.is_cancelled &&
          isRaceWeekend(m.meeting_name, m.meeting_official_name) &&
          new Date(m.date_start).getTime() <= nowMs &&
          nowMs <= new Date(m.date_end).getTime(),
      ),
    [calendarYearMeetings, nowMs],
  );
  const nextMeetingCountryFlagUrl = toSafeExternalUrl(
    nextMeeting?.country_flag,
  );

  const nextMeetingSessions = useSessions(nextMeeting?.meeting_key ?? null);

  const nextMeetingRound = useMemo(() => {
    if (!nextMeeting) return null;
    const heldCount = calendarYearMeetings.filter(
      (m) =>
        !m.is_cancelled &&
        isRaceWeekend(m.meeting_name, m.meeting_official_name) &&
        new Date(m.date_end).getTime() <= nowMs,
    ).length;
    return heldCount + 1;
  }, [calendarYearMeetings, nextMeeting, nowMs]);

  const nextMeetingDateRange = useMemo(() => {
    if (!nextMeeting) return null;

    const start = new Date(nextMeeting.date_start);
    const end = new Date(nextMeeting.date_end);
    const startMonth = MONTHS_SHORT[start.getUTCMonth()].toUpperCase();
    const endMonth = MONTHS_SHORT[end.getUTCMonth()].toUpperCase();
    const startDay = String(start.getUTCDate()).padStart(2, "0");
    const endDay = String(end.getUTCDate()).padStart(2, "0");

    if (startMonth === endMonth) return `${startDay} - ${endDay} ${startMonth}`;
    return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
  }, [nextMeeting]);

  const nextMeetingCountdown = useMemo(() => {
    if (!nextMeeting) return null;
    const diff = new Date(nextMeeting.date_start).getTime() - nowMs;
    const totalSeconds = Math.max(0, Math.floor(diff / 1_000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");

    return `${pad(days)}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, [nextMeeting, nowMs]);

  const nextAgendaSessions = useMemo(
    () =>
      (nextMeetingSessions.data ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
        ),
    [nextMeetingSessions.data],
  );

  function resetPlaybackToStart() {
    useTimeline.getState().reset();
  }

  function onYear(y: number) {
    if (Number.isNaN(y) || !Number.isFinite(y)) return;
    resetPlaybackToStart();
    trackEvent("nav_year_changed", { year: y });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("year", String(y));
        next.delete("meeting");
        next.delete("session");
        clearReplayTimeParam(next);
        replaceHistorySearchParams(next);
        return next;
      },
      { replace: true },
    );
  }

  function onMeeting(k: number) {
    if (Number.isNaN(k) || !Number.isFinite(k)) return;
    resetPlaybackToStart();
    trackEvent("nav_meeting_changed", { meeting_key: k });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("meeting", String(k));
        next.delete("session");
        clearReplayTimeParam(next);
        replaceHistorySearchParams(next);
        return next;
      },
      { replace: true },
    );
    setSelectLatestSessionOnLoad(true);
  }

  function onMeetingSelect(raw: string) {
    if (raw === "") {
      resetPlaybackToStart();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("meeting");
          next.delete("session");
          clearReplayTimeParam(next);
          return next;
        },
        { replace: true },
      );
      return;
    }
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) return;
    onMeeting(val);
  }

  function onSessionSelect(raw: string) {
    if (raw === "") {
      resetPlaybackToStart();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("session");
          clearReplayTimeParam(next);
          return next;
        },
        { replace: true },
      );
      return;
    }
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) return;
    resetPlaybackToStart();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("session", String(val));
        clearReplayTimeParam(next);
        return next;
      },
      { replace: true },
    );
    trackEvent("nav_session_changed", { session_key: val });
  }

  // Resolves "the latest event" from three independent sources and picks the
  // most recently started one. OpenF1's `meeting_key=latest` /
  // `session_key=latest` aliases are convenient but can lag (or be served
  // stale by a cache), so they are treated as candidates, never as the answer.
  const selectLatestEvent = useCallback(
    async (source: "auto" | "manual" = "auto") => {
      if (isSelectingLatest) return;
      setIsSelectingLatest(true);
      try {
        const now = Date.now();
        // The choice is time-driven (most recently *started* meeting/session
        // as of `now`), and the season calendar and weekend schedules are
        // published in advance, so cached lists are fine. Manual clicks only
        // refresh lists older than a few minutes; a forced round trip would
        // queue behind the client rate limiter and make the button feel dead.
        const staleTime =
          source === "manual"
            ? LATEST_MANUAL_STALE_MS
            : CURRENT_SEASON_STALE_MS;
        const safe = async <T,>(p: Promise<T>): Promise<T | undefined> => {
          try {
            return await p;
          } catch {
            return undefined;
          }
        };

        const [aliasMeetings, aliasSessions, calendar] = await Promise.all([
          safe(
            queryClient.fetchQuery({
              queryKey: ["latestMeeting"],
              queryFn: () => api.latestMeeting(),
              staleTime,
            }),
          ),
          safe(
            queryClient.fetchQuery({
              queryKey: ["latestSession"],
              queryFn: () => api.latestSession(),
              staleTime,
            }),
          ),
          safe(
            queryClient.fetchQuery({
              queryKey: ["meetings", currentCalendarYear],
              queryFn: () => api.meetings(currentCalendarYear),
              staleTime,
            }),
          ),
        ]);

        const aliasMeeting = aliasMeetings?.[0] ?? null;
        const aliasSession = aliasSessions?.[0] ?? null;
        const calendarMeetings = calendar ?? [];

        const hasStarted = (dateStart: string) =>
          new Date(dateStart).getTime() <= now;

        type Candidate = Pick<Meeting, "year" | "meeting_key" | "date_start">;
        const candidates: Candidate[] = [];
        if (aliasMeeting && !aliasMeeting.is_cancelled) {
          candidates.push(aliasMeeting);
        }
        if (aliasSession && !aliasSession.is_cancelled) {
          candidates.push(
            calendarMeetings.find(
              (m) => m.meeting_key === aliasSession.meeting_key,
            ) ?? {
              year: aliasSession.year,
              meeting_key: aliasSession.meeting_key,
              date_start: aliasSession.date_start,
            },
          );
        }
        for (const m of calendarMeetings) {
          if (!m.is_cancelled) candidates.push(m);
        }

        const target = candidates
          .filter((m) => hasStarted(m.date_start))
          .sort(
            (a, b) =>
              new Date(b.date_start).getTime() -
              new Date(a.date_start).getTime(),
          )[0];
        if (!target) return;

        const meetingSessions =
          (await safe(
            queryClient.fetchQuery({
              queryKey: ["sessions", target.meeting_key],
              queryFn: () => api.sessions(target.meeting_key),
              staleTime,
            }),
          )) ?? [];
        const pool: Session[] = [...meetingSessions];
        if (
          aliasSession &&
          aliasSession.meeting_key === target.meeting_key &&
          !pool.some((s) => s.session_key === aliasSession.session_key)
        ) {
          pool.push(aliasSession);
        }
        const started = pool.filter((s) => hasStarted(s.date_start));
        const ordered = (started.length > 0 ? started : pool)
          .filter((s) => !s.is_cancelled)
          .sort(
            (a, b) =>
              new Date(b.date_start).getTime() -
              new Date(a.date_start).getTime(),
          );
        const targetSession =
          ordered.find((s) => isSessionLive(s)) ?? ordered[0] ?? null;

        if (source === "manual") {
          trackEvent("nav_latest_event", {
            year: target.year,
            meeting_key: target.meeting_key,
            ...(targetSession
              ? { session_key: targetSession.session_key }
              : {}),
          });
        }

        resetPlaybackToStart();
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("year", String(target.year));
          next.set("meeting", String(target.meeting_key));
          if (targetSession) {
            next.set("session", String(targetSession.session_key));
          } else {
            next.delete("session");
          }
          clearReplayTimeParam(next);
          replaceHistorySearchParams(next);
          return next;
        });
        // No session list yet (e.g. sessions request failed): let the
        // sessions-loaded effect pick one once useSessions() resolves.
        setSelectLatestSessionOnLoad(targetSession === null);
      } finally {
        setIsSelectingLatest(false);
      }
    },
    [isSelectingLatest, queryClient, currentCalendarYear, setSearchParams],
  );

  // First app load behavior: mimic pressing "Latest" automatically when
  // no explicit meeting/session is selected in the URL/state.
  // selectLatestEvent() fetches what it needs itself, so this can run once
  // on mount without waiting for any query to settle.
  // Standings and schedule routes only need ?year= — auto-selecting would
  // overwrite it (e.g. a shared /standings/driver/4?year=2024 link jumping to
  // this season), so the bootstrap waits until a replay route is opened.
  const onSeasonRoute = isSeasonPath(useLocation().pathname);
  useEffect(() => {
    if (autoLatestBootstrappedRef.current || onSeasonRoute) return;
    autoLatestBootstrappedRef.current = true;
    if (meetingKey !== null || sessionKey !== null) return;
    void selectLatestEvent("auto");
  }, [meetingKey, sessionKey, selectLatestEvent, onSeasonRoute]);

  const eventLabel = selectedMeeting
    ? `${selectedMeeting.country_name.toUpperCase()} ${selectedMeeting.year}`
    : null;
  const sessionLabel = selectedSession
    ? selectedSession.session_name.toUpperCase()
    : null;
  const headerLabel =
    eventLabel && sessionLabel
      ? `${eventLabel} · ${sessionLabel}`
      : (eventLabel ?? "SELECT SESSION");

  const currentView: MainView = VALID_VIEWS.has(view as MainView)
    ? (view as MainView)
    : "tracker";
  const location = useLocation();
  const navigate = useNavigate();
  const isMainRoute = location.pathname === "/";
  const isTelemetryRoute = location.pathname === "/telemetry";
  const isSeasonRoute = isSeasonPath(location.pathname);

  function viewHref(id: MainView) {
    const params = new URLSearchParams(searchParams);
    params.set("view", id);
    return `/?${params}`;
  }

  return (
    <header
      className="shrink-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* ── Red top bar ──────────────────────────────────────────── */}
      <div
        className="flex items-center h-9 px-3 sm:h-10 sm:px-4 bg-f1red"
        style={{
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <button
          onClick={() => {
            trackEvent("nav_logo_clicked", { destination: "home" });
            navigate(viewHref(currentView));
          }}
          className="flex items-center gap-1.5 mr-2 sm:mr-6 select-none shrink-0 hover:opacity-80 transition-opacity"
          aria-label="F1 Replay home"
        >
          <AppLogo size={22} />
          {/* Phones give the event picker the room on replay routes. */}
          <span
            className={`font-black text-white text-compact sm:text-sm tracking-eyebrow sm:tracking-spaced uppercase leading-none ${
              isMainRoute || isTelemetryRoute ? "hidden sm:inline" : ""
            }`}
          >
            F1<span className="opacity-50 font-light mx-1">|</span>REPLAY
          </span>
        </button>

        <div className="max-md:ml-auto md:mr-auto min-w-0 flex items-center gap-2">
          {isMainRoute || isTelemetryRoute ? (
            <EventPicker
              year={year}
              meetingKey={meetingKey}
              sessionKey={sessionKey}
              selectedMeeting={selectedMeeting}
              countryFlagUrl={selectedCountryFlagUrl}
              sessionLabel={sessionLabel}
              live={live}
              meetings={startedMeetings}
              sessions={startedSessions}
              meetingsPending={meetings.isPending}
              sessionsPending={sessions.isPending}
              meetingsFailed={meetings.isError && !authFailed}
              sessionsFailed={sessions.isError && !authFailed}
              isSelectingLatest={isSelectingLatest}
              onYear={onYear}
              onMeeting={onMeetingSelect}
              onSession={onSessionSelect}
              onLatest={() => void selectLatestEvent("manual")}
            />
          ) : isSeasonRoute ? (
            // Standings/schedule only need a season; meeting/session are cleared on change.
            <label className="relative inline-flex items-center">
              <span className="sr-only">Season year</span>
              <select
                aria-label="Season year"
                value={year}
                onChange={(e) => onYear(Number(e.target.value))}
                className="h-7 appearance-none cursor-pointer rounded-sm border border-white/10 bg-black/[0.06] pl-2 pr-6 text-small font-bold uppercase tracking-widest text-white transition-colors hover:border-white/25 hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 [&>option]:bg-surface [&>option]:text-fg"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y} season
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/75"
              />
            </label>
          ) : (
            <>
              {live && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-white/75 shrink-0"
                  aria-hidden="true"
                />
              )}
              {selectedMeeting ? (
                <>
                  {selectedCountryFlagUrl && (
                    <img
                      src={selectedCountryFlagUrl}
                      alt={`${selectedMeeting.country_name} flag`}
                      className="h-3.5 w-5 object-cover rounded-sm border border-white/30 shrink-0"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <span className="min-w-0 text-white text-caption sm:text-small font-bold uppercase tracking-wide truncate sm:max-w-[160px] lg:max-w-[240px]">
                    {selectedMeeting.meeting_name}
                  </span>
                  <span className="hidden sm:inline text-white/70 text-small font-bold uppercase tracking-widest shrink-0">
                    {selectedMeeting.year}
                  </span>
                  {sessionLabel && (
                    <span className="hidden sm:inline text-white/70 text-small font-bold uppercase tracking-widest shrink-0">
                      · {sessionLabel}
                    </span>
                  )}
                  {selectedMeeting.is_cancelled && (
                    <span className="bg-white text-f1red text-tiny font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0">
                      Cancelled
                    </span>
                  )}
                </>
              ) : (
                <span className="hidden sm:inline text-white/80 text-small font-bold tracking-widest uppercase truncate">
                  {headerLabel}
                </span>
              )}
            </>
          )}
        </div>

        <nav
          data-tour={TOUR_TARGET.viewTabs}
          className="hidden md:flex items-center h-10"
        >
          {VIEW_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                trackEvent("nav_view_changed", { view: id, source: "desktop" });
                navigate(viewHref(id));
              }}
              className={`h-10 px-4 text-small font-bold uppercase tracking-widest border-b-2 transition-colors ${
                isMainRoute && currentView === id
                  ? "text-white border-white"
                  : "text-white/60 border-transparent hover:text-white/90 hover:border-white/40"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div
          data-tour={TOUR_TARGET.analysisLinks}
          className="hidden md:flex items-center gap-0 ml-3 pl-3 border-l border-white/20"
        >
          <NavLink
            to={`/telemetry?${searchParams}`}
            className={({ isActive }) =>
              `h-10 flex items-center px-3 text-small font-bold uppercase tracking-widest border-b-2 transition-colors ${
                isActive
                  ? "text-white border-white"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`
            }
          >
            Telemetry
          </NavLink>
          <NavLink
            to={`/schedule?${searchParams}`}
            className={({ isActive }) =>
              `h-10 flex items-center px-3 text-small font-bold uppercase tracking-widest border-b-2 transition-colors ${
                isActive
                  ? "text-white border-white"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`
            }
          >
            Schedule
          </NavLink>
          <NavLink
            to={`/standings?${searchParams}`}
            className={({ isActive }) =>
              `h-10 flex items-center px-3 text-small font-bold uppercase tracking-widest border-b-2 transition-colors ${
                isActive
                  ? "text-white border-white"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`
            }
          >
            Standings
          </NavLink>
        </div>

        {/* Settings button — desktop only; mobile has it in the bottom nav */}
        <button
          onClick={() => {
            trackEvent("nav_settings_opened", { source: "desktop" });
            openSettings();
          }}
          className="hidden md:flex w-8 h-10 items-center justify-center text-white/70 hover:text-white hover:opacity-80 transition-opacity ml-1"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon width={16} height={16} />
        </button>

        {/* Fullscreen toggle — desktop only */}
        <button
          onClick={() => {
            trackEvent("nav_fullscreen_toggled", {
              source: "desktop",
              next: !isFullscreen,
            });
            toggleFullscreen();
          }}
          className="hidden md:flex w-8 h-10 items-center justify-center text-white/70 hover:text-white hover:opacity-80 transition-opacity ml-1"
          aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
          title={isFullscreen ? "Exit full screen" : "Enter full screen"}
        >
          {isFullscreen ? (
            <Minimize width={16} height={16} />
          ) : (
            <Maximize width={16} height={16} />
          )}
        </button>

        {/* Help button — desktop only */}
        <button
          onClick={() => {
            trackEvent("nav_help_opened", { source: "desktop" });
            openHelp();
          }}
          data-tour={TOUR_TARGET.help}
          className="hidden md:flex w-8 h-10 items-center justify-center text-white/70 hover:text-white hover:opacity-80 transition-opacity ml-1"
          aria-label="How it works"
          title="How it works"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </button>
      </div>

      {/* ── Next race weekend banner (main + telemetry routes) ─── */}
      {(isMainRoute || isTelemetryRoute) &&
        showNextRaceWeekendBanner &&
        !hasOngoingRaceWeekend &&
        nextMeeting &&
        nextMeetingCountdown && (
          <div className="border-b border-panel">
            <div
              className="flex items-center gap-3 min-w-0 bg-track py-1.5 border-t border-panel"
              role="button"
              tabIndex={0}
              onClick={() => {
                trackEvent("nav_next_agenda_opened", { source: "banner" });
                setShowNextAgenda(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  trackEvent("nav_next_agenda_opened", {
                    source: "banner_key",
                  });
                  setShowNextAgenda(true);
                }
              }}
              style={{
                paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
                paddingRight: "max(0.5rem, env(safe-area-inset-right))",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {nextMeetingCountryFlagUrl && (
                  <img
                    src={nextMeetingCountryFlagUrl}
                    alt={`${nextMeeting.country_name} flag`}
                    className="h-4 w-6 object-cover rounded-sm border border-fg/20 shrink-0"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-small font-black text-fg tracking-wide truncate">
                    {nextMeeting.country_name}{" "}
                    <span className="text-fg/60">
                      ›
                    </span>
                  </div>
                  <div className="text-tiny font-semibold uppercase tracking-widest text-fg/60 truncate">
                    {nextMeeting.circuit_short_name}
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-tiny font-black uppercase tracking-caps text-fg/85">
                  {nextMeetingRound !== null && (
                    <span className="shrink-0">
                      R{String(nextMeetingRound).padStart(2, "0")}
                    </span>
                  )}
                  <span className="text-fg/45">|</span>
                  <span className="shrink-0">
                    {nextMeetingDateRange ?? "TBA"}
                  </span>
                </div>
              </div>

              <span className="ml-auto h-6 px-2 rounded-sm bg-fg/5 text-tiny font-mono text-f1red-fg shrink-0 inline-flex items-center">
                {nextMeetingCountdown}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  trackEvent("nav_next_banner_hidden");
                  setSetting("showNextRaceWeekendBanner", false);
                }}
                aria-label="Hide next race banner"
                title="Hide banner"
                className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm text-fg/65 hover:text-fg hover:bg-fg/10"
              >
                ×
              </button>
            </div>
          </div>
        )}

      {showNextAgenda && nextMeeting && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              trackEvent("nav_next_agenda_closed", { reason: "backdrop" });
              setShowNextAgenda(false);
            }
          }}
        >
          <div className="w-full max-w-2xl max-h-[88dvh] overflow-hidden rounded-sm border border-panel bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-panel px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-body font-bold text-fg tracking-wide truncate">
                  {nextMeeting.meeting_name} Agenda
                </div>
                <div className="text-caption text-muted uppercase tracking-widest truncate">
                  {nextMeeting.country_name} · {nextMeeting.circuit_short_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  trackEvent("nav_next_agenda_closed", { reason: "button" });
                  setShowNextAgenda(false);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-sm text-muted hover:text-fg hover:bg-panel transition-colors text-base"
                aria-label="Close agenda"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(88dvh-60px)]">
              <div className="mb-3 text-caption font-black uppercase tracking-caps text-muted">
                Event Time
              </div>

              {nextMeetingSessions.isPending ? (
                <div className="text-small text-f1red">Loading agenda...</div>
              ) : nextAgendaSessions.length === 0 ? (
                <div className="text-small text-muted">
                  Agenda not available yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {nextAgendaSessions.map((s) => (
                    <div
                      key={s.session_key}
                      className="rounded-sm border border-panel/80 bg-track/70 px-3 py-2"
                    >
                      <div className="text-small font-bold text-fg">
                        {s.session_name}
                      </div>
                      <div className="mt-1 text-caption text-muted font-mono tracking-wide">
                        {`${formatTrackLocalDayMonth(s.date_start, resolveTrackOffsetMin(s.gmt_offset, nextMeeting.gmt_offset))} ${formatTrackLocal(s.date_start, resolveTrackOffsetMin(s.gmt_offset, nextMeeting.gmt_offset))} - ${formatTrackLocal(s.date_end, resolveTrackOffsetMin(s.gmt_offset, nextMeeting.gmt_offset))}`}
                        <span className="ml-2 uppercase tracking-widest text-fg/50">
                          {`EVENT (${s.gmt_offset || nextMeeting.gmt_offset || "+00:00"})`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Auth failure banner (OpenF1 gates access during live sessions) */}
      <LiveDataNotice error={authError} />

      {TRACK_FACTS_ENABLED && showCircuitFacts && selectedMeeting && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCircuitFacts(false);
          }}
        >
          <div className="w-full max-w-2xl max-h-[88dvh] overflow-hidden rounded-sm border border-panel bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-panel px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-body font-bold text-fg tracking-wide truncate">
                  {selectedMeeting.circuit_short_name} Track Facts
                </div>
                <div className="text-caption text-muted uppercase tracking-widest truncate">
                  {selectedMeeting.country_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCircuitFacts(false)}
                className="w-7 h-7 flex items-center justify-center rounded-sm text-muted hover:text-fg hover:bg-panel transition-colors text-base"
                aria-label="Close track facts"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(88dvh-60px)]">
              {selectedCircuitImageUrl && !isCircuitImageBroken && (
                <div className="mb-3 rounded-sm border border-panel/80 bg-track/70 p-2">
                  <div className="rounded-sm border border-black/10 bg-white p-2">
                    <img
                      src={selectedCircuitImageUrl}
                      alt={`${selectedMeeting.circuit_short_name} track layout`}
                      className="w-full max-h-44 object-contain rounded-sm [filter:contrast(1.08)_drop-shadow(0_1px_0_rgba(255,255,255,0.45))]"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        markCircuitImageBroken(selectedCircuitImageUrl)
                      }
                    />
                  </div>
                </div>
              )}

              {selectedCircuitImageUrl && isCircuitImageBroken && (
                <div className="mb-3 rounded-sm border border-panel/80 bg-track/70 px-3 py-2 text-caption text-muted">
                  Track layout image unavailable for this event.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  {
                    label: "Length",
                    value: (() => {
                      if (!visibleFacts?.lengthKm) return "N/A";
                      const parsed = Number(visibleFacts.lengthKm);
                      if (!Number.isFinite(parsed)) return "N/A";
                      const converted = toDisplayDistanceKm(
                        parsed,
                        metricSystem,
                      );
                      return `${converted.toFixed(3)} ${distanceUnitLabel(metricSystem)}`;
                    })(),
                  },
                  {
                    label: "Race Distance",
                    value: (() => {
                      if (!visibleFacts?.raceDistanceKm) return "N/A";
                      const parsed = Number(visibleFacts.raceDistanceKm);
                      if (!Number.isFinite(parsed)) return "N/A";
                      const converted = toDisplayDistanceKm(
                        parsed,
                        metricSystem,
                      );
                      return `${converted.toFixed(3)} ${distanceUnitLabel(metricSystem)}`;
                    })(),
                  },
                  {
                    label: "Laps",
                    value: visibleFacts?.laps ?? "N/A",
                  },
                  {
                    label: "Turns",
                    value: visibleFacts?.turns ?? "N/A",
                  },
                  {
                    label: "Lap Record",
                    value: visibleFacts?.lapRecord ?? "N/A",
                  },
                  {
                    label: "DRS Zones",
                    value: visibleFacts?.drsZones ?? "N/A",
                  },
                  {
                    label: "First GP",
                    value: visibleFacts?.firstGpYear ?? "N/A",
                  },
                  {
                    label: "Direction",
                    value: visibleFacts?.direction ?? "N/A",
                  },
                  {
                    label: "Altitude",
                    value: (() => {
                      if (!visibleFacts?.altitudeM) return "N/A";
                      const parsed = Number(visibleFacts.altitudeM);
                      if (!Number.isFinite(parsed)) return "N/A";
                      const converted = toDisplayAltitudeM(
                        parsed,
                        metricSystem,
                      );
                      return `${Math.round(converted)} ${altitudeUnitLabel(metricSystem)}`;
                    })(),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-sm border border-panel/80 bg-track/70 px-2.5 py-2"
                  >
                    <div className="text-tiny font-black uppercase tracking-caps text-muted">
                      {item.label}
                    </div>
                    <div className="mt-1 text-small font-semibold text-fg break-words">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 border-t border-panel/70 pt-2">
                {apiFactsLoading && (
                  <div className="mb-1 text-caption text-f1red">
                    Fetching facts from API...
                  </div>
                )}
                <div className="text-caption text-muted leading-relaxed">
                  Data source: live circuit facts fetched from API at runtime.
                </div>
                {selectedCircuitInfoUrl && (
                  <a
                    href={selectedCircuitInfoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-caption font-bold uppercase tracking-widest text-f1red hover:text-fg transition-colors"
                  >
                    Official circuit information
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
