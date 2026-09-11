import type { DepthTeam, DepthPlayer } from './roles.ts';
type RosterAthlete = {
  id: string;
  fullName: string;
  position?: { abbreviation?: string };
  status?: { type?: string };
  injuries?: { status?: string; date?: string }[];
};
type RosterResponse = {
  season?: { year?: number };
  team?: { id?: string };
  athletes?: { position: string; items: RosterAthlete[] }[];
};
type ChartResponse = {
  items?: {
    id: string;
    name: string;
    positions: Record<
      string,
      {
        position: { abbreviation: string };
        athletes: { slot: number; rank: number; athlete: { $ref: string } }[];
      }
    >;
  }[];
};
export const normalizeTeam = (team: string) =>
  ({ WSH: 'WAS', JAC: 'JAX', LA: 'LAR' })[team] ?? team;
const normalizePosition = (position: string | undefined) =>
  position === 'PK' ? 'K' : position;
const normalizeName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export function normalizeDepth(
  chart: ChartResponse,
  roster: RosterResponse,
  season: number,
  teamId: string,
  abbreviation: string,
  checkedAt: string,
): DepthTeam {
  const team = normalizeTeam(abbreviation);
  const result: DepthTeam = {
    parserVersion: 2,
    season,
    team,
    checkedAt,
    source: 'ESPN NFL depth chart + current roster',
    url: `https://www.espn.com/nfl/team/depth/_/name/${abbreviation.toLowerCase()}`,
    players: {},
    roster: {},
    complete: false,
  };
  const conflicts = new Set<string>();
  if (
    roster.season?.year !== season ||
    String(roster.team?.id) !== teamId ||
    !Array.isArray(roster.athletes) ||
    !Array.isArray(chart.items)
  )
    return result;
  for (const group of roster.athletes)
    for (const p of group.items) {
      const latest = [...(p.injuries ?? [])].sort(
        (a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? ''),
      )[0];
      result.roster[p.id] = {
        name: p.fullName,
        position: normalizePosition(p.position?.abbreviation),
        status: ['practiceSquad', 'suspended', 'injuredReserveOrOut'].includes(
          group.position,
        )
          ? group.position
          : (p.status?.type ?? 'unknown'),
        injury: latest?.status ?? '',
      };
    }
  for (const formation of chart.items)
    for (const data of Object.values(formation.positions ?? {})) {
      const position = normalizePosition(data.position?.abbreviation)!;
      if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) continue;
      // ESPN ranks across the whole position; slot numbers identify parallel rows.
      // Reject truncated/malformed ranks before grouping so a backup cannot become first unit.
      const ordered = [...data.athletes].sort((a, b) => a.rank - b.rank);
      if (
        !ordered.length ||
        ordered.some((a, i) => a.rank !== i + 1 || !Number.isInteger(a.slot))
      )
        continue;
      const slots = [...new Set(data.athletes.map((a) => a.slot))].sort(
        (a, b) => a - b,
      );
      const firstRanks = slots
        .map((slot) =>
          Math.min(
            ...ordered.filter((a) => a.slot === slot).map((a) => a.rank),
          ),
        )
        .sort((a, b) => a - b);
      if (firstRanks.some((rank, i) => rank !== i + 1)) continue;
      for (const [index, slot] of slots.entries()) {
        const row = data.athletes
          .filter((a) => a.slot === slot && Number.isFinite(a.rank))
          .sort((a, b) => a.rank - b.rank);
        const prior: DepthPlayer['ahead'] = [];
        for (const [i, a] of row.entries()) {
          const id = a.athlete.$ref.match(
            new RegExp(`/seasons/${season}/athletes/(\\d+)(?:\\?|$)`),
          )?.[1];
          if (!id || conflicts.has(id)) continue;
          const identity = result.roster[id];
          const p: DepthPlayer = {
            id,
            name: identity?.name ?? 'Unverified teammate',
            team,
            position,
            slot: slots.length > 1 ? `${position} row ${index + 1}` : position,
            depth: i + 1,
            status: identity?.status ?? 'unknown',
            injury: identity?.injury ?? '',
            ahead: [...prior],
          };
          // Multi-formation duplicates are acceptable only when they describe the same role.
          const old = result.players[id];
          if (old && (old.depth !== p.depth || old.position !== p.position)) {
            delete result.players[id];
            conflicts.add(id);
            continue;
          }
          result.players[id] = p;
          prior.push({ id, name: p.name, status: p.status, injury: p.injury });
        }
      }
    }
  result.complete =
    Object.keys(result.roster).length >= 40 &&
    Object.values(result.players).some(
      (p) => p.position === 'QB' && p.depth === 1,
    );
  return result;
}
export function matchDepthPlayer(
  team: DepthTeam | undefined,
  id: string | undefined,
  name: string,
  position: string,
): string | undefined {
  if (!team) return undefined;
  if (
    id &&
    team.roster[id]?.position === position &&
    normalizeName(team.roster[id].name) === normalizeName(name)
  )
    return id;
  const matches = Object.entries(team.roster).filter(
    ([, p]) =>
      p.position === position && normalizeName(p.name) === normalizeName(name),
  );
  return matches.length === 1 ? matches[0][0] : undefined;
}
