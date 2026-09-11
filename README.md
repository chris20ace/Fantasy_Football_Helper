# Sunday Desk

A fantasy football workspace where each person signs in, connects their Sleeper and ESPN leagues, and builds a weekly game plan.

**Dashboard:** https://fantasy-football-helper-orcin.vercel.app

**Existing Sites deployment:** https://sunday-desk-bam6i.aceccb2020.chatgpt.site

## Provider projections and waiver recommendations

The Plan page is a command center for every connected league. It checks teams together and puts lineup repairs, injury checks, waiver comparisons, bench depth, bye gaps and matchup concerns into one prioritized queue. Each decision opens the correct league and the relevant lineup, waiver, matchup or connection section inside the app. Related pickups are grouped as alternatives, with every checked comparison available; their gains are never added together. Ready teams, predraft leagues, loading checks and failed connections remain visible.

Plan and the team detail pages share a session-scoped report queue, with at most three concurrent league checks. Switching teams reuses the same reports; changing the week, account or connected leagues invalidates obsolete results. Partial successes appear without waiting for every league. Each report reads only its own league, while public NFL schedules and raw Sleeper projection rows can share requests. League scoring and private report caches remain isolated by account and connection revision.

Sunday Desk uses ESPN/Sleeper projections for every lineup, waiver and matchup recommendation. There is no custom projection model, historical averaging, depth-chart adjustment, or selectable alternate forecast. ESPN values come directly from the selected week's league-scored appliedTotal. Sleeper's supplied weekly projected statistics use the scoring handlers from its own web client under the selected league's settings; no historical or personally estimated statistics are introduced.

The lineup engine chooses the highest-scoring legal combination, respecting eligibility, injuries, reserves, taxi slots, game locks and unknown data. Played and live players show actual points; upcoming players show provider projections. Lineup totals, matchup totals, position comparisons and player rows all use the same score selector, counting each player once. Live players can still score, so the mixed total is not a final-score forecast or win probability.

The Matchup tab leads with official team scores and each side's final/live/upcoming counts. A separate comparison combines actual starter scores and upcoming projections, followed by head-to-head starters, position advantages and actionable lineup/waiver links. Commissioner adjustments can cause official team totals to differ from player sums. NFL phases come from ESPN's weekly scoreboard, checked against season, week, game ID and home/away teams and cached for one minute; a passed kickoff or provider roster lock never establishes a final. Missing scores or unverifiable started-game states remain pending, while canceled/postponed players are excluded from recommendations.

The Waivers page builds a separate roster plan for the selected team: owned-player lineup repairs first, complete named add/drop comparisons, individual starter-absence fallbacks, and four-week bye coverage. The search checks up to 48 candidates across eligibility and bye groups. An exact assignment solver compares the optimized roster before and after each complete transaction, preserving fixed slots and provider points. Bench decisions show the backup value gained or lost; keeper/trade value is not estimated. Per-league Keep controls exclude protected players from proposed drops across Plan and Waivers during the dashboard session. K/DST streaming replaces the same position and omits edges below 0.5 points. Injury-designated players are not default drop candidates, and a valid zero remains zero.

Waiver ownership is checked against every league roster, including reserves/taxi. ESPN additionally requires free-agent/waiver status. The upstream scan covers up to 200 ESPN available players ordered by ownership, or the top 40 Sleeper provider projections per position after league scoring. Comparisons require fresh current-week data, verified ownership, and known relevant forecasts/locks. Missing actuals on fixed players keep totals pending but allow comparisons of unchanged remaining slots. Known ESPN transaction/roster locks and positive primary-position caps are respected. Unknown drop restrictions, keeper costs and claim costs require confirmation in the provider app. All cards are separate scenarios; claims, drops and lineup changes are never submitted by Sunday Desk. Research is retained as reference material; the normal Waivers experience presents applied team decisions rather than a reading guide.

Missing provider estimates remain unavailable. Insights use a new provider-only cache namespace, so previously cached custom forecasts cannot be loaded. Connected-league membership is checked before reading any private report. Previously imported public actual-stat facts are retained separately; they are not fetched or used by recommendations. The custom forecast and depth-chart pipeline has been removed.

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
- AUTH_EMAIL_PROVIDER: `gmail` for the selected Gmail sender, or `resend` for a custom-domain sender.
- GMAIL_ADDRESS / GMAIL_APP_PASSWORD: the Gmail sender and its separate 16-character Google app password, used only when Gmail is selected. Keep the app password server-only; never use the Google account password.
- RESEND_API_KEY / AUTH_EMAIL_FROM: optional alternative for Resend, using a sending-only key and a sender on its verified domain.

