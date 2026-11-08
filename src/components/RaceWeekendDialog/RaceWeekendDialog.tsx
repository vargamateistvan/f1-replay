import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type { Session, Stint } from "@/api/types";
import { DialogHeader } from "@/components/DialogHeader";
import { CompoundRing } from "@/components/LiveTiming/TyreBadge";
import { useDrivers, useWeekendStints } from "@/hooks/useSession";
import { estimateWeekendTyres } from "@/utils/weekendTyres";
import type { ScheduleRound } from "@/utils/schedule";
import { driverPath } from "@/utils/driverProfile";

const TYRE_REFERENCE_URL =
  "https://www.formula1.com/en/latest/article/the-beginners-guide-to-f1-tyres.61SvF0Kfg29UR2SPhakDqd";

interface Props {
  round: ScheduleRound;
  onClose: () => void;
}

function formatRaceStart(session: Session | undefined): string | null {
  if (!session) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.date_start));
}

export function RaceWeekendDialog({ round, onClose }: Props) {
  const titleId = useId();
  const { meeting } = round;
  const raceSession = round.sessions.find(({ session }) => session.session_type === "Race")
    ?.session;
  const beforeRaceSessions = raceSession
    ? round.sessions
        .filter(
          ({ session, status }) =>
            session.date_start < raceSession.date_start &&
            (status === "completed" || status === "live"),
        )
        .map(({ session }) => session)
    : [];
  const driversQuery = useDrivers(raceSession?.session_key ?? null);
  const driversByNumber = new Map(
    (driversQuery.data ?? []).map((driver) => [driver.driver_number, driver]),
  );
  const stintsQuery = useWeekendStints(beforeRaceSessions);
  const stintsBySession = new Map<number, Stint[]>();
  for (const stint of stintsQuery.data) {
    const sessionStints = stintsBySession.get(stint.session_key) ?? [];
    sessionStints.push(stint);
    stintsBySession.set(stint.session_key, sessionStints);
  }
  const cumulativeStints: Stint[] = [];
  const sessionUsage = beforeRaceSessions.map((session) => {
    const sessionStints = stintsBySession.get(session.session_key) ?? [];
    cumulativeStints.push(...sessionStints);
    const participatingDrivers = new Set(
      sessionStints.map(({ driver_number }) => driver_number),
    );
    return {
      session,
      estimates: estimateWeekendTyres(cumulativeStints).filter(({ driverNumber }) =>
        participatingDrivers.has(driverNumber),
      ),
    };
  });
  const hasSessionStintData = sessionUsage.some(({ session }) =>
    (stintsBySession.get(session.session_key)?.length ?? 0) > 0,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dialog = (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-3 py-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-y-auto border border-panel bg-surface shadow-2xl"
      >
        <DialogHeader
          eyebrow="Tyre usage"
          meta={`${meeting.circuit_short_name} · ${meeting.year}`}
          title={meeting.meeting_name}
          titleId={titleId}
          subtitle={`${meeting.location} · ${raceSession ? `Race ${formatRaceStart(raceSession)}` : "Race session not listed"}`}
          closeLabel="Close race weekend details"
          onClose={onClose}
        />

        <div className="space-y-5 p-4 sm:p-5">
          <section aria-labelledby={`${titleId}-tyres`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-tiny font-black uppercase tracking-widest text-f1red-fg">
                  Strategy
                </p>
                <h3
                  id={`${titleId}-tyres`}
                  className="mt-1 text-sm font-black uppercase tracking-wider text-fg"
                >
                  Tyre sets remaining by session
                </h3>
              </div>
            </div>

            {stintsQuery.isPending ? (
              <p role="status" className="mt-4 text-small text-muted">
                Loading pre-race tyre usage…
              </p>
            ) : !hasSessionStintData ? (
              <p className="mt-4 border border-panel bg-track px-3 py-3 text-small text-muted">
                No pre-race tyre stint data is available yet.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {sessionUsage.map(({ session, estimates }) => {
                  const hasData = (stintsBySession.get(session.session_key)?.length ?? 0) > 0;
                  if (!hasData) return null;
                  return (
                    <section
                      key={session.session_key}
                      aria-label={`${session.session_name} tyre usage`}
                      className="border border-panel"
                    >
                      <h4 className="border-b border-panel bg-track px-3 py-2 text-tiny font-black uppercase tracking-widest text-fg">
                        {session.session_name}
                      </h4>
                      <div className="space-y-2 p-2">
                        {estimates.map(({ driverNumber, compounds }) => {
                          const driver = driversByNumber.get(driverNumber);
                          const profileParams = new URLSearchParams({
                            year: String(meeting.year),
                            ...(raceSession
                              ? { session: String(raceSession.session_key) }
                              : {}),
                          });
                          return (
                            <div
                              key={driverNumber}
                              className="grid grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))] items-center gap-1 bg-track px-2 py-2 sm:gap-2 sm:px-3"
                            >
                              <Link
                                to={`${driverPath(driverNumber)}?${profileParams}`}
                                aria-label={`${driver?.full_name ?? driver?.name_acronym ?? `Driver ${driverNumber}`} profile`}
                                title={driver?.full_name ?? `#${driverNumber}`}
                                className="min-w-0 pr-1 hover:text-f1red-fg focus-visible:text-f1red-fg sm:pr-2"
                              >
                                <span className="block truncate text-tiny font-bold text-fg sm:text-small">
                                  {driver?.full_name ?? driver?.name_acronym ?? `#${driverNumber}`}
                                </span>
                                <span className="block font-mono text-micro tabular-nums text-muted">
                                  #{driverNumber}
                                </span>
                              </Link>
                              {compounds.map(({ compound, used, remaining, allocated }) => (
                                <div
                                  key={compound}
                                  role="group"
                                  className="flex min-w-0 flex-col items-center gap-0.5"
                                  aria-label={`${compound}: ${used} used, ${remaining} estimated remaining out of ${allocated}`}
                                >
                                  <CompoundRing compound={compound} size="sm" />
                                  <span className="font-mono text-micro tabular-nums text-fg">
                                    {remaining}/{allocated}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        <div className="flex justify-end gap-2 pr-2 text-micro font-bold uppercase tracking-widest text-muted">
                          <span className="w-10" aria-hidden="true" />
                          {["H", "M", "S", "I", "W"].map((letter) => (
                            <span key={letter} className="w-8 text-center">
                              {letter}
                            </span>
                          ))}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {stintsQuery.isError && (
              <p role="alert" className="mt-3 text-small text-orange-fg">
                Some session tyre data failed to load; these estimates may be incomplete.
              </p>
            )}

            <p className="mt-3 text-caption leading-4 text-muted">
              Each session shows estimated sets left / standard allocation, cumulative
              through that session. Columns are hard, medium, soft, intermediate and wet
              (H/M/S/I/W). Use is inferred from fresh
              tyre stints; OpenF1 does not provide set IDs, so these are not official
              remaining counts. Sprint and event-specific allocations may differ.
            </p>
            <a
              href={TYRE_REFERENCE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-f1red-fg hover:text-f1red"
            >
              Standard allocation reference
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          </section>

          {round.sessions.length > 0 && (
            <section aria-labelledby={`${titleId}-sessions`}>
              <h3
                id={`${titleId}-sessions`}
                className="text-tiny font-black uppercase tracking-widest text-muted"
              >
                Weekend sessions
              </h3>
              <div className="mt-2 divide-y divide-panel border-y border-panel">
                {round.sessions.map(({ session, status }) => (
                  <div
                    key={session.session_key}
                    className="flex items-center justify-between gap-3 py-2 text-small"
                  >
                    <span className="font-bold uppercase tracking-wider text-fg">
                      {session.session_name}
                    </span>
                    <span className="font-mono text-caption uppercase tracking-wider text-muted">
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
