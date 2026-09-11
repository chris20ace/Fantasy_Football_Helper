import {
  publicStatJSON,
  ensureESPNStats,
} from '../lib/fantasy/stat-ingestion.ts';
import { statStoreSummary } from '../lib/fantasy/stat-store.ts';
import { getPool } from '../lib/accounts/db.ts';
const season = Number(process.argv[2] ?? new Date().getFullYear());
if (!Number.isInteger(season) || season < 2001 || season > 2100)
  throw new Error('Provide a valid NFL season.');
try {
  const ids = new Set();
  for (const year of [season - 1, season]) {
    for (let offset = 0; ; offset += 1000) {
      const data = await publicStatJSON(
        `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/players?view=players_wl`,
        {
          limit: 1000,
          offset,
          sortPercOwned: { sortPriority: 1, sortAsc: false },
          ...(year === season ? { filterActive: { value: true } } : {}),
        },
      );
      if (!Array.isArray(data))
        throw new Error('Invalid NFL player inventory.');
      data.forEach((p) => ids.add(String(p.id)));
      if (data.length < 1000) break;
      if (offset >= 20000)
        throw new Error('Unexpected inventory size; stopping safely.');
    }
  }
  console.log(
    `Importing public ESPN statistics for ${ids.size} player/team identities, seasons ${season - 1}–${season}.`,
  );
  const list = [...ids];
  for (let i = 0; i < list.length; i += 100) {
    await ensureESPNStats(list.slice(i, i + 100), season, true);
    if (i % 500 === 0)
      console.log(
        `Imported ${Math.min(i + 100, list.length)}/${list.length} identities.`,
      );
  }
  console.log(JSON.stringify(await statStoreSummary()));
} finally {
  await getPool().end();
}
