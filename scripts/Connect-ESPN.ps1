param([switch]$SelfTest, [switch]$SmokeTest, [switch]$ImportStdin, [switch]$VerifySaved)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Web.Extensions

$workspacePath = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $workspacePath 'work/espn-connection'
$statusPath = Join-Path $workspacePath 'work/espn-status.json'
$season = 2026
$leagueIds = [int[]]@(626895972, 1360778906, 103664)

Add-Type -ReferencedAssemblies 'System.Net.Http','System.Web.Extensions' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace FantasyHub {
    public sealed class LeagueCheck {
        public int Id { get; set; }
        public string Name { get; set; }
        public bool Accessible { get; set; }
        public string Message { get; set; }
    }
    public static class EspnConnection {
        public static string NormalizeSwid(string value) {
            Guid id;
            if (!Guid.TryParse(value.Trim(), out id))
                throw new ArgumentException("SWID should be an account ID, usually inside braces.");
            return "{" + id.ToString().ToUpperInvariant() + "}";
        }
        public static bool IsValidSession(string value) {
            if (String.IsNullOrWhiteSpace(value) || value.Length < 10 || value.Length > 16000) return false;
            foreach (char c in value)
                if (Char.IsControl(c) || Char.IsWhiteSpace(c) || c == ';' || c == ',') return false;
            return true;
        }
        public static async Task<LeagueCheck[]> CheckAsync(string session, string swid, int season, int[] ids) {
            var cookies = new CookieContainer();
            cookies.MaxCookieSize = 20000;
            cookies.Add(new Uri("https://lm-api-reads.fantasy.espn.com"), new Cookie("espn_s2", session, "/"));
            cookies.Add(new Uri("https://lm-api-reads.fantasy.espn.com"), new Cookie("SWID", swid, "/"));
            using (var handler = new HttpClientHandler { CookieContainer = cookies, AllowAutoRedirect = false })
            using (var client = new HttpClient(handler)) {
                client.Timeout = TimeSpan.FromSeconds(25);
                client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
                var tasks = new List<Task<LeagueCheck>>();
                foreach (int id in ids) tasks.Add(CheckLeague(client, season, id));
                return await Task.WhenAll(tasks).ConfigureAwait(false);
            }
        }
        private static async Task<LeagueCheck> CheckLeague(HttpClient client, int season, int id) {
            var result = new LeagueCheck { Id = id, Name = id.ToString(), Accessible = false };
            try {
                var url = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/" + season + "/segments/0/leagues/" + id + "?view=mSettings&view=mTeam";
                using (var response = await client.GetAsync(url).ConfigureAwait(false)) {
                    if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden) {
                        result.Message = "Access denied. Check that this ESPN account belongs to the league and recopy both values.";
                        return result;
                    }
                    if (!response.IsSuccessStatusCode) {
                        result.Message = "ESPN returned HTTP " + (int)response.StatusCode + ". Try again later.";
                        return result;
                    }
                    var text = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    var json = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text);
                    object returnedId;
                    if (json == null || !json.TryGetValue("id", out returnedId) || Convert.ToInt64(returnedId) != id) {
                        result.Message = "ESPN did not return the expected league.";
                        return result;
                    }
                    object settingsValue;
                    object teamsValue;
                    if (!json.TryGetValue("settings", out settingsValue) || !(settingsValue is Dictionary<string, object>) || !json.TryGetValue("teams", out teamsValue) || !(teamsValue is System.Collections.IList) || ((System.Collections.IList)teamsValue).Count == 0) {
                        result.Message = "ESPN did not return private settings and team data.";
                        return result;
                    }
                    var settings = settingsValue as Dictionary<string, object>;
                    object name;
                    if (settings.TryGetValue("name", out name)) result.Name = Convert.ToString(name);
                    result.Accessible = true;
                    result.Message = "Access verified";
                }
            } catch (TaskCanceledException) {
                result.Message = "ESPN took too long to respond. Try again.";
            } catch {
                result.Message = "Could not read ESPN's response. Check your internet connection and try again.";
            }
            return result;
        }
    }
}
'@

function Save-EncryptedConnection([string]$SessionValue, [string]$SwidValue) {
    [IO.Directory]::CreateDirectory($statePath) | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagation = [Security.AccessControl.PropagationFlags]::None
    $allow = [Security.AccessControl.AccessControlType]::Allow
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inheritance, $propagation, $allow)))
    $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', $inheritance, $propagation, $allow)))
    [IO.Directory]::SetAccessControl($statePath, $acl)

    $connectionId = [Guid]::NewGuid().ToString('N')
    $payload = @{espn_s2=$SessionValue; swid=$SwidValue; connection_id=$connectionId; saved_at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
    $plain = [Text.Encoding]::UTF8.GetBytes($payload)
    try {
        $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $credentialPath = Join-Path $statePath 'credentials.dpapi'
        $temporaryPath = Join-Path $statePath ('credentials.' + $connectionId + '.pending')
        try {
            [IO.File]::WriteAllBytes($temporaryPath, $encrypted)
            if ([IO.File]::Exists($credentialPath)) {
                [IO.File]::Replace($temporaryPath, $credentialPath, [NullString]::Value)
            } else {
                [IO.File]::Move($temporaryPath, $credentialPath)
            }
        } finally {
            if ([IO.File]::Exists($temporaryPath)) { [IO.File]::Delete($temporaryPath) }
        }
    } finally {
        [Array]::Clear($plain, 0, $plain.Length)
        $payload = $null
    }
    return $connectionId
}

