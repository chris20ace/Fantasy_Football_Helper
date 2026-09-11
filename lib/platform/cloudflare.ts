import type { Workspace } from '../accounts/types';
import { env } from 'cloudflare:workers';
export const setting = (key: string) =>
  (env as unknown as Record<string, string | undefined>)[key] ??
  process.env[key];

export async function readCache(key: string, _owner: string | null = null) {
  return env.DB.prepare(
    'SELECT value, updated FROM fantasy_cache WHERE key = ?',
  )
    .bind(key)
    .first<{ value: string; updated: number }>();
}
export async function saveCache(
  key: string,
  value: unknown,
  _owner: string | null = null,
) {
  await env.DB.prepare(
    'INSERT INTO fantasy_cache (key,value,updated) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated',
  )
    .bind(key, JSON.stringify(value), Date.now())
    .run();
}
export async function getPreferences(user: string) {
  const row = await env.DB.prepare(
    'SELECT value, updated FROM preferences WHERE user = ?',
  )
    .bind(user)
    .first<{ value: string; updated: number }>();
  return row
    ? { ...JSON.parse(row.value), revision: row.updated }
    : { notes: {}, reviewed: {}, revision: 0 };
}
export async function putPreferences(
  user: string,
  value: unknown,
  revision: number,
) {
  const next = revision + 1;
  const result =
    revision === 0
      ? await env.DB.prepare(
          'INSERT OR IGNORE INTO preferences (user,value,updated) VALUES (?,?,?)',
        )
          .bind(user, JSON.stringify(value), next)
          .run()
      : await env.DB.prepare(
          'UPDATE preferences SET value = ?, updated = ? WHERE user = ? AND updated = ?',
        )
          .bind(JSON.stringify(value), next, user, revision)
          .run();
  return result.meta.changes ? next : null;
}

// Legacy owner-only Sites deployment. Vercel never imports this adapter.
const USER = '734846853182521344';
const configured = [
  { id: '626895972', platform: 'espn', name: 'IU' },
  { id: '1360778906', platform: 'espn', name: 'BTOWNS FINEST' },
  { id: '103664', platform: 'espn', name: 'Charlie Ruff Memorial League' },
  { id: '1399588599548145664', platform: 'sleeper', name: 'big dick cig' },
  {
    id: '1389374537983889408',
    platform: 'sleeper',
    name: 'Charlie Ruff Memorial League',
  },
  { id: '1384960790922039296', platform: 'sleeper', name: 'Helmet Heads' },
  {
    id: '1352065380138377216',
    platform: 'sleeper',
    name: 'Steph is Lebrons Dad',
  },
] as const;

export async function loadWorkspace(_user: string): Promise<Workspace> {
  return {
    revision: 'legacy',
    connections: [
      {
        provider: 'sleeper',
        accountId: USER,
        label: 'bam6i',
        leagues: configured
          .filter((l) => l.platform === 'sleeper')
          .map((l) => ({ id: l.id, name: l.name, season: 2026 })),
        updatedAt: '',
      },
      {
        provider: 'espn',
        accountId: setting('ESPN_SWID') ?? '',
        label: 'ESPN',
        credentials: {
          s2: setting('ESPN_S2') ?? '',
          swid: setting('ESPN_SWID') ?? '',
        },
        leagues: configured
          .filter((l) => l.platform === 'espn')
          .map((l) => ({ id: l.id, name: l.name, season: 2026 })),
        updatedAt: '',
      },
    ],
  };
}
