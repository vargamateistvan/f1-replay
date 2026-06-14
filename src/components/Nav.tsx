import {
  NavLink,
  useSearchParams,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useMeetings, useSessions } from "@/hooks/useSession";
import { isAuthError } from "@/api/client";
import { isSessionLive } from "@/utils/live";
import { YEARS, DEFAULT_YEAR } from "@/constants";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { AppLogo } from "@/components/AppLogo";
import { useSettings } from "@/stores/settings";

export type MainView = "leaderboard" | "tracker" | "commentary";

const VIEW_TABS: { id: MainView; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "tracker", label: "Driver Tracker" },
  { id: "commentary", label: "Commentary" },
];

const SELECT =
  "bg-transparent text-white border border-[#38383f] text-[11px] font-medium px-2 py-1 focus:outline-none focus:border-muted appearance-none cursor-pointer";

export function Nav() {
  const openSettings = useSettings((s) => s.openModal);
  const [searchParams, setSearchParams] = useSearchParams();

  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey, setSessionKey] = useNumberParam("session", null);
  const [view] = useStringParam<MainView>("view", "leaderboard");

  const meetings = useMeetings(year);
  const sessions = useSessions(meetingKey);
  const authFailed = isAuthError(meetings.error) || isAuthError(sessions.error);

  const selectedMeeting = meetings.data?.find(
    (m) => m.meeting_key === meetingKey,
  );
  const selectedSession = sessions.data?.find(
    (s) => s.session_key === sessionKey,
  );
  const live = isSessionLive(selectedSession);

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

  const currentView = view ?? "leaderboard";
  const location = useLocation();
  const navigate = useNavigate();
  const isMainRoute = location.pathname === "/";

  function viewHref(id: MainView) {
    const params = new URLSearchParams(searchParams);
    if (id === "leaderboard") params.delete("view");
    else params.set("view", id);
    return `/?${params}`;
  }

  return (
    <header className="shrink-0">
      {/* ── Red top bar ──────────────────────────────────────────── */}
      <div className="flex items-center h-10 px-4 bg-f1red">
        <button
          onClick={() => navigate(viewHref(currentView))}
          className="flex items-center gap-2 mr-6 select-none shrink-0 hover:opacity-80 transition-opacity"
          aria-label="F1 Replay home"
        >
          <AppLogo size={22} />
          <span className="font-black text-white text-sm tracking-[0.22em] uppercase leading-none">
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

        {/* Settings button */}
        <button
          onClick={openSettings}
          className="w-8 h-10 flex items-center justify-center text-white/70 hover:text-white hover:opacity-80 transition-opacity ml-1"
          aria-label="Settings"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeLinecap="round">
            {/* Top slider — high */}
            <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="10" cy="4" r="2" fill="currentColor"/>
            {/* Middle slider — low */}
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="5" cy="8" r="2" fill="currentColor"/>
            {/* Bottom slider — mid */}
            <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="11" cy="12" r="2" fill="currentColor"/>
          </svg>
        </button>

      </div>

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 bg-track border-b border-panel">
          {live && (
            <span className="flex items-center gap-1 bg-f1red text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          )}

          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
            Year
          </span>
          <select
            aria-label="Season year"
            value={year}
            onChange={(e) => onYear(Number(e.target.value))}
            className={SELECT}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
            Event
          </span>
          {meetings.isError && !authFailed ? (
            <span className="text-red-400 font-mono text-[10px]">
              Failed to load events
            </span>
          ) : (
            <select
              aria-label="Event"
              value={meetingKey ?? ""}
              onChange={(e) => onMeeting(Number(e.target.value))}
              disabled={meetings.isPending}
              className={`${SELECT} min-w-0 flex-1 sm:min-w-44`}
            >
              <option value="">— select —</option>
              {meetings.data?.map((m) => (
                <option key={m.meeting_key} value={m.meeting_key}>
                  {m.location} — {m.meeting_name}
                </option>
              ))}
            </select>
          )}

          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
            Session
          </span>
          {sessions.isError && !authFailed ? (
            <span className="text-red-400 font-mono text-[10px]">
              Failed to load sessions
            </span>
          ) : (
            <select
              aria-label="Session"
              value={sessionKey ?? ""}
              onChange={(e) => setSessionKey(Number(e.target.value))}
              disabled={sessions.isPending || !meetingKey}
              className={SELECT}
            >
              <option value="">— select —</option>
              {sessions.data?.map((s) => (
                <option key={s.session_key} value={s.session_key}>
                  {s.session_name}
                </option>
              ))}
            </select>
          )}

          {(meetings.isPending || sessions.isPending) && (
            <span className="text-muted text-[9px] animate-pulse ml-1">
              Loading…
            </span>
          )}
        </div>
      )}

    </header>
  );
}
