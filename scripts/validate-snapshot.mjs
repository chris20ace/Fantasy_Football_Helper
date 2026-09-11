import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  analyze,
  exposure,
  isLocked,
  unavailable,
} from '../lib/fantasy/analysis.ts';
const path = process.argv[2];
if (!path)
  throw new Error(
    'Usage: node --experimental-strip-types scripts/validate-snapshot.mjs PRIVATE_SNAPSHOT_PATH',
  );
const data = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const now = Date.parse(data.fetchedAt);
assert.equal(data.leagues.length, 7);
assert.equal(new Set(data.leagues.map((l) => l.id)).size, 7);
const inspect = (value) => {
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      assert.ok(
        !/^(espn_?s2|swid|cookie|authorization|access_?token|refresh_?token|password)$/i.test(
          key,
        ),
        'Credential-bearing key in response',
      );
      inspect(child);
    }
};
inspect(data);
for (const l of data.leagues) {
  assert.equal(l.week, data.week);
  assert.equal(l.season, data.season);
  assert.ok(!l.error, `${l.platform} connection failed`);
  assert.equal(new Set(l.players.map((p) => p.id)).size, l.players.length);
  assert.equal(
    new Set(l.players.filter((p) => p.slot).map((p) => p.slot)).size,
    l.players.filter((p) => p.slot).length,
  );
  for (const p of l.players) {
    assert.ok(p.id && p.id !== 'undefined' && p.id !== '0');
    assert.notEqual(p.name, 'Unknown player');
    assert.ok(p.projection === null || Number.isFinite(p.projection));
    if (p.slot) {
      const s = l.slots.find((s) => s.id === p.slot);
      assert.ok(s);
      assert.ok(p.eligible.includes(s.key));
    }
  }
  const a = analyze(l, now);
  const recommendations = a.assignments.flatMap((r) =>
    r.recommended ? [r.recommended] : [],
  );
  assert.equal(
    new Set(recommendations.map((p) => p.id)).size,
    recommendations.length,
  );
  for (const row of a.assignments) {
    if (row.current && isLocked(row.current, now))
      assert.equal(row.recommended?.id, row.current.id);
    if (row.recommended && row.recommended.id !== row.current?.id) {
      assert.ok(!unavailable(row.recommended));
      assert.ok(!isLocked(row.recommended, now));
      assert.ok(
        row.recommended.projection !== null && !row.recommended.partial,
      );
    }
  }
  if (a.gain !== null)
    assert.ok(
      Math.abs(a.gain - (a.recommendedTotal - a.currentTotal)) < 0.00001,
    );
  for (const extra of [
    { stale: true },
    { week: l.currentWeek + 1 },
    { status: 'pre_draft' },
  ])
    assert.equal(analyze({ ...l, ...extra }, now).enabled, false);
}
for (const p of exposure(data.leagues))
  assert.ok(p.leagues.length <= data.leagues.length);
console.log(
  `Validated ${data.leagues.length} live leagues, ${data.leagues.reduce((sum, l) => sum + l.players.length, 0)} players, recommendations, locks, exposure, and response privacy.`,
);
