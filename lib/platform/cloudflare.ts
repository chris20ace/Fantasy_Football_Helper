import { env } from 'cloudflare:workers';
export const setting = (key: string) =>
  (env as unknown as Record<string, string | undefined>)[key] ??
  process.env[key];

export async function readCache(key: string) {
  return env.DB.prepare(
    'SELECT value, updated FROM fantasy_cache WHERE key = ?',
  )
    .bind(key)
    .first<{ value: string; updated: number }>();
}
export async function saveCache(key: string, value: unknown) {
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
