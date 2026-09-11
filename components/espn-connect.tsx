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
type Preview = {
  ticket: string;
  leagues: ConnectedLeague[];
  selectedLeagueIds?: string[];
};
type Session = { s2: string; swid: string };
export default function EspnConnect({
  disabled,
  onBusy,
  onConnected,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onConnected: (connections: PublicConnection[]) => void;
}) {
  const [installed, setInstalled] = useState(false),
    [checking, setChecking] = useState(false),
    [release, setRelease] = useState<ConnectorRelease>(connectorRelease),
    [phase, setPhase] = useState(''),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const probe = useRef<(() => void) | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
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
        else if (
          !disposed &&
          value.status === 'in-review' &&
          value.storeUrl === null
        )
          setRelease(connectorRelease);
      } catch {
        // Keep the known review state when the store check is unavailable.
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
    const detection = watchConnector(
      window,
      () => setInstalled(true),
      setChecking,
    );
    probe.current = detection.probe;
    return () => {
      detection.dispose();
      probe.current = null;
      pending.current?.();
      abort.current?.abort();
    };
  }, []);
  function browserSession(): Promise<Session> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const cleanup = () => {
        window.removeEventListener('message', receive);
        clearTimeout(timer);
        pending.current = null;
      };
      const receive = (event: MessageEvent) => {
        if (
          event.source !== window ||
          event.origin !== location.origin ||
          event.data?.type !== 'SUNDAY_DESK_ESPN_RESULT' ||
          event.data.requestId !== id
        )
          return;
        cleanup();
        if (event.data.error) reject(new Error(String(event.data.error)));
        else if (
          typeof event.data.credentials?.s2 === 'string' &&
          typeof event.data.credentials?.swid === 'string'
        )
          resolve(event.data.credentials);
        else
          reject(
            new Error(
              'ESPN did not return a session. Sign in to ESPN and try again.',
            ),
          );
      };
      pending.current = () => {
        cleanup();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      window.addEventListener('message', receive);
      const timer = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            'Install the connector in desktop Chrome or Edge. It will open a fresh setup page automatically.',
          ),
        );
      }, 6000);
      window.postMessage(
        { type: 'SUNDAY_DESK_ESPN_SESSION', requestId: id },
        location.origin,
      );
    });
  }
  async function send(body: Record<string, unknown>) {
    abort.current = new AbortController();
    const response = await fetch('/api/connections/espn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.current.signal,
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
  async function discover(
    manual?: Session & { leagueIds: string[] },
    form?: HTMLFormElement,
  ) {
    setPhase('discover');
    onBusy(true);
    setError('');
    setPreview(null);
    setConsent(false);
    try {
      const session = manual ?? (await browserSession());
      const result = (await send({
        action: 'discover',
        ...session,
      })) as Preview;
      form?.reset();
      setPreview(result);
      setSelected(result.selectedLeagueIds ?? result.leagues.map((l) => l.id));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setError(e instanceof Error ? e.message : 'Import failed. Try again.');
    } finally {
      setPhase('');
      onBusy(false);
    }
  }
  async function confirm() {
    if (!preview || !consent || !selected.length) return;
    setPhase('confirm');
    onBusy(true);
    setError('');
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
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setError(
          e instanceof Error ? e.message : 'Connection failed. Try again.',
        );
    } finally {
      setPhase('');
      onBusy(false);
    }
  }
  return (
    <div className="espn-connect">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview ? (
        <section className="espn-review" aria-label="Review your ESPN leagues">
          <span className="connection-ready">
            <Check size={16} /> {preview.leagues.length} leagues found
          </span>
          <h3>Choose your leagues.</h3>
          <p className="muted">
            These teams belong to the ESPN account you signed in with. This
            preview expires in 10 minutes.
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
          <div className="espn-shortcut">
            <div className="espn-shortcut-title">
              <Monitor size={19} />
              <strong>
                {installed
                  ? 'Your connector is ready'
                  : 'Connect ESPN in a few clicks'}
              </strong>
              <span>{installed ? 'Ready' : 'Desktop'}</span>
            </div>
            {installed ? (
              <>
                <p>
                  Already signed in to ESPN in this browser? Your teams are one
                  click away.
                </p>
                <Button
                  type="button"
                  disabled={disabled}
                  className="connect-submit"
                  onClick={() => void discover()}
                >
                  {phase === 'discover'
                    ? 'Finding your teams…'
                    : 'Find my ESPN teams'}
                  <ArrowRight size={16} />
                </Button>
                <small>
                  Import sends your ESPN session cookies to Sunday Desk to find
                  your leagues. You will choose leagues and confirm before we
                  save the session encrypted for future refreshes.
                </small>
                <a
                  className="espn-signin-secondary"
                  href="https://www.espn.com/login/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Need to sign in to ESPN? <ExternalLink size={13} />
                </a>
              </>
            ) : (
              <>
                <p>
                  Install once. Sunday Desk opens automatically, ready to find
                  your teams. No cookie copying or league IDs.
                </p>
                {release.status === 'published' && release.storeUrl ? (
                  <a
                    className="connector-store-button"
                    href={release.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Install ESPN Connector <ExternalLink size={16} />
                  </a>
                ) : (
                  <div className="connector-store-pending">
                    <strong>
                      {release.status === 'in-review'
                        ? 'Browser-store approval pending'
                        : 'Browser-store installation is being prepared'}
                    </strong>
                    <span>
                      We check automatically. The install button appears after
                      Google publishes the listing. Manual setup is available
                      below in the meantime.
                    </span>
                  </div>
                )}
                <div className="connector-steps">
                  <span>
                    <b>1</b> Install connector
                  </span>
                  <span>
                    <b>2</b> Find your teams
                  </span>
                  <span>
                    <b>3</b> Choose & connect
                  </span>
                </div>
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
          <p className="connector-mobile">
            <Monitor size={16} /> Connect once in Chrome or Edge on a computer.
            Your dashboard then works on your phone.
          </p>
          {!installed && (
            <details className="connection-help connector-install">
              <summary>
                {release.status === 'published'
                  ? 'Alternative: install manually'
                  : 'Manual installation while the store listing is pending'}{' '}
                <ChevronDown size={15} />
              </summary>
              <p>
                This alternative uses Chrome or Edge Developer mode.
                {release.status === 'published'
                  ? ' The store install button above is the easiest option.'
                  : ' Normal browser-store installation will become available after approval.'}
              </p>
              <a
                className="connector-download"
                href="/downloads/sunday-desk-espn-connector.zip"
                download
              >
                <Download size={16} /> Download developer package
              </a>
              <ol>
                <li>Extract the ZIP to a folder you will keep.</li>
                <li>
                  Open <code>chrome://extensions</code> or{' '}
                  <code>edge://extensions</code>, turn on Developer mode, and
                  choose <strong>Load unpacked</strong>. Select the extracted
                  folder containing <code>manifest.json</code>.
                </li>
                <li>
                  Sunday Desk opens automatically. Sign in if needed, then
                  choose <strong>Find my ESPN teams</strong>.
                </li>
              </ol>
              <p>
                Already installed an older connector? Replace its files with
                this version and reload it in your browser extension settings.
              </p>
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
            <a href="/privacy" target="_blank" rel="noreferrer">
              Privacy policy
            </a>
          </p>
        </>
      )}
    </div>
  );
}
