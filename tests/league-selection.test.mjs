import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  selectLeagues,
  retainLeagueSelection,
} from '../lib/accounts/league-selection.ts';
import {
  createConnectionPreview,
  confirmConnectionPreview,
} from '../lib/accounts/connection-ticket.ts';
process.env.CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
const league = (id) => ({ id, name: 'League ' + id, season: 2026 });
const connection = (provider = 'sleeper') => ({
  provider,
  accountId: 'owner-a',
  label: 'Test',
  leagues: ['101', '102'].map(league),
  updatedAt: '2026-09-11T00:00:00Z',
  ...(provider === 'espn'
    ? { credentials: { s2: 'synthetic-private-session', swid: 'owner-a' } }
    : {}),
});
void test('removal retains verified choices for re-add and does not mutate the original', () => {
  const original = connection('espn'),
    selected = selectLeagues(original, ['102']);
  assert.deepEqual(
    selected.leagues.map((l) => l.id),
    ['102'],
  );
  assert.deepEqual(selected.availableLeagues, original.leagues);
  assert.deepEqual(
    original.leagues.map((l) => l.id),
    ['101', '102'],
  );
  assert.deepEqual(
    selectLeagues(selected, ['101', '102']).leagues,
    original.leagues,
  );
  assert.deepEqual(selected.credentials, original.credentials);
});
void test('an intentionally empty selection retains account and verified inventory', () => {
  const none = selectLeagues(connection('espn'), []);
  assert.equal(none.leagues.length, 0);
  assert.equal(none.availableLeagues.length, 2);
  assert.equal(none.credentials.s2, 'synthetic-private-session');
  assert.equal(selectLeagues(none, ['101']).leagues.length, 1);
});
void test('selection rejects foreign, malformed and duplicate IDs instead of partially saving', () => {
  for (const ids of [
    ['101', '999'],
    [101],
    ['../x'],
    ['101', '101'],
    null,
    {},
    '101',
  ])
    assert.throws(() => selectLeagues(connection(), ids));
});
void test('same-account refresh keeps exclusions and leaves newly discovered leagues unchecked', () => {
  const before = selectLeagues(connection(), ['102']);
  const fresh = { ...connection(), leagues: ['101', '102', '103'].map(league) };
  assert.deepEqual(
    retainLeagueSelection(fresh, before).leagues.map((l) => l.id),
    ['102'],
  );
  assert.equal(
    retainLeagueSelection(fresh, selectLeagues(before, [])).leagues.length,
    0,
  );
  assert.deepEqual(
    retainLeagueSelection(
      { ...fresh, leagues: ['101', '103'].map(league) },
      before,
    ).leagues,
    [],
  );
});
void test('changing accounts resets the catalog and cannot inherit old choices', () => {
  const before = selectLeagues(connection(), []),
    fresh = {
      ...connection(),
      accountId: 'owner-b',
      leagues: ['901'].map(league),
    };
  const next = retainLeagueSelection(fresh, before);
  assert.deepEqual(
    next.leagues.map((l) => l.id),
    ['901'],
  );
  assert.deepEqual(next.availableLeagues, next.leagues);
});
void test('both provider previews retain unchecked choices and bind provider, user and revision', () => {
  for (const provider of ['sleeper', 'espn']) {
    const c = connection(provider),
      ticket = createConnectionPreview('a', c, 'revision-a');
    const result = confirmConnectionPreview('a', provider, ticket, ['102']);
    assert.equal(result.revision, 'revision-a');
    assert.equal(result.connection.leagues.length, 1);
    assert.equal(result.connection.availableLeagues.length, 2);
    assert.throws(() =>
      confirmConnectionPreview('b', provider, ticket, ['102']),
    );
    assert.throws(() =>
      confirmConnectionPreview(
        'a',
        provider === 'espn' ? 'sleeper' : 'espn',
        ticket,
        ['102'],
      ),
    );
    assert.throws(() =>
      confirmConnectionPreview('a', provider, ticket, ['999']),
    );
  }
});
void test('rediscovery previews can explicitly re-add a previously unchecked verified league', () => {
  const fresh = retainLeagueSelection(
    connection(),
    selectLeagues(connection(), ['102']),
  );
  const ticket = createConnectionPreview('a', fresh, 'r');
  assert.deepEqual(
    confirmConnectionPreview('a', 'sleeper', ticket, [
      '101',
    ]).connection.leagues.map((l) => l.id),
    ['101'],
  );
});
