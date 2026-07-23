import { useMeetings, useSessions } from "@/hooks/useSession";
import { isAuthError } from "@/api/client";
import { isSessionLive } from "@/utils/live";
import { YEARS } from "@/constants";
import { useCallback, useEffect, useState, useRef } from "react";
import { toSafeExternalUrl } from "@/utils/url";
import { trackEvent } from "@/lib/analytics";

interface Props {
  year: number;
  meetingKey: number | null;
  sessionKey: number | null;
  onYear: (y: number) => void;
  onMeeting: (k: number) => void;
  onSession: (k: number) => void;
}

const CIRCUIT_TYPE_LABEL: Record<string, string> = {
  Permanent: "Permanent",
  "Temporary - Street": "Street Circuit",
  "Temporary - Road": "Road Course",
};

const SELECT =
  "bg-panel text-white border border-panel text-xs font-medium px-3 py-1.5 focus:outline-none focus:border-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed light:bg-white light:text-black light:border-slate-300 light:focus:border-slate-500 light:[color-scheme:light] light:[&>option]:bg-white light:[&>option]:text-black";

export function SessionPicker({
  year,
  meetingKey,
  sessionKey,
  onYear,
  onMeeting,
  onSession,
}: Props) {
  const meetings = useMeetings(year);
  const sessions = useSessions(meetingKey);
  const [selectLatestSessionOnLoad, setSelectLatestSessionOnLoad] =
    useState(false);
  const lastSelectChangeRef = useRef(0);
  const autoLatestBootstrappedRef = useRef(false);

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
  const live = isSessionLive(selectedSession);
  const authFailed = isAuthError(meetings.error) || isAuthError(sessions.error);

  // Automatically select the latest session once sessions load
  useEffect(() => {
    if (
      selectLatestSessionOnLoad &&
      sessions.data &&
      sessions.data.length > 0
    ) {
      const now = Date.now();
      const startedSessions = sessions.data.filter(
        (s) => new Date(s.date_start).getTime() <= now,
      );
      const pool = startedSessions.length > 0 ? startedSessions : sessions.data;
      const latestSession = pool
        .slice()
        .sort(
          (a, b) =>
            new Date(b.date_start).getTime() - new Date(a.date_start).getTime(),
        )[0];
      if (latestSession) {
        onSession(latestSession.session_key);
        setSelectLatestSessionOnLoad(false);
      }
    }
  }, [selectLatestSessionOnLoad, sessions.data, onSession]);

  const selectLatestEvent = useCallback(
    (source: "auto" | "manual" = "auto") => {
      const latest = meetings.data
        ?.slice()
        .sort(
          (a, b) =>
            new Date(b.date_start).getTime() - new Date(a.date_start).getTime(),
        )[0];
      if (!latest) return;
      onYear(latest.year);
      onMeeting(latest.meeting_key);
      if (source === "manual") {
        trackEvent("sessionpicker_latest_event", {
          year: latest.year,
          meeting_key: latest.meeting_key,
        });
      }
      setSelectLatestSessionOnLoad(true);
    },
    [meetings.data, onYear, onMeeting],
  );

  // First mount behavior: if nothing is selected yet, auto-run Latest Event.
  useEffect(() => {
    if (autoLatestBootstrappedRef.current) return;
    if (meetings.isPending) return;

    autoLatestBootstrappedRef.current = true;
    if (meetingKey !== null || sessionKey !== null) return;

    selectLatestEvent("auto");
  }, [meetings.isPending, meetingKey, sessionKey, selectLatestEvent]);

  return (
    <div>
      {authFailed && (
        <div className="bg-f1red/15 border-b border-f1red/40 px-4 py-1.5 text-[11px] text-red-300 font-mono">
          OpenF1 returned <span className="font-bold">401/403</span> — the API
          is rejecting requests. Historical data is normally free; if it now
          requires a token, set{" "}
          <span className="font-bold">VITE_OPENF1_API_KEY</span> in{" "}
          <span className="font-bold">.env.local</span> and restart.
        </div>
      )}
      <div className="bg-surface border-b border-panel light:bg-white light:border-slate-300/80">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 light:bg-white">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Year
          </span>
          <select
            aria-label="Season year"
            value={year}
            onChange={(e) => {
              const now = Date.now();
              if (now - lastSelectChangeRef.current < 100) return;
              lastSelectChangeRef.current = now;
              try {
                console.log("[SessionPicker] Year selection started", {
                  value: e.target.value,
                });
                const val = Number(e.target.value);
                console.log("[SessionPicker] Year value parsed:", val);
                onYear(val);
                trackEvent("sessionpicker_year_changed", { year: val });
                console.log("[SessionPicker] onYear completed");
              } catch (err) {
                console.error(
                  "[SessionPicker] Year selection error:",
                  err instanceof Error ? err.message : String(err),
                );
                throw err;
              }
            }}
            className={SELECT}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Event
          </span>
          {meetings.isError ? (
            <span className="text-red-400 font-mono text-[11px]">
              Failed to load events
            </span>
          ) : (
            <select
              aria-label="Event"
              value={meetingKey ?? ""}
              onChange={(e) => {
                const now = Date.now();
                if (now - lastSelectChangeRef.current < 100) return;
                lastSelectChangeRef.current = now;
                try {
                  console.log("[SessionPicker] Meeting selection started", {
                    value: e.target.value,
                  });
                  const val = Number(e.target.value);
                  console.log("[SessionPicker] Meeting value parsed:", val);
                  if (!Number.isNaN(val) && val !== 0) {
                    console.log("[SessionPicker] Calling onMeeting:", val);
                    onMeeting(val);
                    trackEvent("sessionpicker_meeting_changed", {
                      meeting_key: val,
                    });
                    setSelectLatestSessionOnLoad(true);
                    console.log("[SessionPicker] onMeeting completed");
                  }
                } catch (err) {
                  console.error(
                    "[SessionPicker] Meeting selection error:",
                    err instanceof Error ? err.message : String(err),
                  );
                  throw err;
                }
              }}
              disabled={meetings.isPending}
              className={`${SELECT} min-w-44`}
            >
              <option value="">— select —</option>
              {meetings.data?.map((m) => (
                <option key={m.meeting_key} value={m.meeting_key}>
                  {m.location} — {m.meeting_name}
                </option>
              ))}
            </select>
          )}

          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Session
          </span>
          {sessions.isError ? (
            <span className="text-red-400 font-mono text-[11px]">
              Failed to load sessions
            </span>
          ) : (
            <select
              aria-label="Session"
              value={sessionKey ?? ""}
              onChange={(e) => {
                const now = Date.now();
                if (now - lastSelectChangeRef.current < 100) return;
                lastSelectChangeRef.current = now;
                try {
                  console.log("[SessionPicker] Session selection started", {
                    value: e.target.value,
                  });
                  const val = Number(e.target.value);
                  console.log("[SessionPicker] Session value parsed:", val);
                  if (!Number.isNaN(val) && val !== 0) {
                    console.log("[SessionPicker] Calling onSession:", val);
                    onSession(val);
                    trackEvent("sessionpicker_session_changed", {
                      session_key: val,
                    });
                    console.log("[SessionPicker] onSession completed");
                  }
                } catch (err) {
                  console.error(
                    "[SessionPicker] Session selection error:",
                    err instanceof Error ? err.message : String(err),
                  );
                  throw err;
                }
              }}
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

          {live && (
            <span className="flex items-center gap-1.5 bg-f1red text-white text-[10px] font-black uppercase tracking-widest px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          )}

          {(meetings.isPending || sessions.isPending) && (
            <span className="text-muted text-[10px] animate-pulse">
              Loading…
            </span>
          )}

          <button
            type="button"
            onClick={() => selectLatestEvent("manual")}
            disabled={meetings.isPending || !meetings.data?.length}
            className="h-7 px-2 text-[10px] font-black uppercase tracking-widest rounded bg-track text-muted hover:text-white hover:bg-panel disabled:opacity-40 disabled:cursor-not-allowed light:bg-white light:text-slate-600 light:border light:border-slate-300 light:hover:text-slate-900 light:hover:bg-slate-100"
          >
            Latest Event
          </button>
        </div>

        {selectedMeeting && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-t border-panel/80 light:bg-white light:border-slate-200">
            {selectedCircuitImageUrl && (
              <img
                src={selectedCircuitImageUrl}
                alt={`${selectedMeeting.circuit_short_name} circuit`}
                className="hidden sm:block h-6 w-8 object-cover rounded-sm border border-panel/80"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
            {selectedCountryFlagUrl && (
              <img
                src={selectedCountryFlagUrl}
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
            {selectedMeeting.is_cancelled && (
              <span className="bg-red-500/15 border border-red-500/40 text-red-300 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm">
                Cancelled
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
