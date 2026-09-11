import { project, historyWeeks } from './projections.ts';
import type { Forecast, GameSample } from './projections.ts';
import type { Player } from './types.ts';

export type DepthPlayer = {
  id: string;
  name: string;
  team: string;
  position: string;
  slot: string;
  depth: number;
  status: string;
  injury: string;
  ahead: { id: string; name: string; status: string; injury: string }[];
};
export type DepthTeam = {
  parserVersion?: number;
  season: number;
  team: string;
  checkedAt: string;
  source: string;
  url: string;
  players: Record<string, DepthPlayer>;
  roster: Record<
    string,
    { name: string; position?: string; status: string; injury: string }
  >;
  complete: boolean;
};
export type RoleAssessment = {
  status: 'starter' | 'rotation' | 'reserve' | 'inactive' | 'unknown' | 'unit';
  label: string;
  detail: string;
  depth: number | null;
  slot: string | null;
  source: string;
  sourceUrl: string | null;
  checkedAt: string | null;
  ahead: string[];
  excluded: boolean;
  verified: boolean;
  usage: {
    games: number;
    through: string | null;
    snaps: number | null;
    targets: number | null;
    carries: number | null;
    passAttempts: number | null;
    noAppearance: number;
  };
  compatibleGames: number;
};
const mean = (values: (number | undefined)[]) => {
  const known = values.filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n),
  );
  return known.length === values.length && known.length
    ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100) / 100
    : null;
};
export function snapShare(game: GameSample): number | undefined {
  return typeof game.snaps === 'number' &&
    typeof game.teamSnaps === 'number' &&
    game.teamSnaps > 0 &&
    game.snaps >= 0 &&
    game.snaps <= game.teamSnaps
    ? game.snaps / game.teamSnaps
    : undefined;
}
const inactive =
  /practice.?squad|reserve|suspend|retired|released|inactive|out|pup|non.?football|exempt/i;
const isInactive = (status: string, injury: string) =>
  inactive.test(status) ||
  /^(out|injured reserve|injury_reserve|IR|suspended|pup)$/i.test(injury);

// These screens assess an entire recent workload window against the current chart role.
// They do not multiply points by an invented depth-chart percentage.
export function compatibleRoleGame(
  game: GameSample,
  position: string,
  depth: number,
) {
  if (position === 'DEF' || position === 'K') return true;
  const snap = snapShare(game),
    touches = (game.carries ?? 0) + (game.targets ?? 0);
  if (position === 'QB')
    return (
      depth === 1 &&
      ((game.passAttempts ?? 0) >= 15 || (snap !== undefined && snap >= 0.5))
    );
  if (depth === 1)
    return snap !== undefined
      ? snap >= 0.4
      : position === 'RB'
        ? touches >= 6
        : (game.targets ?? 0) >= (position === 'TE' ? 2 : 3);
  if (depth === 2)
    return snap !== undefined
      ? snap >= 0.15 && snap <= 0.7
      : position === 'RB'
        ? touches >= 3 && touches <= 16
        : (game.targets ?? 0) >= 2 && (game.targets ?? 0) <= 6;
  // Deep reserves need real, small-role appearances; past starter games are not comparable.
  return snap !== undefined && snap > 0 && snap <= 0.3;
}
export function compatibleRoleWindow(
  games: GameSample[],
  position: string,
  depth: number,
) {
  if (games.length < 3) return false;
  const shares = games.map(snapShare),
    snap = mean(shares);
  return compatibleRoleGame(
    {
      season: games[0].season,
      week: games[0].week,
      points: 0,
      passAttempts: mean(games.map((g) => g.passAttempts)) ?? undefined,
      carries: mean(games.map((g) => g.carries)) ?? undefined,
      targets: mean(games.map((g) => g.targets)) ?? undefined,
      snaps: snap === null ? undefined : snap * 100,
      teamSnaps: snap === null ? undefined : 100,
    },
    position,
    depth,
  );
}

