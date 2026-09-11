# Sunday Desk

A fantasy football workspace where each person signs in, connects their Sleeper and ESPN leagues, and builds a weekly game plan.

**Dashboard:** https://fantasy-football-helper-orcin.vercel.app

**Existing Sites deployment:** https://sunday-desk-bam6i.aceccb2020.chatgpt.site

## Accounts and deployment

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

Store submission materials, icons, and a real screenshot are in store-assets. The public privacy policy is /privacy. lib/accounts/connector-release.ts controls the install link; keep it unavailable until the store listing is approved and verified installable.

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
