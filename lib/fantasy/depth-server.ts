import { cached, json } from './server';
import { normalizeDepth, normalizeTeam } from './depth.ts';
import type { DepthTeam } from './roles.ts';
import { readDepth, saveDepth } from './stat-store.ts';
const pending = new Map<number, Promise<Record<string, DepthTeam>>>();
export async function loadDepthCharts(
  season: number,
  proTeams: { id: number; abbrev: string }[],
): Promise<Record<string, DepthTeam>> {
  const existing = pending.get(season);
  if (existing) return existing;
  const run = async () => {
    const teams = await cached(`depth-team-index-v2:${season}`, 3600000, () =>
      json(
        `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/teams?limit=100`,
      ),
    );
    if (
      !Array.isArray(teams.items) ||
      teams.count !== 32 ||
      teams.items.length !== 32
    )
      throw new Error('NFL team list is incomplete.');
    const ids: string[] = teams.items
      .map((t: { $ref: string }) => t.$ref.match(/\/teams\/(\d+)(?:\?|$)/)?.[1])
      .filter(Boolean);
    const result: Record<string, DepthTeam> = {};
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (cursor < ids.length) {
          const id = ids[cursor++],
            team = proTeams.find((t) => String(t.id) === id);
          if (!team) continue;
          try {
            const saved = await readDepth(normalizeTeam(team.abbrev), season);
            if (saved) {
              result[normalizeTeam(team.abbrev)] = saved;
              continue;
            }
            const fetchTeam = async () => {
              const [chart, roster] = await Promise.all([
                json(
                  `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/teams/${id}/depthcharts`,
                ),
                json(
                  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster?season=${season}`,
                ),
              ]);
              const normalized = normalizeDepth(
                chart,
                roster,
                season,
                id,
                team.abbrev,
                new Date().toISOString(),
              );
              await saveDepth(normalized);
              return normalized;
            };
            result[normalizeTeam(team.abbrev)] = await fetchTeam();
          } catch {
            /* An unavailable team remains unknown; never reuse expired role evidence. */
          }
        }
      }),
    );
    return result;
  };
  const promise = run();
  pending.set(season, promise);
  try {
    return await promise;
  } finally {
    pending.delete(season);
  }
}