export function roleForecast(
  player: Player,
  samples: GameSample[],
  team: DepthTeam | undefined,
  athleteId: string | undefined,
  season: number,
  week: number,
  currentWeek: number,
  receptionWeight = 0,
  now = Date.now(),
): { forecast: Forecast; role: RoleAssessment } {
  const historical = project(
    samples,
    season,
    week,
    currentWeek,
    receptionWeight,
  );
  const window = new Set(
    historyWeeks(season, week, currentWeek).map((g) => `${g.season}:${g.week}`),
  );
  const recent = samples
    .filter(
      (g) => g.team === player.team && window.has(`${g.season}:${g.week}`),
    )
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .filter(
      (g, i, all) =>
        all.findIndex((x) => x.season === g.season && x.week === g.week) === i,
    )
    .slice(0, 3);
  const latest = recent[0];
  const role: RoleAssessment = {
    status: 'unknown',
    label: 'Role unverified',
    detail:
      'Current NFL depth-chart or roster evidence is missing. Historical scoring is shown for reference only.',
    depth: null,
    slot: null,
    source: team?.source ?? 'ESPN NFL depth chart and roster',
    sourceUrl: team?.url ?? null,
    checkedAt: team?.checkedAt ?? null,
    ahead: [],
    excluded: false,
    verified: false,
    compatibleGames: 0,
    usage: {
      games: recent.length,
      through: latest ? `${latest.season} W${latest.week}` : null,
      snaps: mean(recent.map(snapShare)),
      targets: mean(recent.map((g) => g.targets)),
      carries: mean(recent.map((g) => g.carries)),
      passAttempts: mean(recent.map((g) => g.passAttempts)),
      noAppearance: recent.filter((g) => g.activeWithoutAppearance).length,
    },
  };
  const finish = (games: GameSample[] = []) => {
    if (week !== currentWeek) {
      games = [];
      role.detail =
        'Current depth-chart evidence is not an as-of forecast for another week. Historical scores remain available for research.';
    }
    const adjusted = project(games, season, week, currentWeek, receptionWeight);
    role.compatibleGames = adjusted.games;
    const forecast: Forecast = {
      ...adjusted,
      baselinePoints: historical.points,
      baselineHistory: historical.history,
      note:
        role.detail +
        (role.verified && !role.excluded
          ? adjusted.points === null
            ? ` ${adjusted.note}`
            : adjusted.games < 6
              ? ` Small sample: ${adjusted.games} recent appearances can vary widely.`
              : ''
          : ''),
    };
    return { forecast, role };
  };
  if (!player.team || ['FA', '—', 'UNK'].includes(player.team)) {
    Object.assign(role, {
      status: 'inactive',
      label: 'No current NFL team',
      detail:
        'No current NFL team is verified. Old-team production is excluded.',
      excluded: true,
    });
    return finish();
  }
  if (isInactive('', player.injury) || player.reserve || player.taxi) {
    Object.assign(role, {
      status: 'inactive',
      label: player.taxi
        ? 'Taxi squad'
        : player.reserve
          ? 'On injured reserve'
          : player.injury.replaceAll('_', ' '),
      detail:
        'Unavailable for this fantasy lineup. Historical production is not an actionable forecast.',
      excluded: true,
    });
    return finish();
  }
  if (
    !team ||
    team.team !== player.team ||
    team.season !== season ||
    !team.complete ||
    !Number.isFinite(Date.parse(team.checkedAt)) ||
    Date.parse(team.checkedAt) > now + 60000 ||
    now - Date.parse(team.checkedAt) > 1800000
  )
    return finish();
  if (player.position === 'DEF') {
    Object.assign(role, {
      status: 'unit',
      label: 'Team defense',
      detail: 'Current NFL team verified; using that unit’s historical games.',
      verified: true,
    });
    return finish(historical.history.filter((g) => g.team === player.team));
  }
  const roster = athleteId ? team.roster[athleteId] : undefined,
    entry = athleteId ? team.players[athleteId] : undefined;
  if (roster && isInactive(roster.status, roster.injury)) {
    Object.assign(role, {
      status: 'inactive',
      label: roster.injury || roster.status,
      detail: `Current NFL roster status: ${roster.status}${roster.injury ? ` · ${roster.injury}` : ''}. Excluded from weekly recommendations.`,
      excluded: true,
      verified: true,
    });
    return finish();
  }
  if (
    !entry ||
    !roster ||
    !['active', 'day-to-day', 'news'].includes(roster.status) ||
    entry.team !== player.team ||
    entry.position !== player.position
  )
    return finish();
  Object.assign(role, {
    depth: entry.depth,
    slot: entry.slot,
    verified: true,
    ahead: entry.ahead.map(
      (p) => `${p.name}${p.injury ? ` (${p.injury})` : ''}`,
    ),
  });
  if (
    (player.position === 'QB' || player.position === 'K') &&
    entry.depth > 1
  ) {
    Object.assign(role, {
      status: 'reserve',
      label: `Reserve ${player.position} · depth ${entry.depth}`,
      detail: `Listed behind ${role.ahead.join(', ') || 'the starter'}. Past starts are not a starting-role projection. No automatic promotion is assumed if a teammate is injured.`,
      excluded: true,
    });
    return finish();
  }
  Object.assign(role, {
    status: entry.depth === 1 ? 'starter' : 'rotation',
    label:
      entry.depth === 1
        ? `${entry.slot} · first unit`
        : `${entry.slot} · depth ${entry.depth}`,
    detail:
      entry.depth === 1
        ? 'Listed first in this depth-chart slot. The three most recent same-team games are assessed together, including low-output games.'
        : 'Listed behind ' +
          (role.ahead.join(', ') || 'the first unit') +
          '. The three most recent same-team workloads must support a rotational role; no automatic injury promotion.',
  });
  if (entry.depth > 2) {
    role.status = 'reserve';
    role.label = `Deep reserve · ${entry.slot} ${entry.depth}`;
  }
  if (recent.length >= 3 && recent.every((g) => snapShare(g) === 0)) {
    Object.assign(role, {
      status: 'reserve',
      label: 'No recent offensive snaps',
      detail:
        'The last three observed games on this team show zero offensive snaps. Older starter production is excluded.',
      excluded: true,
    });
    return finish();
  }
  const sameTeam = historical.history.filter((g) => g.team === player.team);
  if (sameTeam.length < 3 && historical.games >= 3) {
    role.detail =
      'The historical baseline comes from another NFL team. There are not yet three comparable appearances with the current team; no carry-over starting projection.';
    return finish();
  }
  if (player.position === 'K') {
    role.detail =
      'Listed as the current kicker. Using up to eight same-team appearances; field-goal attempts are not guaranteed.';
    return finish(sameTeam);
  }
  const sampleWindow = sameTeam.slice(0, 3);
  if (
    !compatibleRoleWindow(sampleWindow, player.position, entry.depth) ||
    recent.filter((g) => g.activeWithoutAppearance).length >= 2
  ) {
    role.detail +=
      ' The recent workload window does not establish a comparable role; the estimate is withheld pending clearer usage.';
    return finish();
  }
  // Preserve every game in the recent window: do not select only high-target/high-scoring games.
  return finish(sampleWindow);
}
