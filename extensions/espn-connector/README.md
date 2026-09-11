# Sunday Desk ESPN Connector

Version 0.2.1. Sign-in happens directly on ESPN. After you choose to import, this connector reads only espn_s2 and SWID cookies applicable to https://fantasy.espn.com/. It never reads a password, changes ESPN cookies or lineups, or writes credentials to extension storage.

## Installation

The Chrome Web Store listing is being prepared. After approval, install from the official listing linked in Sunday Desk setup and confirm the browser prompt. Return to Sunday Desk and reload the page, or click the connector toolbar icon to open setup in the current tab. Sign in if needed and choose Find my ESPN teams. If ESPN is not signed in, use the ESPN login link, then import again. Choose leagues and confirm encrypted storage.

For manual development installation before store approval:

1. Extract the ZIP to a permanent folder.
2. Open chrome://extensions or edge://extensions, enable Developer mode, and choose Load unpacked. Select the folder containing manifest.json.
3. Return to Sunday Desk and reload the page. Find your ESPN teams, choose leagues, and confirm.

ESPN cookie access is requested during installation. There is no extra enable-access step. The toolbar icon opens Sunday Desk setup in the current tab. Installation and updates do not open pages automatically. Chrome or Edge on a computer is required for the connector; a connected dashboard works on phones.

## Privacy and removal

Import sends ESPN session values to Sunday Desk over HTTPS to discover your teams. The server returns league details and a short-lived encrypted preview ticket; it does not persist a connection until you confirm. Confirmation stores the selected account session encrypted for future dashboard refreshes. These are authentication cookies and can grant account access; Sunday Desk uses them only to read fantasy leagues.

Disconnect ESPN in Sunday Desk to delete its saved session and clear the private dashboard cache. Uninstall the extension or restrict its site access using browser extension settings to stop future browser imports. Uninstalling does not delete an already confirmed server connection.

Privacy policy: https://fantasy-football-helper-orcin.vercel.app/privacy
Support: https://github.com/chris20ace/Fantasy_Football_Helper/issues

The public connector permits only the canonical HTTPS Sunday Desk origin and exact /setup path, in a top-level frame. Preview aliases and localhost are excluded. The separate local packaging command generates an isolated development build; never distribute it.

Sunday Desk is independent and is not affiliated with or endorsed by ESPN or Disney.
