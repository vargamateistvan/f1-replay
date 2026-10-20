import { useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useStandings } from "@/hooks/useStandings";
import { useNumberParam } from "@/hooks/useSearchParamState";
import { ErrorMessage } from "@/components/ErrorMessage";
import {
  PointsProgressionChart,
  type ProgressionSeries,
} from "@/components/PointsProgression/PointsProgressionChart";
import { TeammateComparison } from "@/components/TeammateComparison/TeammateComparison";
import { FinishDistribution } from "@/components/DriverProfile/DriverProfile";
import {
  ConstructorResults,
  ConstructorStatTiles,
  DriverLineup,
} from "@/components/ConstructorProfile/ConstructorProfile";
import { championshipPositions, driverPath } from "@/utils/driverProfile";
import {
  constructorFinishDistribution,
  constructorPath,
  constructorRoundPoints,
  constructorSeasonStats,
} from "@/utils/constructorProfile";
import { DEFAULT_YEAR } from "@/constants";
import { roundReplayPath } from "@/utils/url";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  PICKER_BAR,
  PICKER_CHEVRON,
  PICKER_FIELD_LABEL,
  PICKER_SELECT,
} from "@/components/Nav/pickerStyles";

const SECTION_TITLE =
  "mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted";

const TITLE_TEXT = {
  champion: "Constructors' Champion",
  leader: "Championship leader",
  contender: "In title contention",
  eliminated: "Out of title contention",
} as const;

export default function ConstructorProfile() {
  const params = useParams();
  const teamName = params.teamName ?? "";
  const { search } = useLocation();
  const navigate = useNavigate();
  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);

  const {
    driverStandings,
    constructorStandings,
    constructorProgression,
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

  const standing = constructorStandings.find((c) => c.name === teamName);
  const drivers = useMemo(
    () => driverStandings.filter((d) => d.constructorName === teamName),
    [driverStandings, teamName],
  );
  const rows = useMemo(
    () => drivers.map((d) => resultsGrid.cells.get(d.driverNumber) ?? []),
    [drivers, resultsGrid],
  );
  const stats = useMemo(
    () => constructorSeasonStats(resultsGrid.rounds, rows),
    [resultsGrid.rounds, rows],
  );
  const roundPoints = useMemo(
    () => constructorRoundPoints(resultsGrid.rounds, rows),
    [resultsGrid.rounds, rows],
  );
  const distribution = useMemo(
    () => constructorFinishDistribution(resultsGrid.rounds, rows),
    [resultsGrid.rounds, rows],
  );
  const positions = useMemo(
    () => championshipPositions(constructorProgression.totals, teamName),
    [constructorProgression, teamName],
  );
  const teammate = teammates.find((t) => t.team === teamName);

  // The team, its neighbours in the table and the leader.
  const series = useMemo<ProgressionSeries[]>(() => {
    if (!standing) return [];
    const index = constructorStandings.indexOf(standing);
    const picked = new Set([0, index - 1, index, index + 1]);
    return constructorStandings
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => picked.has(i))
      .map(({ c, i }) => ({
        // Index-based keys: team names may contain "." which Recharts reads as a path.
        key: `c${i}`,
        label: c.name,
        color: c.color,
        // Neighbours may share a colour family; keep the focused team solid.
        dashed: c !== standing,
        values: constructorProgression.totals.get(c.name) ?? [],
        // The current team's chip stays a highlight-only button.
        href: c === standing ? undefined : `${constructorPath(c.name)}${search}`,
      }));
  }, [standing, constructorStandings, constructorProgression, search]);

  usePageSeo(
    standing
      ? {
          title: `${standing.name} ${year} F1 Season | Constructor Results & Points | F1 Replay`,
          description: `${standing.name}'s ${year} Formula 1 constructors' season: P${standing.position} on ${standing.points} points with ${standing.wins} wins. Per-car round results, points by round and driver line-up.`,
          canonicalPath: `/standings/team/${encodeURIComponent(teamName)}${year !== DEFAULT_YEAR ? `?year=${year}` : ""}`,
          breadcrumb: standing.name,
        }
      : null,
  );

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden bg-track">
      <div className={PICKER_BAR}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4">
          <Link
            to={`/standings${search}`}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="h-3 w-3" />
            Standings
          </Link>
          {constructorStandings.length > 0 && (
            <label className="flex items-center gap-1">
              <span className={PICKER_FIELD_LABEL}>Team</span>
              <span className="relative inline-block">
                <select
                  aria-label="Team"
                  value={standing ? teamName : ""}
                  onChange={(e) =>
                    navigate(`${constructorPath(e.target.value)}${search}`, {
                      replace: true,
                    })
                  }
                  className={`${PICKER_SELECT} w-[11rem]`}
                >
                  {!standing && <option value="">—</option>}
                  {constructorStandings.map((c) => (
                    <option key={c.name} value={c.name}>
                      P{c.position} · {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className={PICKER_CHEVRON} />
              </span>
            </label>
          )}
          {/* The sections show their own loading states; on phones this would wrap. */}
          {isFetching && (
            <span className={`${PICKER_FIELD_LABEL} hidden sm:inline`}>
              Loading results…
            </span>
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
                ? "Loading team…"
                : `No ${year} championship entry for ${teamName || "this team"}`
            }
            variant="empty"
          />
        </div>
      ) : (
        <div className="md:min-h-0 md:flex-1 md:overflow-auto">
          <header
            className="flex items-center gap-4 border-b border-panel px-4 py-4"
            style={{
              background: `linear-gradient(90deg, ${standing.color}26, transparent 60%)`,
            }}
          >
            <span
              className="h-14 w-1.5 shrink-0 rounded-sm"
              style={{ background: standing.color }}
            />
            <div className="min-w-0">
              <h1
                className="truncate text-xl font-black"
                style={{ color: standing.color }}
              >
                {standing.name}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{year} season</span>
                <span aria-hidden="true">·</span>
                <span>{drivers.map((d) => d.acronym).join(" · ")}</span>
              </div>
              {standing.title && (
                <div
                  className={`mt-0.5 text-xs ${
                    standing.title.status === "eliminated"
                      ? "text-muted"
                      : "text-amber-300"
                  }`}
                >
                  {TITLE_TEXT[standing.title.status]}
                </div>
              )}
            </div>
          </header>

          <ConstructorStatTiles
            stats={stats}
            points={standing.points}
            position={standing.position}
          />

          <div className="grid border-t border-panel md:grid-cols-[minmax(320px,480px)_minmax(0,1fr)]">
            <div className="border-b border-panel md:border-b-0 md:border-r">
              <ConstructorResults
                rounds={resultsGrid.rounds}
                drivers={drivers}
                rows={rows}
                roundPoints={roundPoints}
                totals={constructorProgression.totals.get(teamName) ?? []}
                positions={positions}
                loading={isFetching}
                raceHref={(round, n) => roundReplayPath(year, round, n)}
              />
            </div>

            <div className="min-w-0">
              <div className="border-b border-panel p-4">
                <h2 className={SECTION_TITLE}>Points progression</h2>
                <PointsProgressionChart
                  rounds={constructorProgression.rounds}
                  series={series}
                  loading={isFetching}
                />
              </div>
              <div className="border-b border-panel p-4">
                <DriverLineup
                  drivers={drivers}
                  teamPoints={standing.points}
                  color={standing.color}
                  search={search}
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
                    driverHref={(n) => `${driverPath(n)}${search}`}
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
