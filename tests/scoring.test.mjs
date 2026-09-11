import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSleeper } from '../lib/fantasy/scoring.ts';
const points = (stats, rules, week = 1) =>
  scoreSleeper(stats, rules, week).projection;
void test('scores the supplied projected statistics with league rules and native weight rounding', () => {
  assert.equal(points({ rec: 5, rec_yd: 80 }, { rec: 1, rec_yd: 0.1 }), 13);
  assert.equal(points({ rec: 5, rec_yd: 80 }, { rec: 0, rec_yd: 0.1 }), 8);
  assert.equal(points({ pass_yd: 100 }, { pass_yd: 0.040056 }), 4.01);
  assert.equal(points({ pass_int: 2 }, { pass_int: -1 }), -2);
  assert.equal(points({ rec: 0 }, { rec: 1 }), 0);
});
void test('does not synthesize bonuses, defensive aliases, or position adjustments', () => {
  assert.equal(points({ rec: 5 }, { rec: 1, bonus_rec_te: 0.5 }), 5);
  assert.equal(
    points({ rec: 5, bonus_rec_te: 5 }, { rec: 1, bonus_rec_te: 0.5 }),
    7.5,
  );
  assert.ok(
    Math.abs(points({ st_td: 0.2 }, { st_td: 6, def_st_td: 6 }) - 1.2) < 1e-10,
  );
  assert.equal(
    points({ pass_int_td: 1, int: 2 }, { pass_int_td: -3, int: 2 }),
    1,
  );
  assert.equal(points({ sack: 3 }, { sack: 1, def_4_and_stop: 1 }), 3);
});
void test('matches Sleeper kicker points without invented long field goals or misses', () => {
  const stats = {
    fga: 1.99,
    fgm: 1.64,
    fgm_0_19: 0.05,
    fgm_20_29: 0.25,
    fgm_30_39: 0.45,
    fgm_40_49: 0.4,
    fgm_yds: 44.07,
    fgmiss_30_39: 0.04,
    fgmiss_40_49: 0.08,
    xpa: 2.52,
    xpm: 2.4,
    xpmiss: 0.12,
    gp: 1,
    pts_ppr: 6.1,
  };
  const rules = {
    fgm_0_19: 3,
    fgm_20_29: 3,
    fgm_30_39: 3,
    fgm_40_49: 4,
    fgm_50p: 5,
    fgmiss: -1,
    xpm: 1,
    xpmiss: -1,
  };
  assert.ok(Math.abs(points(stats, rules) - 6.13) < 1e-10);
  assert.equal(stats.fgm_50p, undefined);
  assert.equal(stats.fgmiss, undefined);
});
void test('only explicit zero buckets invoke Sleeper’s week-specific handler', () => {
  const stats = { fgm: 2, fgm_50p: 0 };
  assert.equal(points({ fgm: 2 }, { fgm_50p: 5 }), 0);
  assert.ok(Math.abs(points(stats, { fgm_50p: 5 }) - 0.85) < 1e-10);
  assert.equal(points(stats, { fgm_50p: 5 }, 2), 0.95);
  assert.equal(stats.fgm_50p, 0, 'Scoring must not mutate source data');
});
void test('uses native total misses and projected field goal yardage handlers', () => {
  assert.equal(
    points({ fga: 3, fgm: 2, fgmiss_30_39: 0.2 }, { fgmiss: -1 }),
    0,
  );
  assert.equal(
    points({ fgm: 2, fgmiss: 0, fgmiss_30_39: 0.2 }, { fgmiss: -1 }),
    -0.2,
  );
  assert.equal(
    points(
      { fgm: 2, fgm_20_29: 1, fgm_30_39: 0.5, fgm_40_49: 0.5, fgm_yds: 0 },
      { fgm_yds: 0.1 },
    ),
    6.5,
  );
});
void test('missing projections and unsupported or absent scoring remain unavailable', () => {
  assert.equal(points(undefined, { rec: 1 }), null);
  assert.equal(points(null, { rec: 1 }), null);
  assert.equal(points([], { rec: 1 }), null);
  assert.deepEqual(scoreSleeper({ rec: 5 }, {}, 1), {
    projection: null,
    partial: true,
  });
  assert.deepEqual(scoreSleeper({ rec: 5 }, { rec: 1, unknown_rule: 3 }, 1), {
    projection: null,
    partial: true,
  });
  assert.equal(points({ rec: 5 }, { rec: Infinity }), null);
  assert.equal(points({ rec: NaN }, { rec: 1 }), null);
});
void test('present weekly rows without scoring-stat contributions are valid zero projections', () => {
  for (const stats of [
    {},
    { adp_dd_ppr: 1000 },
    { adp_dd_ppr: 10, pts_ppr: 20 },
    { pass_yd: 0, pass_td: 0, pass_int: 0 },
  ]) {
    assert.deepEqual(
      scoreSleeper(stats, { pass_yd: 0.04, pass_td: 4, pass_int: -2 }, 1),
      { projection: 0, partial: false },
    );
  }
});
void test('preserves native key order and zero-bucket updates even without a bucket scoring rule', () => {
  assert.ok(
    Math.abs(
      points({ fgm: 2, fgm_50p: 0, fgm_yds: 1 }, { fgm_yds: 0.1 }) - 0.884,
    ) < 1e-10,
  );
  assert.equal(points({ fgm: 2, fgm_yds: 1, fgm_50p: 0 }, { fgm_yds: 0.1 }), 0);
});
