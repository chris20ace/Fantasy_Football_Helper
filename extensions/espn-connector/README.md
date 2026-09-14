# Sunday Desk ESPN Connector

Version 0.3.0 (prepared for a Chrome Web Store update; not the published version until store approval). Sign-in happens directly on ESPN. After you choose to connect, this connector reads only espn_s2 and SWID cookies applicable to https://fantasy.espn.com/. It never reads a password, changes ESPN cookies or lineups, or writes credentials to extension storage.

## Installation

Install from the official Chrome Web Store listing linked in Sunday Desk setup and confirm the browser prompt. Return to Sunday Desk and reload the page, or click the connector toolbar icon to open setup in the current tab. Choose Connect ESPN. If ESPN is already signed in, choose your leagues and confirm. With version 0.3.0, if a sign-in is needed, Sunday Desk can take the same tab to ESPN. Sign in using ESPN's own controls, then click Continue to Sunday Desk in the connector's panel. The same tab returns to your league selection. Older published connector versions retain the existing manual sign-in-and-return flow until the update is installed.

For manual development installation before store approval:

1. Extract the ZIP to a permanent folder.
2. Open chrome://extensions or edge://extensions, enable Developer mode, and choose Load unpacked. Select the folder containing manifest.json.
3. Return to Sunday Desk and reload the page. Find your ESPN teams, choose leagues, and confirm.

ESPN cookie access is requested during installation. Version 0.3.0 also needs the storage permission for temporary sign-in flow state. It uses only chrome.storage.session, containing a random flow identifier, phase, and expiration keyed to the originating tab; never cookie values. The state expires after 10 minutes and is removed on return, cancellation, or tab closure. Browser-session storage is not synced or written to persistent extension storage. The toolbar icon opens Sunday Desk setup in the current tab. Installation and updates do not open pages automatically. The connector needs a desktop browser supporting Chrome extensions; a connected dashboard works on phones.

## Privacy and removal

Import sends ESPN session values to Sunday Desk over HTTPS to discover your teams. The server returns league details and a short-lived encrypted preview ticket; it does not persist a connection until you confirm. Confirmation stores the selected account session encrypted for future dashboard refreshes. These are authentication cookies and can grant account access; Sunday Desk uses them only to read fantasy leagues.

Disconnect ESPN in Sunday Desk to delete its saved session and clear the private dashboard cache. Uninstall the extension or restrict its site access using browser extension settings to stop future browser imports. Uninstalling does not delete an already confirmed server connection.

Privacy policy: https://fantasy-football-helper-orcin.vercel.app/privacy
Support: https://github.com/chris20ace/Fantasy_Football_Helper/issues

The public connector permits only the canonical HTTPS Sunday Desk origin and exact /setup path, in a top-level frame. Preview aliases and localhost are excluded. The separate local packaging command generates an isolated development build; never distribute it.

The ESPN panel runs only on the exact https://fantasy.espn.com origin under /football and appears only for an active flow started from Sunday Desk in that tab. An ordinary ESPN visit does not navigate anywhere or read cookies. Continue and Cancel require a real user click. Returning uses a one-time random fragment identifier, not credentials. Sunday Desk checks its own pending flow and the signed-in account before requesting discovery. Connection storage still requires the user to select leagues and confirm on Sunday Desk.

Sunday Desk is independent and is not affiliated with or endorsed by ESPN or Disney.