function Save-ConnectionStatus($Checks, [string]$ConnectionId) {
    $record = @{status='connected'; connection_id=$ConnectionId; checked_at=[DateTime]::UtcNow.ToString('o'); season=$season; credentials_saved=$true; leagues=@($Checks | Select-Object Id,Name,Accessible,Message)}
    $temporaryStatus = $statusPath + '.' + $ConnectionId + '.pending'
    try {
        $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporaryStatus -Encoding UTF8
        if ([IO.File]::Exists($statusPath)) {
            [IO.File]::Replace($temporaryStatus, $statusPath, [NullString]::Value)
        } else {
            [IO.File]::Move($temporaryStatus, $statusPath)
        }
        return $true
    } catch {
        return $false
    } finally {
        if ([IO.File]::Exists($temporaryStatus)) { [IO.File]::Delete($temporaryStatus) }
    }
}

if ($ImportStdin -or $VerifySaved) {
    $rawInput = $null
    $inputData = $null
    $sessionValue = $null
    $swidValue = $null
    $saved = $false
    $exitCode = 1
    try {
        if ($ImportStdin -and $VerifySaved) { throw 'Invalid mode.' }
        if ($VerifySaved) {
            $secretBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $statePath 'credentials.dpapi')), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            try { $rawInput = [Text.Encoding]::UTF8.GetString($secretBytes) }
            finally { [Array]::Clear($secretBytes, 0, $secretBytes.Length) }
        } else {
            $buffer = New-Object char[] 20001
            $length = [Console]::In.ReadBlock($buffer, 0, $buffer.Length)
            if ($length -gt 20000) { throw 'Input too large.' }
            $rawInput = New-Object string($buffer, 0, $length)
            [Array]::Clear($buffer, 0, $buffer.Length)
        }
        $inputData = $rawInput | ConvertFrom-Json
        if ($inputData.espn_s2 -isnot [string] -or $inputData.swid -isnot [string]) { throw 'Missing fields.' }
        $sessionValue = $inputData.espn_s2.Trim()
        if (-not [FantasyHub.EspnConnection]::IsValidSession($sessionValue)) { throw 'Invalid session.' }
        $swidValue = [FantasyHub.EspnConnection]::NormalizeSwid($inputData.swid)
        $checks = [FantasyHub.EspnConnection]::CheckAsync($sessionValue, $swidValue, $season, $leagueIds).GetAwaiter().GetResult()
        $successes = @($checks | Where-Object Accessible).Count
        if ($successes -eq $leagueIds.Count) {
            if ($ImportStdin) { $connectionId = Save-EncryptedConnection $sessionValue $swidValue }
            else { $connectionId = [string]$inputData.connection_id }
            $saved = $true
            $summarySaved = Save-ConnectionStatus $checks $connectionId
            @{status='connected'; verified_count=$successes; credentials_saved=$true; summary_saved=$summarySaved} | ConvertTo-Json -Compress
            $exitCode = 0
        } else {
            @{status='verification_failed'; verified_count=$successes; credentials_saved=$false; leagues=@($checks | Select-Object Id,Accessible,Message)} | ConvertTo-Json -Depth 5 -Compress
        }
    } catch {
        # Never expose parser exceptions, request headers, input, or credential values.
        @{status='connection_error'; credentials_saved=$saved} | ConvertTo-Json -Compress
    } finally {
        $rawInput = $null
        $inputData = $null
        $sessionValue = $null
        $swidValue = $null
    }
    exit $exitCode
}

