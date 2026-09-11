type Stats = Record<string, number>;
const offense = new Set([
  'pass_yd',
  'pass_td',
  'pass_int',
  'pass_2pt',
  'pass_int_td',
  'rush_yd',
  'rush_td',
  'rush_2pt',
  'rec',
  'rec_yd',
  'rec_td',
  'rec_2pt',
  'fum',
  'fum_lost',
  'fum_rec_td',
  'st_td',
  'st_ff',
  'st_fum_rec',
]);
const defense = new Set([
  'sack',
  'int',
  'ff',
  'fum_rec',
  'def_td',
  'safe',
  'blk_kick',
  'tkl_loss',
  'def_4_and_stop',
  'def_st_td',
  'def_st_ff',
  'def_st_fum_rec',
]);
const kicking = /^(fgm|fga|fgmiss)(_|$)|^xpm(iss)?$/;
export function scoreSleeper(
  input: Stats | undefined,
  rules: Stats,
  position: string,
): { projection: number | null; partial: boolean } {
  if (
    !input ||
    !Object.keys(input).some(
      (k) =>
        !k.startsWith('adp') &&
        !k.startsWith('pos_adp') &&
        !k.startsWith('pts_'),
    )
  )
    return { projection: null, partial: false };
  const stats = { ...input };
  let score = 0,
    partial = false;
  if (position === 'K') {
    if (stats.fgm_50p === undefined && Number.isFinite(stats.fgm))
      stats.fgm_50p = Math.max(
        0,
        stats.fgm -
          ['fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49'].reduce(
            (sum, k) => sum + (stats[k] ?? 0),
            0,
          ),
      );
    if (
      stats.fgmiss === undefined &&
      Number.isFinite(stats.fga) &&
      Number.isFinite(stats.fgm)
    )
      stats.fgmiss = Math.max(0, stats.fga - stats.fgm);
  }
  if (position === 'DEF')
    for (const suffix of ['td', 'ff', 'fum_rec']) {
      const key = `def_st_${suffix}`;
      if (stats[key] === undefined && stats[`st_${suffix}`] !== undefined)
        stats[key] = stats[`st_${suffix}`];
    }
  for (const [key, weight] of Object.entries(rules)) {
    if (!Number.isFinite(weight) || !weight) continue;
    if (kicking.test(key) && position !== 'K') continue;
    if (
      (defense.has(key) || /^(pts|yds)_allow/.test(key)) &&
      position !== 'DEF'
    )
      continue;
    if (offense.has(key) && position === 'DEF') continue;
    const bonusPosition = key
      .match(/^bonus_rec_(rb|wr|te)$/)?.[1]
      ?.toUpperCase();
    if (bonusPosition) {
      if (position !== bonusPosition) continue;
      stats[key] ??= stats.rec ?? 0;
    }
    if (key === 'bonus_rush_td_qb') {
      if (position !== 'QB') continue;
      stats[key] ??= stats.rush_td ?? 0;
    }
    if (Number.isFinite(stats[key])) {
      score += stats[key] * weight;
      continue;
    }
    // Ordinary supported stats and mutually exclusive DST bands are sparse: omitted means projected zero.
    if (offense.has(key) && key !== 'pass_int_td') continue;
    if (key === 'pass_int_td' && position !== 'QB' && !stats.pass_att) continue;
    if (/^(pts|yds)_allow_/.test(key)) continue;
    if (kicking.test(key) && !/50|60/.test(key)) continue;
    if (
      defense.has(key) &&
      ![
        'def_4_and_stop',
        'tkl_loss',
        'def_st_td',
        'def_st_ff',
        'def_st_fum_rec',
      ].includes(key)
    )
      continue;
    partial = true;
  }
  return { projection: Math.round(score * 100) / 100, partial };
}
