# Sunday Desk ESPN Connector — submission materials

Status: prepared; publisher registration and actual submission are still required. Do not mark the app's Install button published until the listing is approved and publicly installable.

## Listing

Name: Sunday Desk ESPN Connector

Summary: Import your ESPN Fantasy Football teams into your private Sunday Desk dashboard. Choose your leagues and connect in a few clicks.

Language: English
Category: choose the available category closest to Tools / Productivity.
Price: Free
Homepage: https://fantasy-football-helper-orcin.vercel.app/setup
Support: https://github.com/chris20ace/Fantasy_Football_Helper/issues
Privacy policy: https://fantasy-football-helper-orcin.vercel.app/privacy

### Detailed description

Bring your ESPN Fantasy Football leagues into one private Sunday Desk workspace without copying session cookies or looking up league IDs.

Install the connector and Sunday Desk opens automatically. Sign in to Sunday Desk, choose Find my ESPN teams, select your leagues, and confirm. If you are not already signed in to ESPN in this browser, use the ESPN sign-in link first. Your ESPN password stays on ESPN.

The connector imports the ESPN account already signed in to your browser. Your Sunday Desk dashboard helps you review rosters, matchups, league standings, and weekly lineup choices alongside your connected Sleeper leagues. Set actual lineups, trades, and waivers directly on ESPN or Sleeper.

How your connection is handled:

- Cookie access is requested by the browser during installation.
- Choosing Import sends the espn_s2 and SWID session cookies to Sunday Desk to find your teams.
- You choose leagues and confirm before the session is stored encrypted for future refreshes.
- Disconnect ESPN in Sunday Desk to remove its saved session.
- No passwords are collected by the connector, no general browsing history is collected, and no lineups are changed.

A free Sunday Desk account and your own ESPN Fantasy Football account are required. Desktop Chrome or a compatible desktop Chromium browser is needed for connection; the connected dashboard is usable on phones. ESPN sessions may expire, requiring you to reconnect.

Sunday Desk is an independent project, not affiliated with or endorsed by ESPN, Disney, or Sleeper.

## Single purpose

Connect the ESPN Fantasy account signed into this browser to Sunday Desk, so the user can import their leagues and use their private fantasy football dashboard.

## Permission justifications

cookies: Read only espn_s2 and SWID applicable to https://fantasy.espn.com/ after the user chooses to import. Transfer them to Sunday Desk to discover leagues, and save the session encrypted only after confirmation. No cookie modification, password collection, or background monitoring.

https://fantasy.espn.com/*: Required solely to read these two ESPN authentication cookies through chrome.cookies.get. No wildcard access to unrelated ESPN subdomains is requested.

Sunday Desk content script: Provides the connection bridge only on the exact production origin and /setup path. The background verifies the extension ID, top-level frame, origin and path before reading cookies. All other origins and paths are rejected.

Remote code: No. All extension JavaScript is packaged in the submitted ZIP. Server-side API requests are data processing, not remotely loaded executable extension code.

## Privacy declarations

Authentication information: Yes — ESPN authentication cookies; Sunday Desk login information in the associated service.
Personally identifiable information: Yes — SWID account identifier; user-provided name and email in the associated service.
Website content: Yes — fantasy league, roster and matchup information used by the associated dashboard. The extension does not scrape arbitrary website content.
Financial/payment, health, precise location, web browsing history, and unrelated user activity: Not collected by the connector.

Certifications: data is not sold; not used or transferred for unrelated purposes; not used for creditworthiness or lending. Data use follows the Chrome Web Store User Data Policy, including Limited Use. The public privacy policy explains processing by Vercel/Supabase, discovery versus persistence, and removal controls.

## Reviewer instructions

1. Install the extension. The install event opens Sunday Desk setup automatically. No extra toolbar permission toggle is needed.
2. Create a free Sunday Desk account or sign into one. No purchase is required.
3. Sign into your own ESPN account with a current NFL fantasy team at https://www.espn.com/login/. Do not enter your ESPN password into Sunday Desk.
4. Return to Sunday Desk setup and choose Find my ESPN teams. The disclosure immediately beside the button explains session transmission.
5. The server discovers current NFL league memberships and verifies ownership. Choose leagues, acknowledge encrypted session storage, then confirm.
6. Open the dashboard. Manage accounts returns to setup. Disconnect deletes the saved ESPN session from active storage and clears private cache.
7. Without an ESPN session or current NFL teams, the app shows an actionable sign-in/no-teams message and does not save a connection.

No owner ESPN account, cookie, or password is included in this submission. Reviewers may use their own test ESPN membership. If Google requests additional test access, arrange a dedicated test account; never provide a personal ESPN session.

## Asset map

- ZIP: public/downloads/sunday-desk-espn-connector.zip (manifest at root)
- Store icon: extensions/espn-connector/icon-128.png
- Small promo tile: store-assets/promo-tile-440x280.png
- Screenshot: store-assets/01-sign-in-1280x800.png (actual public sign-in page, no private account data)

## Publisher-only prerequisites

Complete Google's one-time publisher registration, verified contact email, 2-Step Verification, and Trader/Non-Trader declaration. The publisher must choose their legal status and any public contact information; it is not inferred here. Store review is external and may take days or longer.
