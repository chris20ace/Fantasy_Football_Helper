# Sunday Desk mobile ESPN connection

This folder contains native Android and iOS applications that open the existing
Sunday Desk website and present ESPN sign-in in a separate native browser view.
It does not use an iframe, browser extension, Capacitor live reload, password
scraping, or a simulated ESPN login form.

The native apps are **not published in either app store**. A successful unsigned
build proves compilation only. Real ESPN sign-in, two-factor prompts, league
selection, reconnects, and cross-device refresh still need to pass the device
acceptance checks below before the apps are offered to users.

## User flow

1. Open Sunday Desk and sign in to the existing Sunday Desk account.
2. On Setup, choose ESPN and tap Connect.
3. The native app opens ESPN's own fantasy page in an isolated provider browser.
4. The user signs in with ESPN/Disney, then explicitly taps the native Continue
   button. Cancel returns without connecting.
5. Native code returns only ESPN's `espn_s2` and `SWID` session cookies to the
   requesting Sunday Desk Setup document. It never reads password form fields.
6. The existing authenticated discover endpoint verifies the ESPN session and
   returns available leagues. The user chooses leagues and confirms in the app.
   Discovery alone does not persist a new connection.
7. The existing encrypted account connection is available from the same Sunday
   Desk account on other devices. ESPN expiration requires signing in again.

## Build

Android uses Java 17, Gradle **8.13**, Android Gradle Plugin **8.13.2**, AndroidX
WebKit **1.17.0**, compile/target SDK **36**, and minimum Android **9 / API 28**.
The Gradle wrapper JAR comes from Gradle's v8.13.0 release and was checked against
its published SHA-256. The distribution ZIP's published SHA-256 is pinned in
`gradle-wrapper.properties`. No npm dependencies or website build changes are
needed.

Install the Android SDK platform 36 and JDK 17, then run:

```sh
cd mobile/android
bash ./gradlew :app:testDebugUnitTest :app:assembleDebug --no-daemon
```

On Windows use `gradlew.bat` in that directory. The debug APK is
`app/build/outputs/apk/debug/app-debug.apk`. This is a developer test package,
not a Play Store release. Signing credentials are deliberately not included.

iOS uses UIKit and WebKit with minimum **iOS 16**, with **XcodeGen 2.46.0** to
generate the Xcode project from `ios/project.yml`. Install Xcode and that
XcodeGen version on macOS, then run:

```sh
bash mobile/scripts/build-ios.sh
```

This creates `mobile/ios/SundayDesk.xcodeproj` and builds the app and test bundle
for the simulator without signing. In Xcode, choose an available simulator and
run the SundayDesk test scheme to execute `UrlPolicyTests`. For a physical iPhone,
select the developer's signing team, build the app, and complete the acceptance
checks. Store icons, privacy declarations, screenshots, device validation,
signing, and Apple/Google submissions are separate release work.

## Native bridge contract, version 1

The bridge is only callable from the main frame at:

`https://fantasy-football-helper-orcin.vercel.app/setup`

The exact scheme, host, port and path are checked in native code before opening
ESPN and again before returning a session. Preview hosts, lookalike domains,
other paths, user-info URLs, non-HTTPS URLs, and frames are rejected.

Commands are `{ command: 'status' | 'connect' | 'cancel', requestId: UUID }`.
The web client must register its response handler before sending Android
messages and use an independent UUID for each new operation. Cancellation uses
the original connect UUID. Responses are keyed by **command and requestId**,
because cancellation replies to both commands.

Android:

```js
window.SundayDeskEspn.onmessage = event => handle(JSON.parse(event.data));
window.SundayDeskEspn.postMessage(JSON.stringify({ command: 'status', requestId }));
```

iOS:

```js
const response = await window.webkit.messageHandlers.SundayDeskEspn.postMessage({
  command: 'status', requestId
});
```

Successful status:

```json
{"requestId":"UUID","command":"status","success":true,"available":true,"version":1}
```

Successful connection (secret values are represented by placeholders here):

```json
{"requestId":"UUID","command":"connect","success":true,"s2":"SESSION","swid":"{ACCOUNT-UUID}"}
```

Successful cancel:

```json
{"requestId":"UUID","command":"cancel","success":true}
```

Failed/cancelled connection:

```json
{"requestId":"UUID","command":"connect","success":false,"error":{"code":"CANCELLED","message":"ESPN connection cancelled."}}
```

