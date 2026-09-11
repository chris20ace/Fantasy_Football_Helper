# Sunday Desk

A private fantasy football workspace for **bam6i**, bringing four Sleeper leagues and three ESPN leagues into one weekly dashboard.

**Dashboard:** https://sunday-desk-bam6i.aceccb2020.chatgpt.site

## What you can do

- See scores, opponents, records, connection status, and starter warnings for every league.
- Compare your starters with the highest projected combination of available rostered players, under each league’s scoring and slot rules.
- Keep already-started players fixed, handle FLEX/superflex, and exclude unavailable players, IR, and taxi squads from proposed substitutions.
- Search a cross-league player portfolio to see ownership and starting-lineup concentration.
- View standings, save private league notes, and mark each week’s review complete across devices.
- Refresh manually or let the visible dashboard check every three minutes.

The app is **read-only with respect to fantasy providers**. Open ESPN or Sleeper to apply your changes, then refresh Sunday Desk. The review checkbox is a personal checklist, not confirmation that a provider lineup changed.

## Run locally

Requirements: Node.js 22.13+ and pnpm. This project uses React, vinext, Cloudflare Workers/D1, and the supplied shadcn components.

```powershell
pnpm install
pnpm db:local
pnpm dev
```

Open the Local URL printed by the server. The development sign-in route creates a local test identity; production uses Sign in with ChatGPT behind the private Site’s access policy.

Sleeper works with the configured public username and league IDs. ESPN requires these **server-only** secrets in an ignored `.dev.vars` file for local development, or in the Site’s secret settings for production:

```dotenv
ESPN_S2="your-private-ESPN-session-cookie"
ESPN_SWID="{your-private-ESPN-account-id}"
```

Never put session values in browser code, source control, screenshots, or issue reports. Do not prefix these secrets with `NEXT_PUBLIC_` or `VITE_`.

The original Windows connection helper remains in `scripts/Connect-ESPN.ps1`. It verifies league access and stores the session using Windows DPAPI for the current Windows user. To prepare local development from that encrypted session:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/Import-Local-Session.ps1
# Or provide the path of an existing encrypted connection:
powershell -ExecutionPolicy Bypass -File scripts/Import-Local-Session.ps1 -CredentialPath "C:\path\to\credentials.dpapi"
```

Restart the local server after changing secrets. Production secrets are configured separately; saving the Windows session does not update a deployed Site. ESPN sessions can expire and need renewal.

## Data and recommendation model

**ESPN:** private league reads use the saved session. Team roster entries provide complete player identity, eligibility, locks, and weekly stats. Weekly projections use `statSourceId=1`, `statSplitTypeId=1`, matching the requested season/week; `appliedTotal` respects that league’s scoring. Matchup periods are mapped through league schedule settings. Current roster data is labeled as a reference when another week is selected.

**Sleeper:** official read endpoints provide leagues, rosters, matchups, users, and player metadata. Weekly estimates come from the supplemental, undocumented Rotowire projection feed exposed by Sleeper. The app applies each league’s scoring settings by stat applicability. Ordinary sparse standard stats count as projected zero; unknown custom scoring is flagged. Aggregate 50+ field goals and total misses can be derived from the source’s totals, but split 50–59/60+ allocations are not invented.

**Lineup engine:** maximum-weight assignment across eligible starter slots. Actual game locks pin the player to the same slot; unknown locks hold current assignments. Healthy players with missing or partial projections are held out of swaps. Current injury and bye rules apply only to current-week recommendations; other weeks are reference views. Missing values display as an em dash, never a fabricated zero.

**AutoSubs:** Sleeper pair assignments are not exposed by these reads. When an eligible roster player’s game has begun or its lock is unknown, unresolved remaining pair locks are marked unknown and substitutions are withheld. Verify those pairings directly in Sleeper.

**Portfolio:** athletes are matched using ESPN IDs from Sleeper metadata; team defenses use NFL team abbreviations. No name-only merging. Counts include loaded roster snapshots, including reserves and taxi; any stale source is labeled. No projected points are added across differently scored leagues.

These are estimates, not guaranteed results or a full waiver/trade recommendation service. Provider outages retain cached league snapshots with stale warnings. Player metadata refreshes with dashboard refreshes, and the catalog is streamed to avoid holding the full NFL catalog in Worker memory.

## Privacy and persistence

This deployment is a **single-owner private workspace**. The Site access policy must stay owner-only: application authentication plus that policy protects global league connections. Sharing it or turning it into a multi-user service requires per-user credentials, league membership authorization, and separate cache namespaces first.

D1 stores normalized league snapshots and notes, never ESPN session cookies. Notes use revision checks so an older device cannot silently overwrite newer changes. API responses are private/no-store. `.dev.vars`, `.env*`, encrypted sessions, local caches, generated builds, and private snapshots are excluded from Git.

The GitHub repository contains source and synthetic tests. It does not contain roster snapshots, notes, passwords, or session cookies.

## Validation

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests cover assignment traps, repeated FLEX eligibility, game locks, missing/negative projections, IR/taxi/bye exclusions, stale/future/pre-draft behavior, cross-source exposure, and custom scoring. Lint applies to application code; generated shadcn components and the generated mobile hook are left intact.

Database schema is defined in `db/schema.ts`. Generate a new immutable migration with `pnpm db:generate`, then apply locally with `pnpm db:local`. Sites includes migrations in the deployment artifact.

Production configuration lives in `.openai/hosting.json`; secret values live in the private Site environment. The GitHub source and deployed Site are separate destinations: a normal GitHub push alone does not publish the Site.

## Provider references

- [Sleeper API documentation](https://docs.sleeper.com/)
- [ESPN community API implementation](https://github.com/cwendt94/espn-api)
- [ESPN lineup and roster locks](https://support.espn.com/hc/en-us/articles/360055424451-Lineup-and-Roster-Lock-Times)
