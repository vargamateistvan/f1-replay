import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import type { Driver, SessionResult } from "@/api/types";
import { teamColor } from "@/utils/color";
import { DriverHeadshot } from "@/components/DriverHeadshot";

interface Props {
  readonly results: SessionResult[];
  readonly drivers: Driver[];
  readonly sessionName?: string;
}

interface DialogProps extends Props {
  readonly onClose: () => void;
}

interface DecoratedResult {
  result: SessionResult;
  driver: Driver | undefined;
  color: string;
  status: string;
  detail: string;
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

function resultStatus(result: SessionResult): string {
  if (result.dsq) return "DSQ";
  if (result.dns) return "DNS";
  if (result.dnf) return "DNF";
  return "CLASSIFIED";
}

function resultDetail(result: SessionResult): string {
  if (result.dsq || result.dns || result.dnf) {
    return (
      normalizeValue(result.gap_to_leader) ??
      formatRelativeDurationClock(result.duration) ??
      "Not classified"
    );
  }
  if (result.position === 1) {
    return formatDurationClock(result.duration) ?? "Winner";
  }
  return (
    normalizeValue(result.gap_to_leader) ??
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

export function FinalClassification({ results, drivers, sessionName }: Props) {
  return (
    <section className="shrink-0 border-t border-panel bg-[#0f1118]/95 backdrop-blur">
      <FinalClassificationContent
        results={results}
        drivers={drivers}
        sessionName={sessionName}
        tableClassName="max-h-[40vh] overflow-auto"
      />
    </section>
  );
}

export function FinalClassificationDialog({
  results,
  drivers,
  sessionName,
  onClose,
}: DialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 px-3 py-6 backdrop-blur-sm sm:px-6"
    >
      <div className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden border border-panel bg-[#0f1118] shadow-2xl">
        <div className="flex items-center justify-between border-b border-panel px-4 py-3 sm:px-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-f1red">
              Final Classification
            </div>
            <div className="mt-1 text-sm font-black text-white sm:text-base">
              {sessionName ?? "Session Results"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close results dialog"
            className="flex h-8 w-8 items-center justify-center text-lg text-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>

        <FinalClassificationContent
          results={results}
          drivers={drivers}
          sessionName={sessionName}
          hideHeader
          tableClassName="min-h-0 flex-1 overflow-auto"
        />
      </div>
    </div>
  );
}

interface ContentProps extends Props {
  readonly hideHeader?: boolean;
  readonly tableClassName: string;
}

function FinalClassificationContent({
  results,
  drivers,
  sessionName,
  hideHeader = false,
  tableClassName,
}: ContentProps) {
  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.driver_number, driver])),
    [drivers],
  );

  const decorated = useMemo<DecoratedResult[]>(() => {
    return sortResults(results).map((result) => {
      const driver = driverByNumber.get(result.driver_number);
      return {
        result,
        driver,
        color: teamColor(driver?.team_colour),
        status: resultStatus(result),
        detail: resultDetail(result),
      };
    });
  }, [results, driverByNumber]);

  const podium = decorated.filter(
    (entry) => entry.result.position && entry.result.position <= 3,
  );

  return (
    <div className="flex min-h-0 flex-col bg-[#0f1118]/95 backdrop-blur">
      {!hideHeader && (
        <div className="border-b border-panel px-4 py-3 sm:px-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-f1red">
            Final Classification
          </div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div className="text-lg font-black text-white sm:text-xl">
              {sessionName ?? "Session Results"}
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
              Official session result
            </div>
          </div>
        </div>
      )}

      {podium.length > 0 && (
        <div className="grid gap-2 border-b border-panel px-4 py-3 sm:grid-cols-3 sm:px-5">
          {podium.map((entry) => (
            <div
              key={entry.result.driver_number}
              className="border border-panel bg-surface px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <DriverHeadshot
                    driver={entry.driver}
                    accent={entry.color}
                    size="lg"
                  />
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                      P{entry.result.position}
                    </div>
                    <div
                      className="mt-1 text-base font-black"
                      style={{ color: entry.color }}
                    >
                      {entry.driver?.name_acronym ?? entry.result.driver_number}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                    Points
                  </div>
                  <div className="text-lg font-black text-white">
                    {entry.result.points ?? 0}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-white/85">
                {entry.driver?.full_name ??
                  `Driver ${entry.result.driver_number}`}
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {entry.driver?.team_name ?? "Unknown team"}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.14em]">
                <span className="text-muted">{entry.status}</span>
                <span className="font-mono text-white">{entry.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={tableClassName}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="sticky top-0 border-b border-panel bg-track/95 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
              <th className="px-4 py-2 text-left sm:px-5">Pos</th>
              <th className="px-4 py-2 text-left">Driver</th>
              <th className="hidden px-4 py-2 text-left md:table-cell">Team</th>
              <th className="px-4 py-2 text-right">Laps</th>
              <th className="px-4 py-2 text-right">Status</th>
              <th className="px-4 py-2 text-right sm:px-5">Gap / Time</th>
            </tr>
          </thead>
          <tbody>
            {decorated.map((entry) => (
              <tr
                key={entry.result.driver_number}
                className="border-b border-[#232632] text-xs text-white/90"
              >
                <td className="px-4 py-2.5 font-black tabular-nums sm:px-5">
                  {entry.result.position ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <DriverHeadshot
                      driver={entry.driver}
                      accent={entry.color}
                      size="sm"
                    />
                    <span
                      className="h-4 w-[3px] shrink-0"
                      style={{ background: entry.color }}
                    />
                    <span className="font-black" style={{ color: entry.color }}>
                      {entry.driver?.name_acronym ?? entry.result.driver_number}
                    </span>
                    <span className="hidden text-muted sm:inline">
                      {entry.driver?.full_name ?? "Unknown driver"}
                    </span>
                  </div>
                </td>
                <td className="hidden px-4 py-2.5 text-muted md:table-cell">
                  {entry.driver?.team_name ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white">
                  {entry.result.number_of_laps ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-muted">
                  {entry.status}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white sm:px-5">
                  {entry.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
