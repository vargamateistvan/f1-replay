import {
  NavLink,
  useSearchParams,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useMeetings, useSessions } from "@/hooks/useSession";
import { isAuthError } from "@/api/client";
import { isSessionLive } from "@/utils/live";
import { YEARS, DEFAULT_YEAR } from "@/constants";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { AppLogo } from "@/components/AppLogo";
import { useSettings } from "@/stores/settings";
import {
  fetchCircuitFactsFromApi,
  type CircuitFacts,
} from "@/api/circuitFactsLookup";

export type MainView = "leaderboard" | "tracker" | "commentary";

const VIEW_TABS: { id: MainView; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "tracker", label: "Driver Tracker" },
  { id: "commentary", label: "Commentary" },
];

const SELECT =
  "bg-transparent text-white border border-[#38383f] text-[11px] font-medium px-2 py-1 focus:outline-none focus:border-muted appearance-none cursor-pointer";

const CIRCUIT_TYPE_LABEL: Record<string, string> = {
  Permanent: "Permanent",
  "Temporary - Street": "Street Circuit",
  "Temporary - Road": "Road Course",
};

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

export function Nav() {
  const openSettings = useSettings((s) => s.openModal);
  const openHelp = useSettings((s) => s.openHelp);
  const setSetting = useSettings((s) => s.setSetting);
  const showNextRaceWeekendBanner = useSettings(
    (s) => s.showNextRaceWeekendBanner,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showCircuitFacts, setShowCircuitFacts] = useState(false);
  const [apiFacts, setApiFacts] = useState<CircuitFacts | null>(null);
  const [apiFactsLoading, setApiFactsLoading] = useState(false);
  const [showNextAgenda, setShowNextAgenda] = useState(false);

  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey, setSessionKey] = useNumberParam("session", null);
  const [view] = useStringParam<MainView>("view", "tracker");

  const meetings = useMeetings(year);
  const sessions = useSessions(meetingKey);
  const authFailed = isAuthError(meetings.error) || isAuthError(sessions.error);

  const selectedMeeting = meetings.data?.find(
    (m) => m.meeting_key === meetingKey,
  );
  const selectedSession = sessions.data?.find(
    (s) => s.session_key === sessionKey,
  );
  const visibleFacts = apiFacts;
  const live = isSessionLive(selectedSession);

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

    async function loadApiFacts() {
      if (!selectedMeeting) return;
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

  const startedMeetings = useMemo(
    () =>
      (meetings.data ?? []).filter(
        (m) => !m.is_cancelled && new Date(m.date_start).getTime() <= nowMs,
      ),
    [meetings.data, nowMs],
  );

  const nextMeeting = useMemo(
    () =>
      (meetings.data ?? [])
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
    [meetings.data, nowMs],
  );

  const nextMeetingSessions = useSessions(nextMeeting?.meeting_key ?? null);

  const nextMeetingRound = useMemo(() => {
    if (!nextMeeting) return null;
    const heldCount = (meetings.data ?? []).filter(
      (m) =>
        !m.is_cancelled &&
        isRaceWeekend(m.meeting_name, m.meeting_official_name) &&
        new Date(m.date_end).getTime() <= nowMs,
    ).length;
    return heldCount + 1;
  }, [meetings.data, nextMeeting, nowMs]);

  const nextMeetingDateRange = useMemo(() => {
    if (!nextMeeting) return null;

    const start = new Date(nextMeeting.date_start);
    const end = new Date(nextMeeting.date_end);
    const monthFmt = new Intl.DateTimeFormat("en", { month: "short" });
    const startMonth = monthFmt.format(start).toUpperCase();
    const endMonth = monthFmt.format(end).toUpperCase();
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

  function onYear(y: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("year", String(y));
      next.delete("meeting");
      next.delete("session");
      return next;
    });
  }

  function onMeeting(k: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("meeting", String(k));
      next.delete("session");
      return next;
    });
  }

  function selectLatestEvent() {
    const latest = startedMeetings
      ?.slice()
      .sort(
        (a, b) =>
          new Date(b.date_start).getTime() - new Date(a.date_start).getTime(),
      )[0];
    if (!latest) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("year", String(latest.year));
      next.set("meeting", String(latest.meeting_key));
      next.delete("session");
      return next;
    });
  }

  const circuitLabel = selectedMeeting
    ? selectedMeeting.location.toUpperCase()
    : null;
  const sessionLabel = selectedSession
    ? selectedSession.session_name.toUpperCase()
    : null;
  const headerLabel =
    circuitLabel && sessionLabel
      ? `${circuitLabel} · ${sessionLabel}`
      : (circuitLabel ?? "SELECT SESSION");

  const currentView = view ?? "tracker";
  const location = useLocation();
  const navigate = useNavigate();
  const isMainRoute = location.pathname === "/";

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
          onClick={() => navigate(viewHref(currentView))}
          className="flex items-center gap-1.5 mr-3 sm:mr-6 select-none shrink-0 hover:opacity-80 transition-opacity"
          aria-label="F1 Replay home"
        >
          <AppLogo size={22} />
          <span className="font-black text-white text-[12px] sm:text-sm tracking-[0.18em] sm:tracking-[0.22em] uppercase leading-none">
            F1<span className="opacity-50 font-light mx-1">|</span>REPLAY
          </span>
        </button>

        <span className="text-white/80 text-[11px] font-bold tracking-widest uppercase mr-auto truncate hidden sm:block">
          {headerLabel}
        </span>

        <nav className="hidden md:flex items-center h-10">
          {VIEW_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => navigate(viewHref(id))}
              className={`h-10 px-4 text-[11px] font-bold uppercase tracking-[0.1em] border-b-2 transition-colors ${
                isMainRoute && currentView === id
                  ? "text-white border-white"
                  : "text-white/60 border-transparent hover:text-white/90 hover:border-white/40"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-0 ml-3 pl-3 border-l border-white/20">
          <NavLink
            to={`/telemetry?${searchParams}`}
            className={({ isActive }) =>
              `h-10 flex items-center px-3 text-[11px] font-bold uppercase tracking-[0.1em] border-b-2 transition-colors ${
                isActive
                  ? "text-white border-white"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`
            }
          >
            Telemetry
          </NavLink>
          <NavLink
            to={`/standings?${searchParams}`}
            className={({ isActive }) =>
              `h-10 flex items-center px-3 text-[11px] font-bold uppercase tracking-[0.1em] border-b-2 transition-colors ${
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
          onClick={openSettings}
          className="hidden md:flex w-8 h-10 items-center justify-center text-white/70 hover:text-white hover:opacity-80 transition-opacity ml-1"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            strokeLinecap="round"
          >
            {/* Top slider — high */}
            <line
              x1="2"
              y1="4"
              x2="14"
              y2="4"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="10" cy="4" r="2" fill="currentColor" />
            {/* Middle slider — low */}
            <line
              x1="2"
              y1="8"
              x2="14"
              y2="8"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="5" cy="8" r="2" fill="currentColor" />
            {/* Bottom slider — mid */}
            <line
              x1="2"
              y1="12"
              x2="14"
              y2="12"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="11" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>

        {/* Help button — desktop only */}
        <button
          onClick={openHelp}
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

      {/* ── Next race weekend banner (main route) ───────────────── */}
      {isMainRoute &&
        showNextRaceWeekendBanner &&
        nextMeeting &&
        nextMeetingCountdown && (
          <div className="border-b border-panel">
            <div
              className="flex items-center gap-3 min-w-0 bg-black py-1.5"
              role="button"
              tabIndex={0}
              onClick={() => setShowNextAgenda(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowNextAgenda(true);
                }
              }}
              style={{
                paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
                paddingRight: "max(0.5rem, env(safe-area-inset-right))",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {nextMeeting.country_flag && (
                  <img
                    src={nextMeeting.country_flag}
                    alt={`${nextMeeting.country_name} flag`}
                    className="h-4 w-6 object-cover rounded-[2px] border border-white/20 shrink-0"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-white tracking-wide truncate">
                    {nextMeeting.country_name}{" "}
                    <span className="text-white/60">›</span>
                  </div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/60 truncate">
                    {nextMeeting.circuit_short_name}
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/85">
                  {nextMeetingRound !== null && (
                    <span className="shrink-0">
                      R{String(nextMeetingRound).padStart(2, "0")}
                    </span>
                  )}
                  <span className="text-white/45">|</span>
                  <span className="shrink-0">
                    {nextMeetingDateRange ?? "TBA"}
                  </span>
                </div>
              </div>

              <span className="ml-auto h-6 px-2 rounded-sm bg-white/5 text-[9px] font-mono text-f1red shrink-0 inline-flex items-center">
                {nextMeetingCountdown}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSetting("showNextRaceWeekendBanner", false);
                }}
                aria-label="Hide next race banner"
                title="Hide banner"
                className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm text-white/65 hover:text-white hover:bg-white/10"
              >
                ×
              </button>
            </div>
          </div>
        )}

      {showNextAgenda && nextMeeting && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNextAgenda(false);
          }}
        >
          <div className="w-full max-w-2xl max-h-[88dvh] overflow-hidden rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2a2a35] px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-white tracking-wide truncate">
                  {nextMeeting.meeting_name} Agenda
                </div>
                <div className="text-[10px] text-muted uppercase tracking-widest truncate">
                  {nextMeeting.country_name} · {nextMeeting.circuit_short_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNextAgenda(false)}
                className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-white hover:bg-[#2a2a35] transition-colors text-base"
                aria-label="Close agenda"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(88dvh-60px)]">
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-muted">
                Event Time
              </div>

              {nextMeetingSessions.isPending ? (
                <div className="text-[11px] text-f1red animate-pulse">
                  Loading agenda...
                </div>
              ) : nextAgendaSessions.length === 0 ? (
                <div className="text-[11px] text-muted">
                  Agenda not available yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {nextAgendaSessions.map((s) => (
                    <div
                      key={s.session_key}
                      className="rounded border border-panel/80 bg-track/70 px-3 py-2"
                    >
                      <div className="text-[11px] font-bold text-white">
                        {s.session_name}
                      </div>
                      <div className="mt-1 text-[10px] text-muted font-mono tracking-wide">
                        {`${formatTrackLocalDayMonth(s.date_start, resolveTrackOffsetMin(s.gmt_offset, nextMeeting.gmt_offset))} ${formatTrackLocal(s.date_start, resolveTrackOffsetMin(s.gmt_offset, nextMeeting.gmt_offset))} - ${formatTrackLocal(s.date_end, resolveTrackOffsetMin(s.gmt_offset, nextMeeting.gmt_offset))}`}
                        <span className="ml-2 uppercase tracking-widest text-white/50">
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

      {/* ── Auth failure banner ───────────────────────────────── */}
      {authFailed && (
        <div className="bg-f1red/15 border-b border-f1red/40 px-4 py-1 text-[10px] text-red-300 font-mono">
          OpenF1 returned <span className="font-bold">401/403</span> — set{" "}
          <span className="font-bold">VITE_OPENF1_API_KEY</span> in{" "}
          <span className="font-bold">.env.local</span> and restart.
        </div>
      )}

      {/* ── Dark sub-bar: session pickers (main route only) ─────── */}
      {isMainRoute && (
        <div className="bg-track border-b border-panel">
          <div
            className="flex flex-wrap items-center gap-1 py-1.5"
            style={{
              paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
              paddingRight: "max(0.5rem, env(safe-area-inset-right))",
            }}
          >
            {live && (
              <span className="flex items-center gap-1 bg-f1red text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Live
              </span>
            )}

            <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest text-muted shrink-0">
              Year
            </span>
            <select
              aria-label="Season year"
              value={year}
              onChange={(e) => onYear(Number(e.target.value))}
              className={`${SELECT} shrink-0 w-[4.5rem] sm:w-auto`}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest text-muted shrink-0">
              Event
            </span>
            {meetings.isError && !authFailed ? (
              <span className="text-red-400 font-mono text-[10px] shrink-0">
                Failed to load events
              </span>
            ) : (
              <select
                aria-label="Event"
                value={meetingKey ?? ""}
                onChange={(e) => onMeeting(Number(e.target.value))}
                disabled={meetings.isPending}
                className={`${SELECT} min-w-0 flex-[1_1_132px] sm:flex-[1_1_160px] sm:max-w-none`}
              >
                <option value="">— event —</option>
                {startedMeetings.map((m) => (
                  <option key={m.meeting_key} value={m.meeting_key}>
                    {m.location} — {m.meeting_name}
                  </option>
                ))}
              </select>
            )}

            <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest text-muted shrink-0">
              Session
            </span>
            {sessions.isError && !authFailed ? (
              <span className="text-red-400 font-mono text-[10px] shrink-0">
                Failed to load sessions
              </span>
            ) : (
              <select
                aria-label="Session"
                value={sessionKey ?? ""}
                onChange={(e) => setSessionKey(Number(e.target.value))}
                disabled={sessions.isPending || !meetingKey}
                className={`${SELECT} min-w-0 flex-[1_1_108px] sm:flex-none`}
              >
                <option value="">— session —</option>
                {sessions.data?.map((s) => (
                  <option key={s.session_key} value={s.session_key}>
                    {s.session_name}
                  </option>
                ))}
              </select>
            )}

            {(meetings.isPending || sessions.isPending) && (
              <span className="text-muted text-[9px] animate-pulse shrink-0 ml-auto sm:ml-0">
                Loading…
              </span>
            )}

            <button
              type="button"
              onClick={selectLatestEvent}
              disabled={meetings.isPending || !meetings.data?.length}
              className="h-6 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-colors bg-[#1e1e28] text-muted hover:text-white hover:bg-[#38383f] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Latest
            </button>
          </div>

          {selectedMeeting && (
            <>
              <div
                className="flex items-center gap-2 border-t border-panel/80 py-1.5"
                style={{
                  paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
                  paddingRight: "max(0.5rem, env(safe-area-inset-right))",
                }}
              >
                {selectedMeeting.circuit_image && (
                  <button
                    type="button"
                    onClick={() => setShowCircuitFacts((v) => !v)}
                    className="hidden sm:block group"
                    aria-label="Toggle circuit facts"
                    aria-expanded={showCircuitFacts}
                    title="Show track facts"
                  >
                    <img
                      src={selectedMeeting.circuit_image}
                      alt={`${selectedMeeting.circuit_short_name} circuit`}
                      className="h-6 w-8 object-cover rounded-sm border border-panel/80 transition-colors group-hover:border-white/70"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                )}
                {selectedMeeting.country_flag && (
                  <img
                    src={selectedMeeting.country_flag}
                    alt={`${selectedMeeting.country_name} flag`}
                    className="h-4 w-6 object-cover rounded-[2px] border border-panel/80"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="text-[10px] text-white/90 font-semibold truncate">
                  {selectedMeeting.meeting_name}
                </span>
                <span className="text-[9px] text-muted uppercase tracking-widest">
                  {CIRCUIT_TYPE_LABEL[selectedMeeting.circuit_type] ??
                    selectedMeeting.circuit_type}
                </span>
                {selectedMeeting.circuit_image && (
                  <button
                    type="button"
                    onClick={() => setShowCircuitFacts((v) => !v)}
                    className="ml-auto text-[9px] font-black uppercase tracking-widest text-muted hover:text-white transition-colors"
                    aria-label="Toggle circuit facts"
                    aria-expanded={showCircuitFacts}
                  >
                    {showCircuitFacts ? "Hide Facts" : "Track Facts"}
                  </button>
                )}
                {selectedMeeting.is_cancelled && (
                  <span className="bg-red-500/15 border border-red-500/40 text-red-300 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm">
                    Cancelled
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showCircuitFacts && selectedMeeting && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCircuitFacts(false);
          }}
        >
          <div className="w-full max-w-2xl max-h-[88dvh] overflow-hidden rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2a2a35] px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-white tracking-wide truncate">
                  {selectedMeeting.circuit_short_name} Track Facts
                </div>
                <div className="text-[10px] text-muted uppercase tracking-widest truncate">
                  {selectedMeeting.country_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCircuitFacts(false)}
                className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-white hover:bg-[#2a2a35] transition-colors text-base"
                aria-label="Close track facts"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(88dvh-60px)]">
              {selectedMeeting.circuit_image && (
                <div className="mb-3 rounded border border-panel/80 bg-track/70 p-2">
                  <div className="rounded border border-black/10 bg-gradient-to-b from-[#f6f8fb] to-[#e8edf4] p-2">
                    <img
                      src={selectedMeeting.circuit_image}
                      alt={`${selectedMeeting.circuit_short_name} track layout`}
                      className="w-full max-h-44 object-contain rounded [filter:contrast(1.08)_drop-shadow(0_1px_0_rgba(255,255,255,0.45))]"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  {
                    label: "Length",
                    value: visibleFacts?.lengthKm
                      ? `${visibleFacts.lengthKm} km`
                      : "N/A",
                  },
                  {
                    label: "Race Distance",
                    value: visibleFacts?.raceDistanceKm
                      ? `${visibleFacts.raceDistanceKm} km`
                      : "N/A",
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
                    value: visibleFacts?.altitudeM
                      ? `${visibleFacts.altitudeM} m`
                      : "N/A",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded border border-panel/80 bg-track/70 px-2.5 py-2"
                  >
                    <div className="text-[9px] font-black uppercase tracking-[0.14em] text-muted">
                      {item.label}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-white break-words">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 border-t border-panel/70 pt-2">
                {apiFactsLoading && (
                  <div className="mb-1 text-[10px] text-f1red animate-pulse">
                    Fetching facts from API...
                  </div>
                )}
                <div className="text-[10px] text-muted leading-relaxed">
                  Data source: live circuit facts fetched from API at runtime.
                </div>
                {selectedMeeting.circuit_info_url && (
                  <a
                    href={selectedMeeting.circuit_info_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-f1red hover:text-white transition-colors"
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