Migrations use DATABASE_ADMIN_URL and DATABASE_RUNTIME_PASSWORD only on the administrator's machine. Run node --env-file=.env.auth.local --experimental-strip-types scripts/migrate-accounts.mjs to create the isolated sunday_desk schema, auth tables and restricted role. Administrator credentials must never be deployed to Vercel. The server verifies database TLS using the public Supabase root CA and standard system roots. The schema is not exposed to Supabase anonymous/authenticated API roles.

For local account development, provide those server values in ignored .env.auth.local with BETTER_AUTH_URL=http://localhost:3000, then run node --env-file=.env.auth.local node_modules/vite/bin/vite.js --config vite.vercel.config.ts --host localhost --port 3000.

Account settings at `/account` let signed-in users change their password after providing the current password. The change replaces the current session and signs out other devices. The login page links to `/forgot-password`; reset links expire after 30 minutes, are single-use, and revoke every existing session when completed. Password reset does not alter league connections or notes.

Recovery email is explicitly enrolled from Account settings with a signed-in session and the current password, then confirmed through an emailed link. Existing unverified signup addresses are never automatically trusted for recovery. Public verification-email issuance is disabled; the guarded enrollment route derives the recipient from the session and has a persistent attempt limit. Unknown and unverified email addresses get the same reset-request response. New accounts also enroll recovery from Account settings. The previous owner's connections can be moved only through a private, expiring, single-use restore invitation. New users always start empty.

