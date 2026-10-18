import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Meeting, Session } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { YEARS } from "@/constants";
import { trackEvent } from "@/lib/analytics";
import {
  PICKER_CHEVRON,
  PICKER_FIELD_LABEL,
  PICKER_SELECT,
} from "./pickerStyles";

type Props = {
  year: number;
  meetingKey: number | null;
  sessionKey: number | null;
  selectedMeeting: Meeting | undefined;
  countryFlagUrl: string | null;
  sessionLabel: string | null;
  live: boolean;
  meetings: Meeting[];
  sessions: Session[];
  meetingsPending: boolean;
  sessionsPending: boolean;
  meetingsFailed: boolean;
  sessionsFailed: boolean;
  isSelectingLatest: boolean;
  onYear: (year: number) => void;
  onMeeting: (raw: string) => void;
  onSession: (raw: string) => void;
  onLatest: () => void;
};

/**
 * Year / event / session picker that lives in the red top bar: the current
 * event is the trigger, the selects open in a popover underneath.
 */
export function EventPicker({
  year,
  meetingKey,
  sessionKey,
  selectedMeeting,
  countryFlagUrl,
  sessionLabel,
  live,
  meetings,
  sessions,
  meetingsPending,
  sessionsPending,
  meetingsFailed,
  sessionsFailed,
  isSelectingLatest,
  onYear,
  onMeeting,
  onSession,
  onLatest,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    if (next) trackEvent("nav_event_picker_opened");
    setOpen(next);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Choose event and session"
        title="Choose event and session"
        className={`group min-w-0 h-7 flex items-center gap-2 pl-2 pr-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
          open
            ? "bg-black/15 border-white/25"
            : "bg-black/[0.06] border-white/10 hover:bg-black/15 hover:border-white/25"
        }`}
      >
        {live && (
          <span className="flex items-center gap-1 bg-white text-f1red text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-f1red" />
            Live
          </span>
        )}
        {selectedMeeting ? (
          <>
            {countryFlagUrl && (
              <img
                src={countryFlagUrl}
                alt=""
                className="h-3.5 w-5 object-cover rounded-[2px] border border-white/30 shrink-0"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="min-w-0 text-white text-[10px] sm:text-[11px] font-bold uppercase tracking-wide truncate sm:max-w-[160px] lg:max-w-[240px]">
              {selectedMeeting.meeting_name}
            </span>
            <span className="hidden sm:inline text-white/70 text-[11px] font-bold uppercase tracking-widest shrink-0">
              {selectedMeeting.year}
            </span>
            {sessionLabel && (
              <span className="text-white/70 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest shrink-0">
                · {sessionLabel}
              </span>
            )}
            {selectedMeeting.is_cancelled && (
              <span className="bg-white text-f1red text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0">
                Cancelled
              </span>
            )}
          </>
        ) : (
          <span className="text-white/80 text-[10px] sm:text-[11px] font-bold tracking-widest uppercase truncate">
            Select session
          </span>
        )}
        <span className="ml-0.5 h-5 w-5 shrink-0 flex items-center justify-center rounded bg-white/[0.07] transition-colors group-hover:bg-white/15">
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 text-white/75 transition-transform group-hover:text-white ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          onLatest();
          setOpen(false);
        }}
        disabled={isSelectingLatest}
        title="Jump to the latest event and session"
        className="ml-1.5 h-7 px-2 shrink-0 rounded-md border border-white/10 bg-black/[0.06] text-white/80 text-[9px] font-black uppercase tracking-widest transition-colors hover:bg-black/15 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Latest
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Event and session"
          className="z-[230] flex flex-col gap-2.5 rounded-md border border-panel bg-surface p-3 shadow-2xl light:bg-white light:border-slate-300 max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(env(safe-area-inset-top)+2.5rem)] sm:absolute sm:left-0 sm:top-full sm:mt-1.5 sm:w-[22rem]"
        >
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 shrink-0">
              <span className={PICKER_FIELD_LABEL}>Year</span>
              <span className="relative inline-block">
                <select
                  aria-label="Season year"
                  value={year}
                  onChange={(e) => onYear(Number(e.target.value))}
                  className={`${PICKER_SELECT} h-7 w-[5.25rem]`}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className={PICKER_CHEVRON} />
              </span>
            </label>

            {(meetingsPending || sessionsPending) && (
              <span className="mb-1.5 text-muted text-[9px]">Loading…</span>
            )}
          </div>

          <label className="flex flex-col gap-1 min-w-0">
            <span className={PICKER_FIELD_LABEL}>Event</span>
            {meetingsFailed ? (
              <ErrorMessage message="Failed to load events" compact />
            ) : (
              <span className="relative min-w-0">
                <select
                  aria-label="Event"
                  value={meetingKey ?? ""}
                  onChange={(e) => onMeeting(e.target.value)}
                  disabled={meetingsPending}
                  className={`${PICKER_SELECT} h-7`}
                >
                  <option value="">— event —</option>
                  {meetings.map((m) => (
                    <option key={m.meeting_key} value={m.meeting_key}>
                      {m.location} — {m.meeting_name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className={PICKER_CHEVRON} />
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 min-w-0">
            <span className={PICKER_FIELD_LABEL}>Session</span>
            {sessionsFailed ? (
              <ErrorMessage message="Failed to load sessions" compact />
            ) : (
              <span className="relative min-w-0">
                <select
                  aria-label="Session"
                  value={sessionKey ?? ""}
                  onChange={(e) => {
                    onSession(e.target.value);
                    if (e.target.value !== "") setOpen(false);
                  }}
                  disabled={sessionsPending || !meetingKey}
                  className={`${PICKER_SELECT} h-7`}
                >
                  <option value="">— session —</option>
                  {sessions.map((s) => (
                    <option key={s.session_key} value={s.session_key}>
                      {s.session_name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className={PICKER_CHEVRON} />
              </span>
            )}
          </label>
        </div>
      )}
    </div>
  );
}
