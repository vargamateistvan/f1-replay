import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useStandings } from "@/hooks/useStandings";
import { useNumberParam } from "@/hooks/useSearchParamState";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { ErrorMessage } from "@/components/ErrorMessage";
import {
  PointsProgressionChart,
  type ProgressionSeries,
} from "@/components/PointsProgression/PointsProgressionChart";
import { TeammateComparison } from "@/components/TeammateComparison/TeammateComparison";
import {
  DriverStatTiles,
  FinishDistribution,
  SeasonResults,
} from "@/components/DriverProfile/DriverProfile";
import {
  championshipPositions,
  driverSeasonStats,
  finishDistribution,
} from "@/utils/driverProfile";
import { DEFAULT_YEAR } from "@/constants";
import {
  PICKER_BAR,
  PICKER_CHEVRON,
  PICKER_FIELD_LABEL,
  PICKER_SELECT,
} from "@/components/Nav/pickerStyles";

const SECTION_TITLE =
  "mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted";

const TITLE_TEXT = {
  champion: "World Champion",
  leader: "Championship leader",
  contender: "In title contention",
  eliminated: "Out of title contention",
} as const;

export default function DriverProfile() {
  const params = useParams();
  const driverNumber = Number(params.driverNumber);
  const { search } = useLocation();
  const navigate = useNavigate();
  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);

  const {
    driverStandings,
    driverProgression,
    teammates,
    resultsGrid,
    qualifyingLoading,
    isLoading,
    isFetching,
    isError,
  } = useStandings(year, sessionKey, meetingKey, {
    includeQualifying: true,
    includeResultMarkers: true,
  });

  const standing = driverStandings.find((d) => d.driverNumber === driverNumber);
  const leader = driverStandings[0];
  const teammate = teammates.find(
    (t) => t.a.driverNumber === driverNumber || t.b.driverNumber === driverNumber,
  );
  const teammateStanding =
    teammate &&
    (teammate.a.driverNumber === driverNumber ? teammate.b : teammate.a);

  const row = useMemo(
    () => resultsGrid.cells.get(driverNumber) ?? [],
    [resultsGrid, driverNumber],
  );
  const stats = useMemo(
    () => driverSeasonStats(resultsGrid.rounds, row),
    [resultsGrid.rounds, row],
  );
  const distribution = useMemo(
    () => finishDistribution(resultsGrid.rounds, row),
    [resultsGrid.rounds, row],
  );
  const positions = useMemo(
    () => championshipPositions(driverProgression.totals, driverNumber),
    [driverProgression, driverNumber],
  );

  // The driver, their teammate (dashed — same colour) and the leader.
  const series = useMemo<ProgressionSeries[]>(() => {
    if (!standing) return [];
    const entries = [
      { d: standing, dashed: false },
      ...(teammateStanding ? [{ d: teammateStanding, dashed: true }] : []),
      ...(leader &&
      leader.driverNumber !== standing.driverNumber &&
      leader.driverNumber !== teammateStanding?.driverNumber
        ? [{ d: leader, dashed: false }]
        : []),
    ];
    return entries.map(({ d, dashed }) => ({
      key: `d${d.driverNumber}`,
      label: d.acronym,
      color: d.color,
      dashed,
      values: driverProgression.totals.get(d.driverNumber) ?? [],
    }));
  }, [standing, teammateStanding, leader, driverProgression]);

  useEffect(() => {
    if (standing) document.title = `${standing.fullName} ${year} Season | F1 Replay`;
  }, [standing, year]);

  const backTo = `/standings${search}`;

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden bg-track">
      <div className={PICKER_BAR}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4">
          <Link
            to={backTo}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="h-3 w-3" />
            Standings
          </Link>
          <span className={PICKER_FIELD_LABEL}>{year}</span>
          {driverStandings.length > 0 && (
            <label className="flex items-center gap-1">
              <span className={PICKER_FIELD_LABEL}>Driver</span>
              <span className="relative inline-block">
                <select
                  aria-label="Driver"
                  value={standing ? driverNumber : ""}
                  onChange={(e) =>
                    navigate(`/standings/driver/${e.target.value}${search}`, {
                      replace: true,
                    })
                  }
                  className={`${PICKER_SELECT} w-[11rem]`}
                >
                  {!standing && <option value="">—</option>}
                  {driverStandings.map((d) => (
                    <option key={d.driverNumber} value={d.driverNumber}>
                      P{d.position} · {d.fullName}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className={PICKER_CHEVRON} />
              </span>
            </label>
          )}
          {isFetching && (
            <span className={PICKER_FIELD_LABEL}>Loading results…</span>
          )}
        </div>
      </div>

      {isError ? (
        <div className="flex-1">
          <ErrorMessage message="Failed to load championship data" />
        </div>
      ) : !standing ? (
        <div className="flex-1">
          <ErrorMessage
            message={
              isLoading
                ? "Loading driver…"
                : `No ${year} championship entry for driver #${params.driverNumber}`
            }
            variant="empty"
          />
        </div>
      ) : (
        <div className="md:min-h-0 md:flex-1 md:overflow-auto">
          {/* Header */}
          <header
            className="flex items-center gap-4 border-b border-panel px-4 py-4"
            style={{
              background: `linear-gradient(90deg, ${standing.color}26, transparent 60%)`,
            }}
          >
            <DriverHeadshot driver={standing.driver} accent={standing.color} size="lg" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate text-xl font-black">{standing.fullName}</h1>
                <span
                  className="font-mono text-sm font-black"
                  style={{ color: standing.color }}
                >
                  #{standing.driverNumber}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="h-3 w-[3px]" style={{ background: standing.color }} />
                <span>{standing.team}</span>
                <span aria-hidden="true">·</span>
                <span>{year} season</span>
                {standing.title && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        standing.title.status === "eliminated"
                          ? "text-muted"
                          : "text-amber-300"
                      }
                    >
                      {TITLE_TEXT[standing.title.status]}
                    </span>
                  </>
                )}
              </div>
            </div>
          </header>

          <DriverStatTiles
            stats={stats}
            points={standing.points}
            position={standing.position}
          />

          <div className="grid border-t border-panel md:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
            <div className="border-b border-panel md:border-b-0 md:border-r">
              <SeasonResults
                rounds={resultsGrid.rounds}
                cells={row}
                totals={driverProgression.totals.get(driverNumber) ?? []}
                positions={positions}
                loading={isFetching}
              />
            </div>

            <div className="min-w-0">
              <div className="border-b border-panel p-4">
                <h2 className={SECTION_TITLE}>Points progression</h2>
                <PointsProgressionChart
                  rounds={driverProgression.rounds}
                  series={series}
                  loading={isFetching}
                />
              </div>
              <div className="border-b border-panel p-4">
                <FinishDistribution counts={distribution} />
              </div>
              {teammate && (
                <div>
                  <h2 className={`${SECTION_TITLE} px-4 pt-4 mb-0`}>
                    Teammate head-to-head
                  </h2>
                  <TeammateComparison
                    comparisons={[teammate]}
                    qualifyingLoading={qualifyingLoading}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
