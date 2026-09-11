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
type Preview = { ticket: string; leagues: ConnectedLeague[] };
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
    [phase, setPhase] = useState(''),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const id = crypto.randomUUID();
    const receive = (event: MessageEvent) => {
      if (
        event.source === window &&
        event.origin === location.origin &&
        event.data?.type === 'SUNDAY_DESK_ESPN_PONG' &&
        event.data.requestId === id
      )
        setInstalled(true);
    };
    window.addEventListener('message', receive);
    // Repeat after document_idle in case the extension bridge is still loading.
    window.postMessage(
      { type: 'SUNDAY_DESK_ESPN_PING', requestId: id },
      location.origin,
    );
    const retry = window.setTimeout(
      () =>
        window.postMessage(
          { type: 'SUNDAY_DESK_ESPN_PING', requestId: id },
          location.origin,
        ),
      700,
    );
    const stop = window.setTimeout(
      () => window.removeEventListener('message', receive),
      2500,
    );
    return () => {
      clearTimeout(retry);
      clearTimeout(stop);
      window.removeEventListener('message', receive);
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
            'Install and enable the desktop connector, then reload this page. It works in desktop Chrome or Edge.',
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
      setSelected(result.leagues.map((l) => l.id));
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
              <strong>Import from your browser</strong>
              <span>{installed ? 'Connector ready' : 'Desktop'}</span>
            </div>
            <p>
              Sign in on ESPN, then bring your teams here. No league IDs or
              cookie copying.
            </p>
            <a
              className="espn-login-link"
              href="https://www.espn.com/login/"
              target="_blank"
              rel="noreferrer"
            >
              1. Sign in to ESPN <ExternalLink size={14} />
            </a>
            <Button
              type="button"
              disabled={disabled}
              className="connect-submit"
              onClick={() => void discover()}
            >
              {phase === 'discover'
                ? 'Finding your teams…'
                : '2. Import from ESPN'}
              <ArrowRight size={16} />
            </Button>
            <small>
              Import reads your ESPN session to find your teams. You will review
              your leagues before saving the connection.
            </small>
          </div>
          <details
            className="connection-help connector-install"
            open={installed ? undefined : true}
          >
            <summary>
              One-time desktop connector setup <ChevronDown size={15} />
            </summary>
            <p>
              Use Chrome or Edge on a computer. This developer preview is
              installed manually; a browser-store release will make installation
              simpler.
            </p>
            <a
              className="connector-download"
              href="/downloads/sunday-desk-espn-connector.zip"
              download
            >
              <Download size={16} />
              Download connector
            </a>
            <ol>
              <li>Extract the ZIP to a folder you will keep.</li>
              <li>
                Open <code>chrome://extensions</code> or{' '}
                <code>edge://extensions</code>. Turn on Developer mode, choose{' '}
                <strong>Load unpacked</strong>, and select the extracted folder
                containing <code>manifest.json</code>.
              </li>
              <li>
                Open Sunday Desk from the browser extensions menu and choose{' '}
                <strong>Enable ESPN access</strong>.
              </li>
              <li>
                Reload this setup page, sign in to ESPN in the same browser,
                then choose <strong>Import from ESPN</strong>.
              </li>
            </ol>
            <p className="connector-mobile">
              <Monitor size={16} /> On a phone? Complete the connection once on
              a computer. Your connected dashboard then works on your phone.
            </p>
          </details>
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
              <Button type="submit" disabled={disabled}>
                {phase === 'discover'
                  ? 'Finding your teams…'
                  : 'Find my leagues'}
                <ArrowRight size={16} />
              </Button>
            </form>
          </details>
          <p className="espn-private">
            <ShieldCheck size={15} /> Your ESPN password stays with ESPN.
          </p>
        </>
      )}
    </div>
  );
}
