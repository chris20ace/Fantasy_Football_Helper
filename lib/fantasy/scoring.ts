type Stats = Record<string, number>;
// League scoring of Sleeper's provider-supplied projections. This mirrors the NFL
// projected-stat handlers in Sleeper's web client, verified 2026-09-11:
// https://sleepercdn.com/js/bundle-381db30c5bc8d8eda1440f10742a028a.js?vsn=d
// Missing keys are not synthesized from other statistics. No historical model.
const direct = new Set(
  `pass_yd pass_td pass_fd pass_2pt pass_int pass_int_td pass_cmp pass_inc pass_att pass_sack pass_cmp_40p pass_td_40p pass_td_50p rush_yd rush_td bonus_rush_td_qb rush_fd rush_2pt rush_att rush_40p rush_td_40p rush_td_50p rec rec_yd rec_td rec_fd rec_2pt rec_0_4 rec_5_9 rec_10_19 rec_20_29 rec_30_39 rec_40p rec_td_40p rec_td_50p bonus_rec_rb bonus_rec_wr bonus_rec_te fgm_yds_over_30 xpm fgmiss_0_19 fgmiss_20_29 fgmiss_30_39 fgmiss_40_49 fgmiss_50_59 fgmiss_50p fgmiss_60p xpmiss def_td pts_allow_0 pts_allow_1_6 pts_allow_7_13 pts_allow_14_20 pts_allow_21_27 pts_allow_28_34 pts_allow_35p pts_allow yds_allow_0_100 yds_allow_100_199 yds_allow_200_299 yds_allow_300_349 yds_allow_350_399 yds_allow_400_449 yds_allow_450_499 yds_allow_500_549 yds_allow_550p yds_allow def_3_and_out def_4_and_stop qb_hit sack sack_yd int int_ret_yd fum_rec fum_ret_yd tkl_loss tkl_ast tkl_solo tkl safe ff blk_kick def_forced_punts def_pass_def def_2pt fg_ret_yd blk_kick_ret_yd def_st_td def_st_ff def_st_fum_rec def_st_tkl_solo def_pr_yd def_kr_yd st_td st_ff st_fum_rec st_tkl_solo pr_yd kr_yd fum fum_lost fum_rec_td bonus_rush_yd_100 bonus_rush_yd_200 bonus_rec_yd_100 bonus_rec_yd_200 bonus_pass_yd_300 bonus_pass_yd_400 bonus_rush_rec_yd_100 bonus_rush_rec_yd_200 bonus_pass_cmp_25 bonus_rush_att_20 bonus_fd_rb bonus_fd_wr bonus_fd_te bonus_fd_qb idp_def_td idp_sack idp_sack_yd idp_qb_hit idp_tkl idp_tkl_loss idp_blk_kick idp_int idp_int_ret_yd idp_fum_rec idp_fum_ret_yd idp_ff idp_safe idp_tkl_ast idp_tkl_solo idp_pass_def bonus_tkl_10p bonus_sack_2p idp_pass_def_3p bonus_def_int_td_50p bonus_def_fum_td_50p`.split(
    ' ',
  ),
);
// These are Sleeper's own projected-kicking handlers, used only when the source
// explicitly contains a zero-valued bucket. An absent bucket contributes zero.
const bucketFallback: Record<string, { weeks: number[]; seasonShare: number }> =
  {
    fgm_0_19: { weeks: [0.01, 0.016, 0.02, 0.018, 0.013], seasonShare: 0.25 },
    fgm_20_29: { weeks: [0.5, 0.8, 0.4, 0.2, 0.47], seasonShare: 0.3 },
    fgm_30_39: { weeks: [0.5, 0.4, 0.3, 0.6, 0.34], seasonShare: 0.3 },
    fgm_40_49: { weeks: [0.5, 0.2, 0.28, 0.3, 0.4], seasonShare: 0.11 },
    fgm_50_59: { weeks: [0.2, 0.17, 0.19, 0.18, 0.13], seasonShare: 0.04 },
    fgm_50p: { weeks: [0.2, 0.17, 0.19, 0.18, 0.13], seasonShare: 0.04 },
    fgm_60p: { weeks: [0.2, 0.16, 0.16, 0.15, 0.1], seasonShare: 0.03 },
  };
const custom = new Set([
  'fgm',
  'fgmiss',
  'fgm_yds',
  ...Object.keys(bucketFallback),
]);
export function scoreSleeper(
  input: Stats | undefined,
  rules: Stats,
  week: number,
): { projection: number | null; partial: boolean } {
  if (
    !Object.keys(rules).length ||
    !Number.isInteger(week) ||
    week < 0 ||
    week > 18 ||
    Object.values(rules).some((v) => !Number.isFinite(v)) ||
    Object.keys(rules).some(
      (k) => rules[k] !== 0 && !direct.has(k) && !custom.has(k),
    )
  )
    return { projection: null, partial: true };
  if (!input || !Object.keys(input).some((k) => direct.has(k) || custom.has(k)))
    return { projection: null, partial: false };
  const stats = { ...input };
  let points = 0;
  const sumBuckets = (prefix: string) =>
    ['0_19', '20_29', '30_39', '40_49', '50p'].reduce(
      (n, k) => n + (stats[`${prefix}_${k}`] || 0),
      0,
    );
  // The provider's scorer processes original keys in insertion order, including
  // its zero-bucket updates. Keep that order and mutate only a private clone.
  for (const key of Object.keys(input)) {
    if (!direct.has(key) && !custom.has(key)) continue;
    if (!Number.isFinite(stats[key]))
      return { projection: null, partial: true };
    const weight = rules[key] ?? 0;
    if (key === 'fgm' || key === 'fgmiss') {
      points += (stats[key] || sumBuckets(key)) * weight;
    } else if (key === 'fgm_yds') {
      if (stats.fgm && weight) {
        stats.fgm_yds ||= [55, 43, 62, 56, 70][week % 5];
        points +=
          weight *
          (25 * (stats.fgm_20_29 || 0) +
            35 * (stats.fgm_30_39 || 0) +
            45 * (stats.fgm_40_49 || 0) +
            52 * (stats.fgm_50p || 0));
      }
    } else {
      const bucket = bucketFallback[key];
      if (bucket && !stats[key]) {
        if (!stats.fgm) continue;
        stats[key] =
          week === 0 ? bucket.seasonShare * stats.fgm : bucket.weeks[week % 5];
      }
      points += (Math.round(weight * 10000) / 10000) * (stats[key] || 0);
    }
  }
  return Number.isFinite(points)
    ? { projection: points, partial: false }
    : { projection: null, partial: true };
}
