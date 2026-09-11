import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeESPNStats } from '../lib/fantasy/stat-ingestion.ts';
void test('ESPN import preserves actual game facts only, including historical team and raw scoring IDs', () => {
  const base = {
    seasonId: 2025,
    scoringPeriodId: 18,
    statSourceId: 0,
    statSplitTypeId: 1,
    externalId: '401',
    proTeamId: 8,
    stats: { 0: 30, 53: 3, 210: 1, 999: Infinity },
  };
  const rows = normalizeESPNStats(
    [
      {
        id: 2,
        fullName: 'Test',
        defaultPositionId: 1,
        proTeamId: 9,
        stats: [
          base,
          { ...base, statSourceId: 1 },
          { ...base, statSplitTypeId: 0 },
          { ...base, scoringPeriodId: 19 },
        ],
      },
    ],
    'https://example.com/stats',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].historical_team, '8');
  assert.equal(rows[0].event_id, '401');
  assert.deepEqual(rows[0].native_stats, { 0: 30, 53: 3, 210: 1 });
  const missing = normalizeESPNStats(
    [
      {
        id: 2,
        fullName: 'Test',
        defaultPositionId: 1,
        proTeamId: 9,
        stats: [{ ...base, proTeamId: undefined, stats: { 53: 0 } }],
      },
    ],
    'https://example.com/stats',
  );
  assert.equal(missing[0].historical_team, null);
  assert.equal(missing[0].played, null);
});
