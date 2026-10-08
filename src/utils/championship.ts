import type { SessionResult } from "@/api/types";
import {
  FASTEST_LAP_POINT,
  FASTEST_LAP_POINT_LAST_YEAR,
  RACE_POINTS,
  SPRINT_POINTS,
} from "@/constants";
import {
  isPointsSession,
  isSprintPointsSession,
  resultPoints,
} from "@/utils/standings";

interface RoundSession {
  session_key: number;
  session_type?: string;
  session_name?: string;
  date_start: string;
  circuit_short_name?: string;
  country_code?: string;
  is_cancelled?: boolean;
}

// ── Points progression ──────────────────────────────────────────────────────

export interface ProgressionRound {
  sessionKey: number;
  label: string;
  isSprint: boolean;
}

export interface PointsProgression<K> {
  rounds: ProgressionRound[];
  /** Cumulative points after each round, aligned with `rounds`. */
  totals: Map<K, number[]>;
}

// Cumulative points per competitor after every Race/Sprint. `keyOf` maps a
// driver number to the competitor (driver or team); null drops the entry.
// Rounds whose results have not loaded yet are skipped.
export function pointsProgression<K>(
  sessions: RoundSession[],
  results: (SessionResult[] | undefined)[],
  keyOf: (driverNumber: number) => K | null,
): PointsProgression<K> {
  const rounds: ProgressionRound[] = [];
  const perRound: Map<K, number>[] = [];
  const keys = new Set<K>();

  sessions.forEach((session, i) => {
    const result = results[i];
    if (!result) return;
    const isSprint = isSprintPointsSession(session);
    const earned = new Map<K, number>();
    for (const r of result) {
      const key = keyOf(r.driver_number);
      if (key === null) continue;
      keys.add(key);
      earned.set(key, (earned.get(key) ?? 0) + resultPoints(r, isSprint));
    }
    const base = session.circuit_short_name ?? session.country_code ?? "?";
    rounds.push({
      sessionKey: session.session_key,
      label: isSprint ? `${base} (S)` : base,
      isSprint,
    });
    perRound.push(earned);
  });

  const totals = new Map<K, number[]>();
  for (const key of keys) {
    let sum = 0;
    totals.set(
      key,
      perRound.map((earned) => (sum += earned.get(key) ?? 0)),
    );
  }
  return { rounds, totals };
}

// ── Title outlook ───────────────────────────────────────────────────────────

export type ChampionshipScope = "driver" | "team";

// Most points one driver (or one team, with a 1-2 finish) can score in a session.
export function maxSessionPoints(
  year: number,
  isSprint: boolean,
  scope: ChampionshipScope,
): number {
  const table: readonly number[] = isSprint ? SPRINT_POINTS : RACE_POINTS;
  const slots = scope === "team" ? 2 : 1;
  const base = table.slice(0, slots).reduce((sum, pts) => sum + pts, 0);
  const bonus =
    !isSprint && year <= FASTEST_LAP_POINT_LAST_YEAR ? FASTEST_LAP_POINT : 0;
  return base + bonus;
}

export interface RemainingPoints {
  races: number;
  sprints: number;
  driver: number;
  team: number;
}

// Points still on offer in Races/Sprints that start after `afterMs`.
export function remainingPoints(
  sessions: RoundSession[],
  afterMs: number,
  year: number,
): RemainingPoints {
  const out: RemainingPoints = { races: 0, sprints: 0, driver: 0, team: 0 };
  for (const s of sessions) {
    if (s.is_cancelled || !isPointsSession(s)) continue;
    if (!(Date.parse(s.date_start) > afterMs)) continue;
    const isSprint = isSprintPointsSession(s);
    if (isSprint) out.sprints += 1;
    else out.races += 1;
    out.driver += maxSessionPoints(year, isSprint, "driver");
    out.team += maxSessionPoints(year, isSprint, "team");
  }
  return out;
}

export type TitleStatus = "champion" | "leader" | "contender" | "eliminated";

export interface TitleOutlook {
  status: TitleStatus;
  /** Highest final total still reachable. */
  maxPoints: number;
}

// `standings` must be in championship order (the leader first, ties already
// broken by countback). A rival who can only draw level stays a contender.
export function titleOutlook<K>(
  standings: { key: K; points: number }[],
  remaining: number,
): Map<K, TitleOutlook> {
  const out = new Map<K, TitleOutlook>();
  const [leader, ...rivals] = standings;
  if (!leader) return out;

  const bestRival = Math.max(-Infinity, ...rivals.map((r) => r.points));
  const clinched = remaining === 0 || leader.points > bestRival + remaining;
  out.set(leader.key, {
    status: clinched ? "champion" : "leader",
    maxPoints: leader.points + remaining,
  });
  for (const r of rivals) {
    const maxPoints = r.points + remaining;
    out.set(r.key, {
      status: clinched || maxPoints < leader.points ? "eliminated" : "contender",
      maxPoints,
    });
  }
  return out;
}

// ── Teammate comparison ─────────────────────────────────────────────────────

export function isMainQualifyingSession(session: {
  session_type?: string;
  session_name?: string;
}): boolean {
  return (
    session.session_type === "Qualifying" &&
    !/sprint|shootout/i.test(session.session_name ?? "")
  );
}

export interface HeadToHead {
  a: number;
  b: number;
}

function classifiedRank(r: SessionResult | undefined): number {
  if (!r || r.dns || r.dsq || r.position === null) return Infinity;
  return r.position;
}

// Sessions where `a` / `b` finished ahead of the other. A session counts when
// at least one of them was classified; if neither was, it is skipped.
export function headToHead(
  results: (SessionResult[] | undefined)[],
  a: number,
  b: number,
): HeadToHead {
  const score: HeadToHead = { a: 0, b: 0 };
  for (const result of results) {
    if (!result) continue;
    const rankA = classifiedRank(result.find((r) => r.driver_number === a));
    const rankB = classifiedRank(result.find((r) => r.driver_number === b));
    if (rankA === rankB) continue;
    if (rankA < rankB) score.a += 1;
    else score.b += 1;
  }
  return score;
}

export interface TeammatePair {
  team: string;
  a: number;
  b: number;
}

// Pairs each team's two highest-scoring drivers, the higher scorer first.
// Teams with a single entrant are dropped.
export function teammatePairs(
  drivers: { driver_number: number; team_name: string }[],
  points: Map<number, number>,
): TeammatePair[] {
  const byTeam = new Map<string, number[]>();
  for (const d of drivers) {
    const list = byTeam.get(d.team_name) ?? [];
    if (!list.includes(d.driver_number)) list.push(d.driver_number);
    byTeam.set(d.team_name, list);
  }

  const pairs: TeammatePair[] = [];
  for (const [team, numbers] of byTeam) {
    if (numbers.length < 2) continue;
    const [a, b] = [...numbers].sort(
      (x, y) => (points.get(y) ?? 0) - (points.get(x) ?? 0) || x - y,
    );
    pairs.push({ team, a, b });
  }
  return pairs;
}
