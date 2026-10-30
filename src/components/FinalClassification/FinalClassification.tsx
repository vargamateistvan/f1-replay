import {
  useEffect,
  useId,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Driver, SessionResult } from "@/api/types";
import { teamColor } from "@/utils/color";
import { isPracticeSession, isQualiSession } from "@/utils/session";
import { Q3_GRID_SIZE } from "@/constants";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { DialogHeader } from "@/components/DialogHeader";
import { MaybeLink } from "@/components/MaybeLink";
import { driverPath } from "@/utils/driverProfile";
import { constructorPath } from "@/utils/constructorProfile";

interface Props {
  readonly results: SessionResult[];
  readonly drivers: Driver[];
  readonly sessionName?: string;
  readonly year?: number;
  readonly sessionKey?: number;
}

interface DialogProps extends Props {
  /** Mono text in the red header strip (e.g. event name and date). */
  readonly meta?: ReactNode;
  /** Line under the title; defaults to "Official session result". */
  readonly subtitle?: ReactNode;
  /** Results still loading / failed — shows a message instead of the table. */
  readonly status?: "loading" | "error" | "ready";
  /** Actions rendered in the dialog footer. */
  readonly footer?: ReactNode;
  readonly onClose: () => void;
}

interface DecoratedResult {
  result: SessionResult;
  driver: Driver | undefined;
  color: string;
  status: string;
  detail: string;
  phaseTimes: string[];
  isEliminated: boolean;
}

function normalizeValue(
  value: number | string | number[] | null,
): string | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value.length ? String(value[0]) : null;
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  return value;
}

function formatGapValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+") || trimmed.startsWith("-")) return trimmed;

  const numericLike = /^\d+(?:[.:]\d+)*$/.test(trimmed);
  return numericLike ? `+${trimmed}` : trimmed;
}