if ($SelfTest) {
    $sample = [Text.Encoding]::UTF8.GetBytes('synthetic-local-encryption-test')
    $encoded = [Security.Cryptography.ProtectedData]::Protect($sample, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $decoded = [Security.Cryptography.ProtectedData]::Unprotect($encoded, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ([Text.Encoding]::UTF8.GetString($decoded) -ne 'synthetic-local-encryption-test') { throw 'Encryption round trip failed.' }
    if ([FantasyHub.EspnConnection]::IsValidSession("test-session`r`nInjected: header")) { throw 'Unsafe session value accepted.' }
    if ([FantasyHub.EspnConnection]::IsValidSession('test-session;other=value')) { throw 'Unsafe cookie separator accepted.' }
    if (-not [FantasyHub.EspnConnection]::IsValidSession('synthetic-session-value')) { throw 'Session validation failed.' }
    if ([FantasyHub.EspnConnection]::NormalizeSwid('11111111-2222-3333-4444-555555555555') -ne '{11111111-2222-3333-4444-555555555555}') { throw 'SWID normalization failed.' }
    $badGuidRejected = $false
    try { [FantasyHub.EspnConnection]::NormalizeSwid('invalid') | Out-Null } catch { $badGuidRejected = $true }
    if (-not $badGuidRejected) { throw 'Invalid SWID accepted.' }
    $statePath = Join-Path $workspacePath ('work/espn-selftest-' + [Guid]::NewGuid().ToString('N'))
    try {
        Save-EncryptedConnection 'synthetic-session-value' '{11111111-2222-3333-4444-555555555555}' | Out-Null
        $testConnectionId = Save-EncryptedConnection 'synthetic-session-replacement' '{11111111-2222-3333-4444-555555555555}'
        $testFile = Join-Path $statePath 'credentials.dpapi'
        $testBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($testFile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $testPayload = [Text.Encoding]::UTF8.GetString($testBytes) | ConvertFrom-Json
        if ($testPayload.espn_s2 -ne 'synthetic-session-replacement') { throw 'Saved credential round trip failed.' }
        if ($testPayload.connection_id -ne $testConnectionId) { throw 'Saved connection ID mismatch.' }
        if (-not (Get-Acl -LiteralPath $statePath).AreAccessRulesProtected) { throw 'Credential folder permissions were not restricted.' }
        [Array]::Clear($testBytes, 0, $testBytes.Length)
    } finally {
        if ([IO.File]::Exists((Join-Path $statePath 'credentials.dpapi'))) { [IO.File]::Delete((Join-Path $statePath 'credentials.dpapi')) }
        if ([IO.Directory]::Exists($statePath)) { [IO.Directory]::Delete($statePath) }
    }
    [Array]::Clear($sample, 0, $sample.Length)
    [Array]::Clear($decoded, 0, $decoded.Length)
    Write-Output 'PASS: helper compiled; session validation; SWID validation; Windows user-bound encryption; restricted folder permissions; atomic saved-credential replacement.'
    exit 0
}

[Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text = 'Fantasy Hub | ESPN connection'
$form.ClientSize = New-Object Drawing.Size(800, 760)
$form.MinimumSize = New-Object Drawing.Size(816, 799)
$form.StartPosition = 'CenterScreen'
$form.AutoScaleMode = [Windows.Forms.AutoScaleMode]::Dpi
$form.BackColor = [Drawing.Color]::FromArgb(246, 248, 251)
$form.Font = New-Object Drawing.Font('Segoe UI', 10.5)

function Add-Text([string]$Text, [int]$X, [int]$Y, [int]$Width, [int]$Height) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object Drawing.Point($X, $Y)
    $label.Size = New-Object Drawing.Size($Width, $Height)
    $label.ForeColor = [Drawing.Color]::FromArgb(29, 41, 57)
    $form.Controls.Add($label)
    return $label
}

$heading = Add-Text 'Connect your ESPN leagues' 28 22 744 42
$heading.Font = New-Object Drawing.Font('Segoe UI', 20, [Drawing.FontStyle]::Bold)
$null = Add-Text 'IU  |  BTOWNS FINEST  |  Charlie Ruff Memorial League' 30 76 740 28
$null = Add-Text "1. Open ESPN in Chrome or Edge and sign in yourself.`r`n2. Press F12. In Developer Tools, select Application (it may be under >>).`r`n3. Under Storage > Cookies, select the ESPN website.`r`n4. Copy the espn_s2 and SWID values into the matching fields below." 30 116 742 104

$openButton = New-Object Windows.Forms.Button
$openButton.Text = 'Open ESPN'
$openButton.Location = New-Object Drawing.Point(30, 225)
$openButton.Size = New-Object Drawing.Size(145, 40)
$openButton.Add_Click({ Start-Process 'https://fantasy.espn.com/football/league?leagueId=626895972' })
$form.Controls.Add($openButton)

$null = Add-Text 'ESPN session value (espn_s2)' 30 285 730 24
$sessionBox = New-Object Windows.Forms.TextBox
$sessionBox.Location = New-Object Drawing.Point(30, 314)
$sessionBox.Size = New-Object Drawing.Size(740, 32)
$sessionBox.UseSystemPasswordChar = $true
$sessionBox.MaxLength = 16000
$sessionBox.AccessibleName = 'ESPN session value espn_s2'
$form.Controls.Add($sessionBox)

$null = Add-Text 'Account ID (SWID)' 30 363 730 24
$swidBox = New-Object Windows.Forms.TextBox
$swidBox.Location = New-Object Drawing.Point(30, 392)
$swidBox.Size = New-Object Drawing.Size(740, 32)
$swidBox.UseSystemPasswordChar = $true
$swidBox.MaxLength = 64
$swidBox.AccessibleName = 'ESPN account ID SWID'
$form.Controls.Add($swidBox)

$null = Add-Text 'These values grant access to your private leagues. After all three leagues pass the check, they are encrypted for your Windows account and saved on this computer. They are sent only to ESPN for verification.' 30 447 740 68
$null = Add-Text 'This community connection reads league data. It does not change lineups, waivers, trades, or league settings.' 30 514 740 50

$connectButton = New-Object Windows.Forms.Button
$connectButton.Text = 'Connect and check leagues'
$connectButton.Location = New-Object Drawing.Point(30, 578)
$connectButton.Size = New-Object Drawing.Size(290, 44)
$connectButton.BackColor = [Drawing.Color]::FromArgb(12, 101, 79)
$connectButton.ForeColor = [Drawing.Color]::White
$connectButton.FlatStyle = 'Flat'
$form.Controls.Add($connectButton)

$statusLabel = Add-Text 'Waiting for your ESPN connection values.' 30 642 740 98
$statusLabel.AccessibleName = 'Connection status'
$form.AcceptButton = $connectButton
$script:connectionTask = $null
$script:pendingSession = $null
$script:pendingSwid = $null

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
    if ($null -eq $script:connectionTask -or -not $script:connectionTask.IsCompleted) { return }
    $timer.Stop()
    try {
        $checks = $script:connectionTask.GetAwaiter().GetResult()
        $successes = @($checks | Where-Object Accessible).Count
        if ($successes -eq $leagueIds.Count) {
            $connectionId = Save-EncryptedConnection $script:pendingSession $script:pendingSwid
            $summarySaved = Save-ConnectionStatus $checks $connectionId
            $statusLabel.ForeColor = [Drawing.Color]::FromArgb(12, 101, 79)
            $statusLabel.Text = "Connected: all three ESPN leagues verified.`r`nYour connection is encrypted and saved. You can close this window and return to the chat."
            $sessionBox.Clear()
            $swidBox.Clear()
        } else {
            $failure = @($checks | Where-Object { -not $_.Accessible })[0]
            $statusLabel.ForeColor = [Drawing.Color]::FromArgb(155, 42, 32)
            $statusLabel.Text = "$successes of 3 leagues verified. Connection not saved.`r`nLeague $($failure.Id): $($failure.Message)"
        }
    } catch {
        $statusLabel.ForeColor = [Drawing.Color]::FromArgb(155, 42, 32)
        $statusLabel.Text = 'The connection could not be verified and saved. Check the values and try again.'
    } finally {
        $script:connectionTask = $null
        $script:pendingSession = $null
        $script:pendingSwid = $null
        $connectButton.Enabled = $true
        $sessionBox.Enabled = $true
        $swidBox.Enabled = $true
    }
})

$connectButton.Add_Click({
    $sessionValue = $sessionBox.Text.Trim()
    if (-not [FantasyHub.EspnConnection]::IsValidSession($sessionValue)) {
        $statusLabel.Text = 'Copy only the espn_s2 cookie value into the first field.'
        return
    }
    try { $swidValue = [FantasyHub.EspnConnection]::NormalizeSwid($swidBox.Text) }
    catch {
        $statusLabel.Text = 'Copy the SWID cookie value into the second field. It usually looks like an ID inside braces.'
        return
    }
    $script:pendingSession = $sessionValue
    $script:pendingSwid = $swidValue
    $connectButton.Enabled = $false
    $sessionBox.Enabled = $false
    $swidBox.Enabled = $false
    $statusLabel.ForeColor = [Drawing.Color]::FromArgb(29, 41, 57)
    $statusLabel.Text = 'Checking access to your three ESPN leagues...'
    $script:connectionTask = [FantasyHub.EspnConnection]::CheckAsync($sessionValue, $swidValue, $season, $leagueIds)
    $timer.Start()
})
$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
    $sessionBox.Clear()
    $swidBox.Clear()
    $script:pendingSession = $null
    $script:pendingSwid = $null
})
$form.Add_Shown({
    # A hidden PowerShell console can pass its initial show flag to the first window.
    # Show the interactive form explicitly while keeping that console hidden.
    $form.Hide()
    $form.Show()
    $form.Activate()
})
if ($SmokeTest) {
    $form.CreateControl()
    if ($form.Controls.Count -lt 10) { throw 'Connection form did not initialize.' }
    Write-Output 'PASS: connection form and event handlers initialized.'
} else {
    [Windows.Forms.Application]::Run($form)
}
$form.Dispose()
