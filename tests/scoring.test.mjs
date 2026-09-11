import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSleeper } from '../lib/fantasy/scoring.ts';
void test('offense does not inherit long field goal coverage gaps', () => {
  assert.deepEqual(
    scoreSleeper(
      { rec: 5, rec_yd: 80 },
      { rec: 1, rec_yd: 0.1, fgm_60p: 6 },
      'WR',
    ),
    { projection: 13, partial: false },
  );
});
void test('passing interception return penalty never applies to team defense', () => {
  assert.equal(
    scoreSleeper({ pass_int_td: 1, int: 2 }, { pass_int_td: -3, int: 2 }, 'DEF')
      .projection,
    4,
  );
  assert.equal(
    scoreSleeper(
      { pass_int_td: 1, pass_yd: 200 },
      { pass_int_td: -3, pass_yd: 0.04 },
      'QB',
    ).projection,
    5,
  );
});
void test('derives aggregate 50+ field goals and total misses', () => {
  const a = scoreSleeper(
    {
      fgm: 2.1,
      fga: 2.42,
      fgm_20_29: 0.36,
      fgm_30_39: 0.46,
      fgm_40_49: 0.46,
      xpm: 1.76,
    },
    {
      fgm_0_19: 3,
      fgm_20_29: 3,
      fgm_30_39: 3,
      fgm_40_49: 4,
      fgm_50p: 5,
      fgmiss: -1,
      xpm: 1,
    },
    'K',
  );
  assert.equal(a.projection, 9.84);
  assert.equal(a.partial, false);
});
void test('does not invent the split between 50–59 and 60+ field goals', () => {
  assert.equal(
    scoreSleeper({ fgm: 2, fgm_30_39: 1 }, { fgm_50_59: 5, fgm_60p: 6 }, 'K')
      .partial,
    true,
  );
});
void test('flags unmodeled defensive fourth-down stops', () => {
  assert.equal(
    scoreSleeper({ sack: 3 }, { sack: 1, def_4_and_stop: 1 }, 'DEF').partial,
    true,
  );
});
void test('scores defense special teams once, despite similarly named player stat', () => {
  assert.equal(
    scoreSleeper({ st_td: 0.2 }, { st_td: 6, def_st_td: 6 }, 'DEF').projection,
    1.2,
  );
});
void test('applies reception bonuses only to their designated position', () => {
  assert.equal(
    scoreSleeper({ rec: 5 }, { rec: 1, bonus_rec_te: 0.5 }, 'TE').projection,
    7.5,
  );
  assert.equal(
    scoreSleeper({ rec: 5 }, { rec: 1, bonus_rec_te: 0.5 }, 'WR').projection,
    5,
  );
});
void test('ADP-only rows are missing projections, not zero points', () => {
  assert.equal(
    scoreSleeper({ adp_dd_ppr: 10 }, { rec: 1 }, 'WR').projection,
    null,
  );
});
