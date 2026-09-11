# Sunday Desk

A fantasy football workspace where each person signs in, connects their Sleeper and ESPN leagues, and builds a weekly game plan.

**Dashboard:** https://fantasy-football-helper-orcin.vercel.app

**Existing Sites deployment:** https://sunday-desk-bam6i.aceccb2020.chatgpt.site

## Independent projections and waiver insights

The **Insights & waivers** tab builds Sunday Desk forecasts separately from provider projections. Select a connected league and NFL week to compare your players, inspect their historical scores and reception scoring contribution, view a model-based lineup, and research available pickups.

The model checks current ESPN depth charts and rosters before using historical production. Reserve QBs/kickers, inactive and practice-squad players, and players without a current team do not receive actionable projections. Multiple starting WR rows remain first-unit roles. Missing, conflicting or stale roles withhold the estimate; an injury ahead of a player never triggers an assumed promotion. Each player shows the depth-chart row, teammates ahead, retrieval time, and recent targets, carries, attempts and valid snap share where available.

The historical baseline uses up to eight appearances in the previous 12 regular-season weeks. The role-screened estimate evaluates the latest three same-team appearances as one workload window, keeping low and zero scores; kickers and defenses use up to eight. Conservative workload heuristics are disclosed in the interface. They screen compatibility, rather than predicting playing time or multiplying points by a depth penalty. Fewer than three games, a team change without enough evidence, or a workload inconsistent with the current role withholds the estimate. Missing snap statistics remain unknown. Current charts are used only for current-week recommendations, not historical backtests.

Earlier appearances receive 85% of the next appearance's weight. History stops before both the selected and current week. ESPN uses native numeric game statistics and position-specific scoring overrides; Sleeper uses native statistical keys. Each league's bonuses and defensive bands are scored per game before averaging. Season totals, provider projections and DNPs are excluded from the scoring baseline. The displayed range describes observations, not a calibrated probability interval. Missing history or unsupported scoring never becomes an invented zero.

Waiver pools are verified against all league rosters, including reserves/taxi. ESPN additionally requires a league-local free-agent or waiver status. The candidate search is bounded and disclosed in the interface: ESPN's first 200 available players by ownership, or Sleeper's historical/provider leaders per position. Up to 24 eligible candidates receive lineup comparisons. Numerical gain is available only with complete roster forecasts and at most 10 starting slots. It compares against the already-optimized current roster and assumes space can be made without dropping those starters; it is not an executable add/drop recommendation. Game locks, injury availability, stale data, AutoSubs uncertainty and claims clearing after kickoff are respected. Users check roster limits, drops, waiver priority and FAAB in their provider.

The model is a transparent, role-screened historical estimate, not a trained or accuracy-calibrated prediction system. Opponent adjustments, weather, routes run and injury recovery are not modeled. Depth charts can lag lineup news. Provider projections remain available for comparison and in the original Lineup lab. Public statistics are stored separately from user-scoped, connection-revision-bound league reports. The authenticated `/api/insights` endpoint verifies connected-league membership before reading private data.

