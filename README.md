# Fantasy Football Helper

Local account-connection tools for a personal fantasy football dashboard combining Sleeper and ESPN leagues.

## Current functionality

- A Windows setup window verifies access to three configured private ESPN leagues.
- Session values are encrypted with Windows DPAPI for the current Windows user and saved with restricted folder permissions.
- A noninteractive import mode accepts session values through standard input without placing them in command arguments or plaintext files.
- A saved-connection check verifies that the encrypted session can be reused independently of a browser.

Sleeper access was verified during setup. A reusable Sleeper connector and the combined dashboard have **not yet been implemented** in this repository.

## Run the ESPN setup

Requires Windows and Windows PowerShell 5.1, which is included with Windows. No additional packages are required.

Open [`scripts/Open-ESPN-Connection.cmd`](scripts/Open-ESPN-Connection.cmd), then follow the instructions in the connection window. The launcher keeps the PowerShell console hidden and displays the setup form.

You sign into ESPN yourself. For a private league, the community integration requires the `espn_s2` and `SWID` session-cookie values. Enter those only into the local masked fields; do not put them in GitHub, chat, screenshots, command-line arguments, or environment files.

The configured leagues are IU, BTOWNS FINEST, and Charlie Ruff Memorial League. The league IDs and season are set near the top of [`scripts/Connect-ESPN.ps1`](scripts/Connect-ESPN.ps1). The helper saves a connection only after all configured leagues pass verification.

## Verify an existing local connection

From the repository directory:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Connect-ESPN.ps1 -VerifySaved
```

The result contains connection status only. A clone has no saved session; run setup on that computer first. Credentials already saved by another copy of the helper stay in that copy's local workspace and are not transferred by cloning this repository.

## Validation

These checks use synthetic data and do not require an ESPN login:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\Connect-ESPN.ps1 -SelfTest
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\Connect-ESPN.ps1 -SmokeTest
```

The self-test covers session-input validation, SWID normalization, Windows encryption, restricted storage permissions, and atomic credential replacement. The smoke test constructs the connection form and its event handlers without showing the window.

## Local data and limitations

- Encrypted session: `work/espn-connection/credentials.dpapi`.
- Connection summary: `work/espn-status.json`.
- The entire `work/` directory, encrypted credentials, and environment files are ignored by Git.
- This is a community ESPN integration, not an official ESPN OAuth app. Expired sessions may require reconnecting.
- The helper makes read requests for league settings and team data. It does not change lineups, waivers, trades, or league settings.
- This repository contains source code and documentation, not a hosted dashboard or anyone's saved account session.

## References

- [Sleeper API documentation](https://docs.sleeper.com/)
- [Community ESPN integration](https://github.com/cwendt94/espn-api/wiki)
- [ESPN session-cookie setup](https://github.com/cwendt94/espn-api/discussions/150)
