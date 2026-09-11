import { InputError } from './errors.ts';
import { randomUUID, createHash } from 'node:crypto';
import { getPool } from './db.ts';
import { seal, unseal } from './crypto.ts';
import { selectLeagues } from './league-selection.ts';
import type {
  ProviderConnection,
  Workspace,
  PublicConnection,
} from './types.ts';
export async function loadWorkspace(user: string): Promise<Workspace> {
  const r = await getPool().query(
    'select revision, connections from sunday_desk.workspace where user_id=$1',
    [user],
  );
  return r.rows[0]
    ? {
        revision: r.rows[0].revision,
        connections: unseal<ProviderConnection[]>(r.rows[0].connections, user),
      }
    : { revision: 'empty', connections: [] };
}
export async function publicConnections(
  user: string,
): Promise<PublicConnection[]> {
  const workspace = await loadWorkspace(user);
  return workspace.connections.map(
    ({ provider, label, leagues, availableLeagues, updatedAt }) => ({
      provider,
      label,
      leagues,
      availableLeagues: availableLeagues ?? leagues,
      updatedAt,
      revision: workspace.revision,
    }),
  );
}
export async function selectConnectionLeagues(
  user: string,
  provider: unknown,
  selected: unknown,
  revision: unknown,
) {
  if (
    (provider !== 'sleeper' && provider !== 'espn') ||
    typeof revision !== 'string' ||
    !revision
  )
    throw new InputError('Reload your account connections and try again.');
  const workspace = await loadWorkspace(user);
  const connection = workspace.connections.find((c) => c.provider === provider);
  if (!connection)
    throw new InputError('Connect this account before choosing leagues.');
  await changeConnection(
    user,
    provider,
    selectLeagues(connection, selected),
    revision,
  );
}
export async function changeConnection(
  user: string,
  provider: string,
  value: ProviderConnection | null,
  expectedRevision: string,
) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    // Serialize changes even when the workspace row has not been created yet.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      user,
    ]);
    const r = await client.query(
      'select revision, connections from sunday_desk.workspace where user_id=$1 for update',
      [user],
    );
    if ((r.rows[0]?.revision ?? 'empty') !== expectedRevision)
      throw new InputError(
        'Your connections changed on another device. Reload and try again.',
      );
    const connections = r.rows[0]
      ? unseal<ProviderConnection[]>(r.rows[0].connections, user)
      : [];
    const next = connections.filter((c) => c.provider !== provider);
    if (value) next.push(value);
    await client.query(
      'insert into sunday_desk.workspace(user_id,revision,connections) values($1,$2,$3) on conflict(user_id) do update set revision=excluded.revision, connections=excluded.connections',
      [user, randomUUID(), seal(next, user)],
    );
    await client.query('delete from sunday_desk.cache where owner_id=$1', [
      user,
    ]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
export async function claimWorkspace(user: string, token: string) {
  const hash = createHash('sha256').update(token).digest('hex'),
    client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      user,
    ]);
    const invitation = await client.query(
      'delete from sunday_desk.owner_invite where token_hash=$1 and expires_at>now() returning payload',
      [hash],
    );
    if (!invitation.rows[0])
      throw new InputError(
        'This restore link has expired or has already been used.',
      );
    const existing = await client.query(
      'select connections from sunday_desk.workspace where user_id=$1',
      [user],
    );
    if (
      existing.rows[0] &&
      unseal<ProviderConnection[]>(existing.rows[0].connections, user).length
    )
      throw new InputError(
        'Disconnect your current accounts before restoring the saved workspace.',
      );
    const payload = unseal<{
      connections: ProviderConnection[];
      preferences?: unknown;
    }>(invitation.rows[0].payload, hash);
    await client.query(
      'insert into sunday_desk.workspace(user_id,revision,connections) values($1,$2,$3) on conflict(user_id) do update set revision=excluded.revision,connections=excluded.connections',
      [user, randomUUID(), seal(payload.connections, user)],
    );
    if (payload.preferences)
      await client.query(
        'insert into sunday_desk.preferences(user_id,value,revision) values($1,$2,1) on conflict(user_id) do nothing',
        [user, JSON.stringify(payload.preferences)],
      );
    await client.query('delete from sunday_desk.cache where owner_id=$1', [
      user,
    ]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
export async function readCache(key: string, owner: string | null = null) {
  const r = await getPool().query(
    'select value, updated from sunday_desk.cache where key=$1 and owner_id is not distinct from $2 and expires_at>now()',
    [key, owner],
  );
  return r.rows[0]
    ? { value: r.rows[0].value as string, updated: Number(r.rows[0].updated) }
    : null;
}
export async function saveCache(
  key: string,
  value: unknown,
  owner: string | null = null,
) {
  await getPool().query(
    "insert into sunday_desk.cache(key,owner_id,value,updated,expires_at) values($1,$2,$3,$4,now()+interval '7 days') on conflict(key) do update set value=excluded.value,updated=excluded.updated,expires_at=excluded.expires_at where sunday_desk.cache.owner_id is not distinct from excluded.owner_id",
    [key, owner, JSON.stringify(value), Date.now()],
  );
}
export async function getPreferences(user: string) {
  const r = await getPool().query(
    'select value,revision from sunday_desk.preferences where user_id=$1',
    [user],
  );
  return r.rows[0]
    ? { ...r.rows[0].value, revision: r.rows[0].revision }
    : { notes: {}, reviewed: {}, revision: 0 };
}
export async function putPreferences(
  user: string,
  value: unknown,
  revision: number,
) {
  const r =
    revision === 0
      ? await getPool().query(
          'insert into sunday_desk.preferences(user_id,value,revision) values($1,$2,1) on conflict(user_id) do nothing returning revision',
          [user, JSON.stringify(value)],
        )
      : await getPool().query(
          'update sunday_desk.preferences set value=$1,revision=revision+1 where user_id=$2 and revision=$3 returning revision',
          [JSON.stringify(value), user, revision],
        );
  return r.rows[0]?.revision ?? null;
}
export async function connectionRateLimit(user: string) {
  const r = await getPool().query(
    "insert into sunday_desk.connection_limits(user_id,window_start,count) values($1,now(),1) on conflict(user_id) do update set count=case when connection_limits.window_start<now()-interval '1 minute' then 1 else connection_limits.count+1 end,window_start=case when connection_limits.window_start<now()-interval '1 minute' then now() else connection_limits.window_start end returning count",
    [user],
  );
  return r.rows[0].count <= 10;
}
