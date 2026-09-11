param([string]$CredentialPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $CredentialPath) { $CredentialPath = Join-Path $projectRoot 'work\espn-connection\credentials.dpapi' }
if (-not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) { throw 'Encrypted connection not found. Run the connection helper or provide -CredentialPath.' }
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($CredentialPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
try { $connection = [Text.Encoding]::UTF8.GetString($plainBytes) | ConvertFrom-Json }
finally { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
if (-not $connection.espn_s2 -or -not $connection.swid -or $connection.espn_s2 -match '[\r\n;]') { throw 'The saved connection is invalid.' }
$lines = @('ESPN_S2=' + ($connection.espn_s2 | ConvertTo-Json -Compress); 'ESPN_SWID=' + ($connection.swid | ConvertTo-Json -Compress))
[IO.File]::WriteAllLines((Join-Path $projectRoot '.dev.vars'), $lines)
$connection = $null
Write-Host 'Local session prepared. Restart the development server. Production secrets are managed separately.'