function formatDurationClock(seconds: number | number[] | null): string | null {
  if (seconds === null) return null;

  const value = Array.isArray(seconds) ? (seconds[0] ?? null) : seconds;
  if (value === null || !Number.isFinite(value)) return null;

  const totalMs = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatRelativeDurationClock(
  seconds: number | number[] | null,
): string | null {
  const formatted = formatDurationClock(seconds);
  return formatted ? `+${formatted}` : null;
}

function formatLapTime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(totalMs / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function toPhaseArray<T>(value: T | T[] | null): (T | null)[] {
  if (value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Qualifying results carry one entry per part: duration = [Q1, Q2, Q3] best
// lap times and gap_to_leader = [Q1, Q2, Q3] gaps (null where not reached).
function qualiPhaseTimes(result: SessionResult): (number | null)[] {
  const times = toPhaseArray(result.duration);
  return [0, 1, 2].map((i) => {
    const value = times[i] ?? null;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });
}

function lastPhaseIndex(result: SessionResult): number {
  const times = qualiPhaseTimes(result);
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] !== null) return i;
  }
  return -1;
}

function timedResultDetail(result: SessionResult, phased: boolean): string {
  const status = resultStatus(result);
  const idx = phased ? lastPhaseIndex(result) : 0;
  const time = phased
    ? (qualiPhaseTimes(result)[idx] ?? null)
    : typeof result.duration === "number"
      ? result.duration
      : (toPhaseArray(result.duration)[0] ?? null);
  const gapRaw = toPhaseArray(result.gap_to_leader)[phased ? idx : 0] ?? null;
  const gap = formatGapValue(
    normalizeValue(gapRaw as number | string | null),
  );

  if (time === null) return status === "CLASSIFIED" ? "No time" : status;
  if (result.position === 1 || gap === null || gap === "+0") {
    return formatLapTime(time) ?? "—";
  }
  return gap;
}

function resultStatus(result: SessionResult): string {
  if (result.dsq) return "DSQ";
  if (result.dns) return "DNS";
  if (result.dnf) return "DNF";
  return "CLASSIFIED";
}

function resultDetail(result: SessionResult): string {
  if (result.dsq || result.dns || result.dnf) {
    return (
      formatGapValue(normalizeValue(result.gap_to_leader)) ??
      formatRelativeDurationClock(result.duration) ??
      resultStatus(result)
    );
  }
  if (result.position === 1) {
    return formatDurationClock(result.duration) ?? "Winner";
  }
  return (
    formatGapValue(normalizeValue(result.gap_to_leader)) ??
    formatRelativeDurationClock(result.duration) ??
    "—"
  );
}

function sortResults(results: SessionResult[]): SessionResult[] {
  return [...results].sort((a, b) => {
    const aPos = a.position ?? Number.MAX_SAFE_INTEGER;
    const bPos = b.position ?? Number.MAX_SAFE_INTEGER;
    if (aPos !== bPos) return aPos - bPos;
    return a.driver_number - b.driver_number;
  });
}

// Eliminated / unclassified rows fall back to neutral token colours, not team hues.
const NEUTRAL_ACCENT = "rgb(var(--color-line))";
const NEUTRAL_TEXT = "rgb(var(--color-muted))";

export function FinalClassification({ results, drivers, sessionName, year, sessionKey }: Props) {
  return (
    <section className="shrink-0 border-t border-panel bg-track/95 backdrop-blur">
      <FinalClassificationContent
        results={results}
        drivers={drivers}
        sessionName={sessionName}
        year={year}
        sessionKey={sessionKey}
        tableClassName="max-h-[40vh] overflow-auto"
      />
    </section>
  );
}

export function FinalClassificationDialog({
  results,
  drivers,
  sessionName,
  year,
  sessionKey,
  meta,
  subtitle,
  status = "ready",
  footer,
  onClose,
}: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const hasResults = status === "ready" && results.length > 0;
  const emptyMessage =
    status === "loading"
      ? "Loading results…"
      : status === "error"
        ? "Couldn't load the results"
        : "No classification published for this session";

  // Portalled: the route shell's enter animation leaves a transform, which
  // would otherwise become the containing block for `fixed`.
  const dialog = (
    <div
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="results-backdrop"
      className="fixed inset-0 z-modal flex touch-pan-y items-end justify-center bg-black/70 pt-[env(safe-area-inset-top)] backdrop-blur-sm sm:items-center sm:px-6 sm:py-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden border border-panel bg-surface shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <DialogHeader
          eyebrow="Final classification"
          meta={meta}
          title={sessionName ?? "Session results"}
          titleId={titleId}
          subtitle={subtitle ?? "Official session result"}
          closeLabel="Close results dialog"
          onClose={onClose}
        />

        {hasResults ? (
          <FinalClassificationContent
            results={results}
            drivers={drivers}
            sessionName={sessionName}
            year={year}
            sessionKey={sessionKey}
            inDialog
            contentClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            tableClassName=""
          />
        ) : (
          <p
            role={status === "loading" ? "status" : undefined}
            className={`px-4 py-10 text-center font-mono text-caption uppercase tracking-caps sm:px-5 ${
              status === "error" ? "text-red-fg" : "text-muted"
            }`}
          >
            {emptyMessage}
          </p>
        )}

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-panel px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}

interface ContentProps extends Props {
  /** Dialog body: no inline header, sits on the dialog's surface colour. */
  readonly inDialog?: boolean;
  readonly contentClassName?: string;
  readonly tableClassName: string;
}

const TH = "px-3 py-2 font-black";
const TD = "px-3 py-2";

function FinalClassificationContent({
  results,
  drivers,
  sessionName,
  year,
  sessionKey,
  inDialog = false,
  contentClassName,
  tableClassName,
}: ContentProps) {
  const search = new URLSearchParams();
  if (year !== undefined) search.set("year", String(year));
  if (sessionKey !== undefined) search.set("session", String(sessionKey));
  const driverHref = (number: number) =>
    year === undefined ? undefined : `${driverPath(number)}?${search}`;
  const teamHref = (name: string | undefined) =>
    year === undefined || !name
      ? undefined
      : `${constructorPath(name)}?${search}`;
  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.driver_number, driver])),
    [drivers],
  );

  const phased = useMemo(
    () =>
      isQualiSession(sessionName ?? "") ||
      results.some(
        (result) =>
          Array.isArray(result.duration) && result.duration.length > 1,
      ),
    [results, sessionName],
  );
  const timed = phased || isPracticeSession(sessionName ?? "");
  const showPoints =
    !timed && results.some((result) => (result.points ?? 0) > 0);

  const decorated = useMemo<DecoratedResult[]>(() => {
    const outOfQuali = isQualiSession(sessionName ?? "");
    return sortResults(results).map((result) => {
      const driver = driverByNumber.get(result.driver_number);
      return {
        result,
        driver,
        color: teamColor(driver?.team_colour),
        status: resultStatus(result),
        detail: timed
          ? timedResultDetail(result, phased)
          : resultDetail(result),
        phaseTimes: phased
          ? qualiPhaseTimes(result).map((time) => formatLapTime(time) ?? "—")
          : [],
        isEliminated:
          outOfQuali &&
          (result.position === null || result.position > Q3_GRID_SIZE),
      };
    });
  }, [results, driverByNumber, sessionName, timed, phased]);

  const podium = decorated.filter(
    (entry) => entry.result.position && entry.result.position <= 3,
  );
  const surface = inDialog ? "bg-surface" : "bg-track/95";

  return (
    <div
      className={`flex min-h-0 flex-col ${inDialog ? "" : "bg-track/95 backdrop-blur"} ${contentClassName ?? ""}`.trim()}
    >
      {!inDialog && (
        <div className="border-b border-panel px-4 py-3 sm:px-5">
          <div className="text-caption font-black uppercase tracking-spaced text-f1red">
            Final Classification
          </div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div className="text-lg font-black text-fg sm:text-xl">
              {sessionName ?? "Session Results"}
            </div>
            <div className="text-small uppercase tracking-eyebrow text-muted">
              Official session result
            </div>
          </div>
        </div>
      )}

      {podium.length > 0 && (
        <ol className="hidden gap-2 border-b border-panel px-4 py-3 sm:grid sm:grid-cols-3 sm:px-5">
          {podium.map((entry) => (
            <li
              key={entry.result.driver_number}
              className="flex min-w-0 flex-col border border-t-2 border-panel bg-track/60 px-3 py-2.5"
              style={{ borderTopColor: entry.color }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-7 shrink-0 font-mono text-lg font-black tabular-nums text-fg">
                  P{entry.result.position}
                </span>
                <DriverHeadshot
                  driver={entry.driver}
                  accent={entry.color}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <MaybeLink
                    to={driverHref(entry.result.driver_number)}
                    aria-label={`${entry.driver?.full_name ?? `Driver ${entry.result.driver_number}`} driver profile`}
                    className="block hover:underline"
                  >
                    <span
                      className="block text-compact font-black uppercase tracking-wider"
                      style={{ color: entry.color }}
                    >
                      {entry.driver?.name_acronym ?? entry.result.driver_number}
                    </span>
                    <span className="block truncate text-small text-fg/85">
                      {entry.driver?.full_name ??
                        `Driver ${entry.result.driver_number}`}
                    </span>
                  </MaybeLink>
                  <MaybeLink
                    to={teamHref(entry.driver?.team_name)}
                    aria-label={`${entry.driver?.team_name ?? "Unknown team"} constructor profile`}
                    className="block truncate text-tiny uppercase tracking-caps text-muted hover:underline"
                  >
                    {entry.driver?.team_name ?? "Unknown team"}
                  </MaybeLink>
                </div>
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-panel pt-2 font-mono tabular-nums">
                <span className="text-tiny uppercase tracking-caps text-muted">
                  {showPoints ? `${entry.result.points ?? 0} pts` : null}
                </span>
                <span className="text-small text-fg">{entry.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div
        className={tableClassName}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr
              className={`sticky top-0 z-10 border-b border-panel ${surface} text-caption uppercase tracking-eyebrow text-faint`}
            >
              <th className={`${TH} pl-4 text-left sm:pl-5`}>Pos</th>
              <th className={`${TH} text-left`}>Driver</th>
              <th className={`${TH} hidden text-left md:table-cell`}>Team</th>
              <th className={`${TH} hidden text-right sm:table-cell`}>Laps</th>
              {phased ? (
                (["Q1", "Q2", "Q3"] as const).map((label) => (
                  <th key={label} className={`${TH} text-right last:pr-4 sm:last:pr-5`}>
                    {label}
                  </th>
                ))
              ) : (
                <>
                  <th className={`${TH} text-right last:pr-4 sm:last:pr-5`}>
                    {timed ? "Time / Gap" : "Gap / Time"}
                  </th>
                  {showPoints && (
                    <th className={`${TH} text-right last:pr-4 sm:last:pr-5`}>Pts</th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {decorated.map((entry) => {
              const unclassified =
                entry.result.position === null && entry.status !== "CLASSIFIED";
              const dim = entry.isEliminated || unclassified;
              const accent = dim ? NEUTRAL_ACCENT : entry.color;
              return (
                <tr
                  key={entry.result.driver_number}
                  className={`border-b border-panel/70 text-small transition-colors hover:bg-fg/5 ${
                    dim ? "text-muted" : "text-fg/90"
                  }`}
                >
                  <td
                    className={`${TD} pl-4 font-mono font-black tabular-nums sm:pl-5 ${
                      unclassified ? "text-red-fg" : dim ? "" : "text-fg"
                    }`}
                  >
                    {entry.result.position ??
                      (entry.status === "CLASSIFIED" ? "—" : entry.status)}
                  </td>
                  <td className={TD}>
                    <MaybeLink
                      to={driverHref(entry.result.driver_number)}
                      aria-label={`${entry.driver?.full_name ?? `Driver ${entry.result.driver_number}`} driver profile`}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <DriverHeadshot
                        driver={entry.driver}
                        accent={accent}
                        size="sm"
                      />
                      <span
                        className="h-4 w-[3px] shrink-0"
                        style={{ background: accent }}
                      />
                      <span
                        className="font-black"
                        style={{ color: dim ? NEUTRAL_TEXT : entry.color }}
                      >
                        {entry.driver?.name_acronym ??
                          entry.result.driver_number}
                      </span>
                      <span className="hidden truncate text-muted sm:inline">
                        {entry.driver?.full_name ?? "Unknown driver"}
                      </span>
                    </MaybeLink>
                    {entry.driver?.team_name && (
                      <MaybeLink
                        to={teamHref(entry.driver.team_name)}
                        aria-label={`${entry.driver.team_name} constructor profile`}
                        className="mt-1 block text-tiny text-muted hover:underline md:hidden"
                      >
                        {entry.driver.team_name}
                      </MaybeLink>
                    )}
                  </td>
                  <td className={`${TD} hidden text-muted md:table-cell`}>
                    <MaybeLink
                      to={teamHref(entry.driver?.team_name)}
                      aria-label={`${entry.driver?.team_name ?? "Unknown team"} constructor profile`}
                      className="hover:underline"
                    >
                      {entry.driver?.team_name ?? "—"}
                    </MaybeLink>
                  </td>
                  <td
                    className={`${TD} hidden text-right font-mono tabular-nums sm:table-cell`}
                  >
                    {entry.result.number_of_laps ?? "—"}
                  </td>
                  {phased ? (
                    entry.phaseTimes.map((time, i) => (
                      <td
                        key={i}
                        className={`${TD} text-right font-mono tabular-nums last:pr-4 sm:last:pr-5 ${
                          dim || time === "—" ? "text-muted" : "text-fg"
                        }`}
                      >
                        {time}
                      </td>
                    ))
                  ) : (
                    <>
                      <td
                        className={`${TD} text-right font-mono tabular-nums last:pr-4 sm:last:pr-5 ${dim ? "" : "text-fg"}`}
                      >
                        {entry.detail}
                      </td>
                      {showPoints && (
                        <td
                          className={`${TD} text-right font-mono font-black tabular-nums last:pr-4 sm:last:pr-5 ${
                            (entry.result.points ?? 0) > 0 ? "text-fg" : "text-muted"
                          }`}
                        >
                          {entry.result.points ?? 0}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