Sources: [Sleeper API](https://docs.sleeper.com/), supplemental Sleeper `/stats/nfl/{season}/{week}` feeds, and [ESPN's first-party stat configuration](https://fantasy.espn.com/football/players/add) / league player API. Supplemental provider endpoints can change; failed scans return an explicit unavailable state. `pnpm test` covers scoring-dependent waiver ordering, nonlinear bonuses, position overrides, history cutoffs, missing samples, FLEX assignments, existing-bench gains and ownership/lock guards.

### Shared NFL statistics database

Supabase stores public numeric player-week facts (`nfl_player_week`), regular-season games with completion status (`nfl_game`), current depth snapshots (`nfl_depth_snapshot`) and successful import coverage (`nfl_stat_coverage`). The data feeds require no fantasy login credentials. All four tables remain server-only under the existing restricted database role; they contain no account cookies. ESPN's 2025–2026 data was initially populated across the public player inventory. This is regular-season fantasy-relevant game data, not an exhaustive archive of every ESPN football statistic.

Insight requests refresh needed ESPN players after one hour, game status after one hour, Sleeper historical weeks after six hours, and depth snapshots after five minutes. Failed imports never mark missing responses as zero statistics. ESPN model inputs join to completed games by event ID, season and week; native stat IDs and historical team IDs are retained. Sleeper supplements missing usage fields such as offensive snaps when its feed provides them. Missing metrics are not replaced by ESPN's placeholder snap percentages.

Run the existing account migration to create the tables, then optionally seed/refresh the public inventory with `node --env-file=.env.auth.local --experimental-strip-types scripts/sync-nfl-stats.mjs 2026`. The importer uses only the runtime database connection, is idempotent, and does not need ESPN session cookies. `pnpm stats:sync 2026` is available when `DATABASE_URL` is already set. Application requests also populate the store on demand; there is no external cron requirement. Run `node --env-file=.env.auth.local --experimental-strip-types scripts/test-nfl-stats.mjs` for isolated database checks of game completion, corrected imports, identity matching and server-only access.

## Accounts and deployment

Choose **Manage leagues** in the dashboard to edit the **My dashboard leagues** checklist for Sleeper or ESPN. Uncheck inactive leagues and save; check them again to restore them. Removing every league keeps the account connected and returns to setup. League selections are saved with the account, survive reconnects to the same provider identity, and affect dashboard/portfolio totals and insights access. New discoveries stay unchecked on reconnect until explicitly selected. Both providers offer a preview to choose leagues before connecting. Removing a league does not delete its saved notes or require contacting the provider.

Selection writes use the client’s workspace revision and validate IDs against the account’s verified league catalog. They rotate the revision and invalidate private caches. The catalog and selected subset remain encrypted together; no database migration is needed for existing accounts. `scripts/test-league-selection.mjs` exercises the live selection routes, concurrency, cache invalidation, empty selections and tenant isolation using synthetic accounts that it removes afterward.

The production app uses Better Auth for email/password accounts and Supabase PostgreSQL for sessions, connections, notes, and cache storage. Users sign up at /login and connect accounts at /setup. Sleeper uses the public read API by username; private ESPN leagues can be imported from an existing browser session with the optional desktop connector, or connected manually. ESPN credentials are encrypted with AES-256-GCM and bound to the user ID. No provider lineups are changed by this app.

Vercel builds GitHub main using pnpm build:vercel and Nitro's Build Output API. Framework Preset is Other and Output Directory is unset. Use the canonical production address above for account sign-in. Keep **Standard Deployment Protection** enabled on preview and old deployment URLs; legacy owner-only deployments still depend on it. Never disable all project protection to publish the new login page. If Skew Protection is enabled, set its boundary to the first multi-user deployment.

Server environment:

- DATABASE_URL: the restricted sunday_desk_app PostgreSQL role, preferably using the project's actual Supabase transaction-pooler address.
- BETTER_AUTH_URL: the exact canonical origin, without a trailing slash.
- BETTER_AUTH_SECRET: a random secret of at least 32 bytes.
- CONNECTION_ENCRYPTION_KEY: a base64-encoded 32-byte key. Retain it to keep saved connections decryptable.

Migrations use DATABASE_ADMIN_URL and DATABASE_RUNTIME_PASSWORD only on the administrator's machine. Run node --env-file=.env.auth.local --experimental-strip-types scripts/migrate-accounts.mjs to create the isolated sunday_desk schema, auth tables and restricted role. Administrator credentials must never be deployed to Vercel. The server verifies database TLS using the public Supabase root CA and standard system roots. The schema is not exposed to Supabase anonymous/authenticated API roles.

For local account development, provide those server values in ignored .env.auth.local with BETTER_AUTH_URL=http://localhost:3000, then run node --env-file=.env.auth.local node_modules/vite/bin/vite.js --config vite.vercel.config.ts --host localhost --port 3000.

Email verification and password-reset emails require an email provider and are not enabled. Email addresses currently identify login accounts; an email match never grants access to an existing workspace. The previous owner's connections can be moved only through a private, expiring, single-use restore invitation. New users always start empty.

The existing Sites deployment is a separate legacy snapshot. These new account routes target Vercel; do not redeploy them to Sites without a compatible database/auth adapter.

## ESPN browser connector

The setup page opens ESPN in its own tab, imports the user's existing session through a permissioned desktop extension, discovers their NFL teams, and asks which leagues to connect. Discovery validates each league against ESPN and returns only sanitized league details plus an encrypted, user-bound preview ticket. Confirmation checks ticket expiry (10 minutes), selected league membership and workspace revision before persisting encrypted credentials. Cancelling discovery does not replace a working connection.

This is not an embedded ESPN OAuth login. Cross-origin iframe isolation prevents a normal website from reading ESPN's login or cookies. No ESPN password is requested or captured.

The developer-preview extension source is in extensions/espn-connector, with a reproducible download in public/downloads. Run pnpm connector:package after changing the extension. Normal public distribution requires a browser-store release; the ZIP requires desktop Chrome/Edge Developer mode and Load unpacked. Phone browsers cannot use this desktop connector; users can connect once on a computer and access their dashboard on mobile afterward. The public connector allows only the canonical HTTPS origin, exact /setup path, top-level frame and its own extension ID. Required cookie access is requested during installation and limited to https://fantasy.espn.com/*. Installation opens setup automatically; the toolbar icon opens setup directly. It has no persistent storage or analytics.

For isolated local development, run node scripts/package-espn-connector.mjs --local and load work/espn-connector-local. That build permits localhost and must never be distributed publicly.

ESPN discovery uses the fan-profile endpoint employed by [ESPN's web client](https://cdn1.espn.net/kona/5a90d30cd38d-1.490/_next/static/commons/main-82d208d52efd2b467c49.js): GET https://fan.api.espn.com/apis/v2/fans/{encodedSWID}. The parser reads preferences[].metaData.entry for preference types 9/10, football gameId 1 and the current season. It extracts groups[0].groupId, then independently verifies team ownership in each league. This undocumented compatibility integration may change; the advanced manual form supports league IDs as a fallback.

Store submission materials, icons, and a real screenshot are in store-assets. The public privacy policy is /privacy. Version 0.2.0 is pending Chrome Web Store review with automatic publication enabled. No additional app deployment is needed to enable the install button after publication: /api/connector checks Google's public update manifest for the exact extension ID, then requires a matching public listing with an Add to Chrome control. Checks use no user credentials, are cached for five minutes, and stay unavailable on failed or unrecognized responses. Setup refreshes availability while visible and when users return to the page. lib/accounts/connector-release.ts holds the fixed listing identity and fallback review state.

Connector detection retries while the document_idle bridge loads, when setup regains focus, and through an explicit Check again action. It only sends readiness messages; finding teams still requires the user's button click. The submitted extension package remains unchanged during review.

## What you can do

- See scores, opponents, records, connection status, and starter warnings for every league.
- Compare your starters with the highest projected combination of available rostered players, under each league’s scoring and slot rules.
- Keep already-started players fixed, handle FLEX/superflex, and exclude unavailable players, IR, and taxi squads from proposed substitutions.
- Search a cross-league player portfolio to see ownership and starting-lineup concentration.
- View standings, save private league notes, and mark each week’s review complete across devices.
- Refresh manually or let the visible dashboard check every three minutes.

The app is **read-only with respect to fantasy providers**. Open ESPN or Sleeper to apply your changes, then refresh Sunday Desk. The review checkbox is a personal checklist, not confirmation that a provider lineup changed.

## Data and recommendation model

**ESPN:** private league reads use the saved session. Team roster entries provide complete player identity, eligibility, locks, and weekly stats. Weekly projections use `statSourceId=1`, `statSplitTypeId=1`, matching the requested season/week; `appliedTotal` respects that league’s scoring. Matchup periods are mapped through league schedule settings. Current roster data is labeled as a reference when another week is selected.

**Sleeper:** official read endpoints provide leagues, rosters, matchups, users, and player metadata. Weekly estimates come from the supplemental, undocumented Rotowire projection feed exposed by Sleeper. The app applies each league’s scoring settings by stat applicability. Ordinary sparse standard stats count as projected zero; unknown custom scoring is flagged. Aggregate 50+ field goals and total misses can be derived from the source’s totals, but split 50–59/60+ allocations are not invented.

**Lineup engine:** maximum-weight assignment across eligible starter slots. Actual game locks pin the player to the same slot; unknown locks hold current assignments. Healthy players with missing or partial projections are held out of swaps. Current injury and bye rules apply only to current-week recommendations; other weeks are reference views. Missing values display as an em dash, never a fabricated zero.

**AutoSubs:** Sleeper pair assignments are not exposed by these reads. When an eligible roster player’s game has begun or its lock is unknown, unresolved remaining pair locks are marked unknown and substitutions are withheld. Verify those pairings directly in Sleeper.

**Portfolio:** athletes are matched using ESPN IDs from Sleeper metadata; team defenses use NFL team abbreviations. No name-only merging. Counts include loaded roster snapshots, including reserves and taxi; any stale source is labeled. No projected points are added across differently scored leagues.

These are estimates, not guaranteed results or a full waiver/trade recommendation service. Provider outages retain cached league snapshots with stale warnings. Player metadata refreshes with dashboard refreshes, and the catalog is streamed to avoid holding the full NFL catalog in Worker memory.

## Privacy and persistence

Every workspace and note query uses the authenticated session's user ID. Private cache keys also include a connection revision, so reconnecting or disconnecting cannot revive an older account snapshot. Public NFL schedule data is shared. Notes use database revision checks to prevent silent overwrites from another device. API responses are private/no-store.

Connections are validated before replacement. A failed reconnect preserves the working connection. Disconnect deletes saved credentials and invalidates the account's cached dashboard. Database-backed sessions are revoked on sign-out; auth cookies are HTTP-only. Authentication and connection endpoints have database rate limits and origin checks.

Secret files, encrypted Windows sessions, generated builds, and private snapshots are excluded from Git. Source contains neither database passwords nor league-session cookies.

## Validation

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build:vercel
```

Tests cover assignment traps, repeated FLEX eligibility, game locks, missing/negative projections, IR/taxi/bye exclusions, stale/future/pre-draft behavior, cross-source exposure, and custom scoring. Lint applies to application code; generated shadcn components and the generated mobile hook are left intact.

Run node --env-file=.env.auth.local --experimental-strip-types scripts/test-accounts.mjs for database integration checks. It creates synthetic accounts, tests isolation and session revocation, and deletes only those test accounts afterward.

Account schema migrations are in db/postgres. Existing Drizzle/D1 files belong to the legacy Sites snapshot.

## Provider references

- [Sleeper API documentation](https://docs.sleeper.com/)
- [ESPN community API implementation](https://github.com/cwendt94/espn-api)
- [ESPN lineup and roster locks](https://support.espn.com/hc/en-us/articles/360055424451-Lineup-and-Roster-Lock-Times)