Fixed error codes are `UNTRUSTED_ORIGIN`, `BUSY`, `CANCELLED`, `TIMEOUT`,
`SESSION_MISSING`, `UNSUPPORTED`, and `FAILED`. Error messages never contain
provider page contents, cookies, passwords, or raw native exception messages.
An invalid iOS message can instead reject the transport promise with a fixed
error. Malformed Android messages with no valid request UUID are ignored.
Native code cancels a connection after ten minutes. The web client must also
cancel on unmount and discard late responses. A cancelled operation can never
later resolve successfully.

The web app must expose native sign-in only after a successful status handshake.
An ordinary mobile browser has no native bridge and must not be shown a working
native-login button. No app-store download URL should be invented or enabled
before its corresponding app is published.

## Session and browser boundaries

- The Sunday Desk browser retains the normal Sunday Desk login session, just
  like the website. Only its exact HTTPS origin can load inside the app browser.
  External links open in the operating system's browser, with no app bridge.
- Android installs an origin-scoped `WebViewCompat.addWebMessageListener`, checks
  `isMainFrame`, and replies through the originating `JavaScriptReplyProxy`.
  iOS checks `WKFrameInfo`/`WKSecurityOrigin` and replies to the originating
  JavaScript promise via `WKScriptMessageHandlerWithReply`.
- The provider browser has no app JavaScript bridge or injected scripts. Its
  top-level navigation is limited to HTTPS ESPN and Disney-owned sign-in domains:
  `espn.com`, `go.com`, `disney.com` and their subdomains. This allowlist must be
  checked against real sign-in flows; do not silently broaden it to arbitrary
  sites if a redirect changes. ESPN's own embedded HTTPS identity/challenge
  frames and blank child frames may load; browser origin rules still isolate
  them, and none receives a Sunday Desk native bridge.
- iOS uses a fresh non-persistent `WKWebsiteDataStore`. Android uses an unexported
  activity in a separate private process and a separate WebView data directory.
  Android's provider WebView may temporarily write its own browser data to that
  private directory; cookies, WebStorage, and cache are cleared before sign-in,
  on completion/cancellation, and on teardown. The app does not copy the provider
  session into preferences, files, URLs, clipboard, logs, or saved state.
- Android sends the result directly back to its calling activity as in-memory
  result extras. Both platforms check that the original app document is still
  active and still at Setup before returning cookies to JavaScript.
- Provider cookie reads happen only after a native Continue tap. Native code
  does not submit fantasy lineup or waiver changes. The server still verifies
  the session, membership and selected leagues; native validation is not a
  replacement for those checks.
- WebView debugging and native forwarding of JavaScript console output are
  disabled. Android provider windows also suppress screenshots/app-switcher
  screenshots. Do not add session bodies to analytics or crash metadata.

## Device acceptance checks before release

1. Install the debug app on a real Android phone and an iPhone; confirm Sunday
   Desk login, password reset, responsive layout, keyboard, back navigation, and
   safe-area spacing.
2. Connect an ESPN account through its actual sign-in and any two-factor prompt.
   Confirm the app returns to league selection and only checked leagues connect.
3. Cancel before login, after login, during navigation, and during slow network
   responses. Repeat after a timeout, rotation, backgrounding and process death.
   No previous operation should connect or deliver cookies afterward.
4. Start two connections. The second must return BUSY. Switch Sunday Desk users
   and ESPN users, and confirm data stays with the intended account.
5. Exercise sign-in redirects, privacy/consent dialogs and password-manager
   autofill. A provider block, changed redirect or rejected embedded-browser
   login is a release blocker, not proof the account has no leagues.
6. Verify frames, lookalike domains, different paths, and navigated documents
   cannot request or receive a session. Validate reconnect after ESPN expiration.
7. Complete ESPN discover/confirm and refresh from another device signed into
   the same Sunday Desk account. Verify the account does not require keeping
   this phone or native browser open to use the already connected leagues.

## References used

- [Android origin-scoped web bridge](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge)
- [Android JavaScriptReplyProxy](https://developer.android.com/reference/androidx/webkit/JavaScriptReplyProxy)
- [AndroidX WebKit 1.17.0](https://developer.android.com/jetpack/androidx/releases/webkit)
- [Android Gradle Plugin 8.13.2 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Apple WKScriptMessageHandlerWithReply](https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply)
- [Apple non-persistent website data store](https://developer.apple.com/documentation/webkit/wkwebsitedatastore/nonpersistent())
- [XcodeGen releases](https://github.com/yonaskolb/XcodeGen/releases)

Capacitor was evaluated; its `server.url` option is documented for live reload,
so this app uses native WebViews and an explicit narrow bridge instead.
FantasyPros' private implementation is not public. This implements the same
user-visible sign-in → choose leagues → sync account pattern, not a claim that
their proprietary code or access agreement has been duplicated.
