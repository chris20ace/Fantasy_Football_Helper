# Sunday Desk ESPN Connector

Desktop Chrome and Edge developer preview. Sign-in happens on ESPN. The connector reads only espn_s2 and SWID, with optional browser permission, when the signed-in Sunday Desk setup page requests an import. It never reads a password, changes ESPN cookies, modifies a roster, or writes credentials to extension storage.

## Install

1. Extract the connector ZIP to a permanent folder.
2. Open chrome://extensions (or edge://extensions), enable Developer mode, and choose Load unpacked. Select this folder, which contains manifest.json.
3. Open the extension from the toolbar and click Enable ESPN access. Accept the browser permission prompt.
4. Sign in directly at https://www.espn.com/login/.
5. Open https://fantasy-football-helper-orcin.vercel.app/setup, reload the page, and choose Import from ESPN. Review your leagues and confirm.

Normal public installation needs Chrome Web Store publication; this package is not store-reviewed. Desktop Chrome extensions do not run in Chrome on a phone.

## Privacy and removal

ESPN session values pass to Sunday Desk only to authenticate the read-only import. Discovery returns a short-lived encrypted preview ticket; plaintext session values are discarded from app state. Confirmation stores the selected account session encrypted, associated only with the authenticated Sunday Desk user, so the dashboard can refresh later. ESPN sessions can expire; repeat the import to reconnect. No analytics or third-party destinations are included.

Disconnect ESPN in Sunday Desk to delete its saved credentials. Remove browser access in the connector popup or uninstall the connector to stop future imports. Removing the extension does not remove an already confirmed server connection.

The distributed connector permits only the canonical HTTPS Sunday Desk origin and exact /setup path. Preview aliases and localhost are deliberately excluded. Developers may use the separate local packaging command; never distribute that build.
