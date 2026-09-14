'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Monitor,
  ShieldCheck,
  Smartphone,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ConnectedLeague, PublicConnection } from '@/lib/accounts/types';
import {
  connectorRelease,
  connectorStoreUrl,
  type ConnectorRelease,
} from '@/lib/accounts/connector-release';
import { watchConnector } from '@/lib/accounts/connector-detection';
import {
  beginEspnFlow,
  clearEspnFlow,
  consumeEspnReturn,
  type ConnectorInfo,
} from '@/lib/accounts/espn-browser-flow';
import {
  createNativeEspnClient,
  requestEspnExtension,
  EspnConnectError,
  type EspnSession,
} from '@/lib/accounts/espn-session-client';

type Preview = {
  ticket: string;
  leagues: ConnectedLeague[];
  selectedLeagueIds?: string[];
};
type Session = EspnSession;
export default function EspnConnect({
  accountId,
  disabled,
  onBusy,
  onConnected,
}: {
  accountId: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onConnected: (connections: PublicConnection[]) => void;
}) {
  const [installed, setInstalled] = useState<ConnectorInfo | null>(null),
    [checking, setChecking] = useState(false),
    [release, setRelease] = useState<ConnectorRelease>(connectorRelease),
    [phase, setPhase] = useState(''),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false),
    [nativeReady, setNativeReady] = useState(false),
    [phone, setPhone] = useState(false),
    [unsupported, setUnsupported] = useState(false),
    [copied, setCopied] = useState(false),
    [needsLogin, setNeedsLogin] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const probe = useRef<(() => void) | null>(null);
  const native = useRef<ReturnType<typeof createNativeEspnClient>>(null);
  const resumed = useRef(false);
  const discoverRef = useRef(discover);
  discoverRef.current = discover;
  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile =
      /Android|iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setPhone(mobile);
    setUnsupported(!mobile && !/Chrome|Chromium|Edg\//i.test(ua));
    const client = createNativeEspnClient(window);
    native.current = client;
    let disposed = false;
    void client?.available().then((ready) => {
      if (!disposed) setNativeReady(ready);
    });
    const detection = watchConnector(window, setInstalled, setChecking);
    probe.current = detection.probe;
    return () => {
      disposed = true;
      detection.dispose();
      probe.current = null;
      abort.current?.abort();
      client?.dispose();
      native.current = null;
    };
  }, []);
  useEffect(() => {
    let controller: AbortController | null = null,
      disposed = false;
    async function checkStore() {
      if (document.visibilityState === 'hidden' || controller) return;
      controller = new AbortController();
      try {
        const response = await fetch('/api/connector', {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const value = (await response.json()) as ConnectorRelease;
        if (
          !disposed &&
          value.status === 'published' &&
          value.storeUrl === connectorStoreUrl
        )
          setRelease(value);
      } catch {
      } finally {
        controller = null;
      }
    }
    void checkStore();
    const refresh = () => void checkStore();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    if (
      !installed?.guidedLogin ||
      disabled ||
      resumed.current ||
      !location.hash.startsWith('#espn-connect=')
    )
      return;
    const timer = window.setTimeout(() => {
      resumed.current = true;
      let flowId: string | null = null;
      try {
        flowId = consumeEspnReturn(sessionStorage, location.hash, accountId);
      } catch {}
      window.history.replaceState({}, '', location.pathname + location.search);
      if (!flowId) {
        setError(
          'That ESPN sign-in expired or belongs to another Sunday Desk account. Start again to connect.',
        );
        return;
      }
      void discoverRef.current(undefined, undefined, flowId);
    }, 0);
    return () => clearTimeout(timer);
  }, [installed?.guidedLogin, disabled, accountId]);
  async function send(body: Record<string, unknown>) {
    const response = await fetch('/api/connections/espn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.current?.signal,
    });
    if (response.status === 401) {
      window.location.replace('/login?next=/setup');
      throw new Error('Sign in again to connect ESPN.');
    }
    const value = (await response.json()) as Preview & {
      error?: string;
      connections: PublicConnection[];
    };
    if (!response.ok)
      throw new Error(
        value.error ?? 'Could not import ESPN. Please try again.',
      );
    return value;
  }
  function reportError(e: unknown) {
    if (
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof EspnConnectError && e.code === 'CANCELLED')
    )
      return;
    if (e instanceof EspnConnectError && e.code === 'LOGIN_REQUIRED')
      setNeedsLogin(true);
    setError(
      e instanceof Error
        ? e.message
        : 'Could not connect ESPN. Please try again.',
    );
  }
  async function startLogin() {
    if (disabled || phase) return;
    setPhase('login');
    onBusy(true);
    setError('');
    setNeedsLogin(false);
    abort.current = new AbortController();
    try {
      const flowId = beginEspnFlow(sessionStorage, accountId);
      await requestEspnExtension(
        window,
        'SUNDAY_DESK_ESPN_BEGIN_LOGIN',
        flowId,
        abort.current.signal,
      );
    } catch (e) {
      try {
        clearEspnFlow(sessionStorage);
      } catch {}
      reportError(e);
    } finally {
      setPhase('');
      onBusy(false);
    }
  }
  async function discover(
    manual?: Session & { leagueIds: string[] },
    form?: HTMLFormElement,
    flowId?: string,
  ) {
    if (disabled || phase) return;
    setPhase(nativeReady && !manual && !flowId ? 'login' : 'discover');
    onBusy(true);
    setError('');
    setPreview(null);
    setConsent(false);
    setNeedsLogin(false);
    abort.current = new AbortController();
    try {
      const session =
        manual ??
        (nativeReady && native.current && !flowId
          ? await native.current.connect(abort.current.signal)
          : (
              await requestEspnExtension(
                window,
                flowId
                  ? 'SUNDAY_DESK_ESPN_RESUME_LOGIN'
                  : 'SUNDAY_DESK_ESPN_SESSION',
                flowId,
                abort.current.signal,
              )
            ).credentials);
      if (!session) throw new Error('Sign in to ESPN to find your leagues.');
      setPhase('discover');
      const result = await send({ action: 'discover', ...session });
      form?.reset();
      setPreview(result);
      setSelected(result.selectedLeagueIds ?? result.leagues.map((l) => l.id));
    } catch (e) {
      reportError(e);
    } finally {
      setPhase('');
      onBusy(false);
    }
  }
  async function confirm() {
    if (!preview || !consent || !selected.length || disabled || phase) return;
    setPhase('confirm');
    onBusy(true);
    setError('');
    abort.current = new AbortController();
    try {
      const result = await send({
        action: 'confirm',
        ticket: preview.ticket,
        leagueIds: selected,
      });
      setPreview(null);
      setSelected([]);
      setConsent(false);
      onConnected(result.connections);
    } catch (e) {
      reportError(e);
    } finally {
      setPhase('');
      onBusy(false);
    }
  }
  const browserBlocked = !installed && !nativeReady && (phone || unsupported);
  return (
    <div className="espn-connect">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview ? (
        <section className="espn-review" aria-label="Review your ESPN leagues">
          <ol className="espn-flow-steps" aria-label="ESPN connection steps">
            <li className="is-complete">
              <Check size={16} />
              <span>Signed in</span>
            </li>
            <li className="is-current">
              <b>2</b>
              <span>Choose leagues</span>
            </li>
            <li>
              <b>3</b>
              <span>Connect</span>
            </li>
          </ol>
          <span className="connection-ready">
            <Check size={16} /> {preview.leagues.length} leagues found
          </span>
          <h3>Choose your leagues.</h3>
          <p className="muted">
            Select the leagues you want on your dashboard. Leave inactive
            leagues unchecked. You can change your choices later.
          </p>
          <div className="league-choices">
            {preview.leagues.map((league) => (
              <label key={league.id} aria-label={league.name}>
                <input
                  type="checkbox"
                  checked={selected.includes(league.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, league.id]
                        : ids.filter((id) => id !== league.id),
                    )
                  }
                />
                <span>
                  <strong>{league.name}</strong>
                  <small>
                    {league.teamName || 'Your ESPN team'} · {league.season}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <label className="espn-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={disabled}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Save my ESPN session encrypted so Sunday Desk can refresh these
              leagues. I can disconnect it in setup.
            </span>
          </label>
          <Button
            type="button"
            disabled={disabled || !consent || !selected.length}
            className="connect-submit"
            onClick={() => void confirm()}
          >
            {phase === 'confirm'
              ? 'Connecting…'
              : 'Connect ' +
                selected.length +
                (selected.length === 1 ? ' league' : ' leagues')}
            <ArrowRight size={16} />
          </Button>
          <button
            type="button"
            className="espn-cancel"
            disabled={disabled}
            onClick={() => {
              setPreview(null);
              setSelected([]);
              setConsent(false);
              setError('');
            }}
          >
            Cancel import
          </button>
        </section>
      ) : (
        <>
          <ol className="espn-flow-steps" aria-label="ESPN connection steps">
            <li className="is-current">
              <b>1</b>
              <span>Sign in</span>
            </li>
            <li>
              <b>2</b>
              <span>Choose leagues</span>
            </li>
            <li>
              <b>3</b>
              <span>Connect</span>
            </li>
          </ol>
          <div className="espn-shortcut">
            <div className="espn-shortcut-title">
              {nativeReady || phone ? (
                <Smartphone size={20} />
              ) : (
                <Monitor size={20} />
              )}
              <strong>
                {browserBlocked
                  ? 'Connect once. Use it everywhere.'
                  : 'Connect your ESPN account'}
              </strong>
              {(installed || nativeReady) && <span>Ready</span>}
            </div>
            {browserBlocked ? (
              <>
                <p>
                  {phone
                    ? 'Connect ESPN from Chrome or Edge on a computer, then sign in to this same Sunday Desk account on your phone.'
                    : 'Use Chrome, Edge, Brave, Opera, or Vivaldi on a computer to install the ESPN connector.'}
                </p>
                <p className="espn-connection-note">
                  Your selected leagues stay connected to your Sunday Desk
                  account. You do not need the extension on every device.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="connect-submit"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        'https://fantasy-football-helper-orcin.vercel.app/setup',
                      );
                      setCopied(true);
                    } catch {
                      setError(
                        'Open fantasy-football-helper-orcin.vercel.app/setup on your computer.',
                      );
                    }
                  }}
                >
                  <Copy size={16} />
                  {copied ? 'Setup link copied' : 'Copy setup link'}
                </Button>
                <span className="sr-only" role="status">
                  {copied ? 'Setup link copied.' : ''}
                </span>
              </>
            ) : installed || nativeReady ? (
              <>
                <p>
                  {nativeReady
                    ? 'Sign in directly with ESPN here in the app. Then choose which leagues to bring into Sunday Desk.'
                    : installed?.guidedLogin
                      ? 'Continue to ESPN in this tab. After signing in, choose Continue to Sunday Desk to select your leagues.'
                      : 'Sign in to ESPN in this browser, then find your teams below. You choose which leagues to connect.'}
                </p>
                <Button
                  type="button"
                  disabled={disabled || !!phase}
                  className="connect-submit"
                  onClick={() =>
                    void (installed?.guidedLogin && !nativeReady
                      ? startLogin()
                      : discover())
                  }
                >
                  {phase === 'login'
                    ? 'Opening ESPN sign-in…'
                    : phase === 'discover'
                      ? 'Finding your teams…'
                      : nativeReady || installed?.guidedLogin
                        ? 'Connect ESPN'
                        : 'Find my ESPN teams'}
                  <ArrowRight size={16} />
                </Button>
                <small>
                  Continuing lets Sunday Desk read your ESPN session to find
                  your leagues. We save the connection only after you select
                  leagues and confirm.
                </small>
                {!nativeReady && !installed?.guidedLogin && (
                  <a
                    className="espn-signin-secondary"
                    href="https://www.espn.com/login/"
                    rel="noreferrer"
                  >
                    {needsLogin
                      ? 'Sign in to ESPN, then return here'
                      : 'Sign in to ESPN or switch accounts'}
                    <ExternalLink size={14} />
                  </a>
                )}
              </>
            ) : (
              <>
                <p>
                  Install the connector once to sign in with ESPN and find your
                  teams. No league IDs or cookie copying.
                </p>
                {release.status === 'published' && release.storeUrl ? (
                  <a
                    className="connector-store-button"
                    href={release.storeUrl}
                    rel="noreferrer"
                  >
                    Install ESPN Connector
                    <ExternalLink size={16} />
                  </a>
                ) : (
                  <div className="connector-store-pending">
                    <strong>Checking the browser-store listing</strong>
                    <span>
                      The install button appears when the published connector is
                      available. You can also use the developer package below.
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="espn-signin-secondary"
                  disabled={checking || disabled}
                  onClick={() => probe.current?.()}
                >
                  {checking
                    ? 'Checking for your connector…'
                    : 'Already installed? Check again'}
                </button>
              </>
            )}
          </div>
          {!browserBlocked && !nativeReady && !installed && (
            <details className="connection-help connector-install">
              <summary>
                Alternative: install manually
                <ChevronDown size={15} />
              </summary>
              <p>
                For desktop Chrome or Edge. The browser-store install above is
                the easiest option.
              </p>
              <a
                className="connector-download"
                href="/downloads/sunday-desk-espn-connector.zip"
                download
              >
                <Download size={16} />
                Download developer package
              </a>
              <ol>
                <li>Extract the ZIP to a folder you will keep.</li>
                <li>
                  Open <code>chrome://extensions</code> or{' '}
                  <code>edge://extensions</code>, enable Developer mode, and
                  choose <strong>Load unpacked</strong>. Select the extracted
                  folder.
                </li>
                <li>
                  Return here and reload, then choose{' '}
                  <strong>Connect ESPN</strong>.
                </li>
              </ol>
            </details>
          )}
          <details className="connection-help espn-manual">
            <summary>
              Advanced: connect manually <ChevronDown size={15} />
            </summary>
            <p>
              In desktop Chrome or Edge, sign in to ESPN, then open Developer
              Tools → Application → Cookies. Copy <strong>espn_s2</strong> and{' '}
              <strong>SWID</strong> into these private fields.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  values = new FormData(form);
                void discover(
                  {
                    s2: values.get('s2') as string,
                    swid: values.get('swid') as string,
                    leagueIds: (values.get('leagueIds') as string)
                      .split(/[\s,]+/)
                      .filter(Boolean),
                  },
                  form,
                );
              }}
            >
              <label htmlFor="s2">
                espn_s2
                <Input
                  id="s2"
                  name="s2"
                  type="password"
                  required
                  autoComplete="off"
                  maxLength={6000}
                />
              </label>
              <label htmlFor="swid">
                SWID
                <Input
                  id="swid"
                  name="swid"
                  required
                  autoComplete="off"
                  maxLength={38}
                  placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                />
              </label>
              <label htmlFor="leagueIds">
                League IDs <span className="muted">(optional)</span>
                <Textarea
                  id="leagueIds"
                  name="leagueIds"
                  maxLength={440}
                  rows={2}
                  placeholder="Leave blank to discover your teams"
                />
              </label>
              <p className="muted">
                Finding leagues sends these ESPN session values to Sunday Desk.
                Choose your leagues and confirm before we save the session
                encrypted for future refreshes.
              </p>
              <Button type="submit" disabled={disabled}>
                {phase === 'discover'
                  ? 'Finding your teams…'
                  : 'Find my leagues'}
                <ArrowRight size={16} />
              </Button>
            </form>
          </details>
          <p className="espn-private">
            <ShieldCheck size={15} /> Your ESPN password stays with ESPN.{' '}
            <a href="/privacy" rel="noreferrer">
              Privacy policy
            </a>
          </p>
        </>
      )}
    </div>
  );
}