Account mail supports Gmail with the sender name Sunday Desk. Select `AUTH_EMAIL_PROVIDER=gmail`, set `GMAIL_ADDRESS`, and save a [Google app password](https://support.google.com/mail/answer/185833?hl=en) as the server-only `GMAIL_APP_PASSWORD`. Gmail requires two-step verification and is subject to Google's sending limits. The connection uses certificate-verified TLS to `smtp.gmail.com:465`; an incomplete Gmail setup never falls back to another sender. [Resend's email API](https://resend.com/docs/api-reference/emails/send-email) remains an optional alternative when explicitly selected and configured with a verified custom domain. No client bundle receives mail credentials.

Email links hold their tokens in URL fragments, which the password page captures in memory and removes from the address bar. Production delivery uses [Vercel waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) so the public response does not wait on the email provider. Failed deliveries are logged without email contents or credentials. Opening an email alone does not change a password.

The existing Sites deployment is a separate legacy snapshot. These new account routes target Vercel; do not redeploy them to Sites without a compatible database/auth adapter.

## ESPN browser connector

The setup page opens ESPN in the current tab, imports the user's existing session through a permissioned desktop extension, discovers their NFL teams, and asks which leagues to connect. Discovery validates each league against ESPN and returns only sanitized league details plus an encrypted, user-bound preview ticket. Confirmation checks ticket expiry (10 minutes), selected league membership and workspace revision before persisting encrypted credentials. Cancelling discovery does not replace a working connection.

This is not an embedded ESPN OAuth login. Cross-origin iframe isolation prevents a normal website from reading ESPN's login or cookies. No ESPN password is requested or captured.

The developer-preview extension source is in extensions/espn-connector, with a reproducible download in public/downloads. Run pnpm connector:package after changing the extension. Normal public distribution requires a browser-store release; the ZIP requires desktop Chrome/Edge Developer mode and Load unpacked. Phone browsers cannot use this desktop connector; users can connect once on a computer and access their dashboard on mobile afterward. The public connector allows only the canonical HTTPS origin, exact /setup path, top-level frame and its own extension ID. Required cookie access is requested during installation and limited to https://fantasy.espn.com/*. After installation, return to setup and reload the page. The toolbar icon opens setup in the current tab; installation and updates do not open extra tabs. It has no persistent storage or analytics.

For isolated local development, run node scripts/package-espn-connector.mjs --local and load work/espn-connector-local. That build permits localhost and must never be distributed publicly.

ESPN discovery uses the fan-profile endpoint employed by [ESPN's web client](https://cdn1.espn.net/kona/5a90d30cd38d-1.490/_next/static/commons/main-82d208d52efd2b467c49.js): GET https://fan.api.espn.com/apis/v2/fans/{encodedSWID}. The parser reads preferences[].metaData.entry for preference types 9/10, football gameId 1 and the current season. It extracts groups[0].groupId, then independently verifies team ownership in each league. This undocumented compatibility integration may change; the advanced manual form supports league IDs as a fallback.

Store submission materials, icons, and a real screenshot are in store-assets. The public privacy policy is /privacy. Version 0.2.0 is pending Chrome Web Store review with automatic publication enabled. No additional app deployment is needed to enable the install button after publication: /api/connector checks Google's public update manifest for the exact extension ID, then requires a matching public listing with an Add to Chrome control. Checks use no user credentials, are cached for five minutes, and stay unavailable on failed or unrecognized responses. Setup refreshes availability while visible and when users return to the page. lib/accounts/connector-release.ts holds the fixed listing identity and fallback review state.

Connector detection retries while the document_idle bridge loads, when setup regains focus, and through an explicit Check again action. It only sends readiness messages; finding teams still requires the user's button click. The submitted 0.2.0 extension package remains unchanged during review. The downloadable developer package is 0.2.1 and uses the current tab; that navigation change requires a later store package update for store-installed copies.

## What you can do

- See scores, opponents, records, connection status, and starter warnings for every league.
- Review one all-league action queue with direct links to each team's lineup, waiver comparisons, bye coverage and matchup.
- Compare your starters with the highest projected combination of available rostered players, under each league’s scoring and slot rules.
- Keep already-started players fixed, handle FLEX/superflex, and exclude unavailable players, IR, and taxi squads from proposed substitutions.
- Search a cross-league player portfolio to see ownership and starting-lineup concentration.
- View standings, save private league notes, and mark each week’s review complete across devices.
- Refresh manually or let the visible dashboard check every three minutes.

The app is **read-only with respect to fantasy providers**. Open ESPN or Sleeper to apply your changes, then refresh Sunday Desk. The review checkbox is a personal checklist, not confirmation that a provider lineup changed.

## Projection sources and lineup recommendations

**ESPN:** private league reads use the saved session. Team roster entries provide complete player identity, eligibility, locks, and weekly stats. Weekly projections use `statSourceId=1`, `statSplitTypeId=1`, matching the requested season/week; `appliedTotal` respects that league’s scoring. Matchup periods are mapped through league schedule settings. Current roster data is labeled as a reference when another week is selected.

**Sleeper:** official read endpoints provide leagues, rosters, matchups, users, and player metadata. Weekly projections come from the Rotowire feed exposed by Sleeper, filtered to the selected season and week. League points follow [Sleeper’s web client scoring handlers](https://sleepercdn.com/js/bundle-381db30c5bc8d8eda1440f10742a028a.js?vsn=d), verified September 11, 2026. Only supplied statistical keys are scored, including the provider’s special projected-kicking handlers. Generic PPR totals never replace league scoring. Unknown scoring rules are flagged, and missing player estimates remain unavailable. These supplemental interfaces can change.

**Lineup engine:** maximum-weight assignment across eligible starter slots. Actual game locks pin the player to the same slot; unknown locks hold current assignments. Healthy players with missing or partial projections are held out of swaps. Current injury and bye rules apply only to current-week recommendations; other weeks are reference views. Missing values display as an em dash, never a fabricated zero.

**Recommendation scope:** AutoSubs pairing rules are intentionally excluded. Lineup and waiver recommendations use each player's own game lock, position eligibility, availability, and provider points. A played player does not restrict unplayed teammates.

**Data checks:** Zero is a valid projection. A matching Sleeper weekly row with an empty or metadata-only stats object scores zero, just as Sleeper's own scorer does; generic PPR totals do not override league scoring. An absent row, malformed stats, or failed provider request remains unavailable. Starter score coverage is separate from lineup-evaluation completeness. Named checks distinguish missing bench projections, pending actual points, unconfirmed game status, and uncertain lineup eligibility. Confirmed live/final players need actuals, not projections; played bench players and players who cannot enter any remaining slot do not block completeness. An incomplete evaluation never presents zero as a confirmed potential gain. Actual points still contribute once to known lineup and matchup totals.

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

Tests cover assignment traps, repeated FLEX eligibility, game locks, missing/negative projections, IR/taxi/bye exclusions, stale/future/pre-draft behavior, cross-source exposure, and custom scoring. Command-center tests cover complete action grouping, league-specific destinations, shared Keep choices and valid-zero/played-score handling. Queue tests cover bounded concurrency, retry, timeouts, account/week isolation and obsolete-response cancellation. Lint applies to application code; generated shadcn components and the generated mobile hook are left intact.

Run node --env-file=.env.auth.local --experimental-strip-types scripts/test-accounts.mjs for database integration checks. It creates synthetic accounts, tests isolation and session revocation, and deletes only those test accounts afterward.

Run `node --env-file=.env.auth.local --experimental-strip-types scripts/test-passwords.mjs` for recovery and password-change integration checks. It captures email at the network boundary, uses synthetic accounts, verifies current-password proof, expiry, token replay, session revocation, rate limits and account isolation, and removes its test records. It sends no actual emails.

Account schema migrations are in db/postgres. Existing Drizzle/D1 files belong to the legacy Sites snapshot.

## Provider references

- [Sleeper API documentation](https://docs.sleeper.com/)
- [ESPN community API implementation](https://github.com/cwendt94/espn-api)
- [ESPN lineup and roster locks](https://support.espn.com/hc/en-us/articles/360055424451-Lineup-and-Roster-Lock-Times)
