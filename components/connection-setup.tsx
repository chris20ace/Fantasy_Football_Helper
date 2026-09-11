'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import SignOut from './sign-out';
import type { PublicConnection } from '@/lib/accounts/types';
export default function ConnectionSetup({
  name,
  initial,
  claim,
}: {
  name: string;
  initial: PublicConnection[];
  claim?: string;
}) {
  const [connections, setConnections] = useState(initial),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [confirm, setConfirm] = useState(''),
    [restore, setRestore] = useState(claim);
  async function update(
    body: Record<string, unknown>,
    key: string,
    form?: HTMLFormElement,
  ) {
    setBusy(key);
    setError('');
    setSuccess('');
    try {
      const r = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const v = (await r.json()) as {
        connections: PublicConnection[];
        error?: string;
      };
      if (!r.ok) throw new Error(v.error ?? 'Connection failed.');
      setConnections(v.connections);
      setConfirm('');
      form?.reset();
      setSuccess(
        body.action === 'disconnect'
          ? 'Account disconnected. Its saved credentials have been removed.'
          : 'Your leagues are ready. Open your dashboard when you are done.',
      );
      if (body.action === 'claim') {
        setRestore(undefined);
        window.history.replaceState({}, '', '/setup');
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Connection failed. Please try again.',
      );
    } finally {
      setBusy('');
    }
  }
  const count = connections.reduce((n, c) => n + c.leagues.length, 0);
  return (
    <div className="setup-page">
      <header className="setup-top">
        <Link prefetch={false} className="auth-brand" href="/">
          <Zap />
          Sunday<span>Desk</span>
        </Link>
        <div>
          <span>{name}</span>
          <SignOut />
        </div>
      </header>
      <main className="setup-content">
        <div className="setup-heading">
          <div>
            <div className="eyebrow">MAKE IT YOUR WORKSPACE</div>
            <h1>Bring your leagues together.</h1>
            <p className="muted">
              Connect one or both platforms. Your rosters, lineup advice, and
              notes stay with your account.
            </p>
          </div>
          {count > 0 && (
            <Link prefetch={false} className="setup-dashboard" href="/">
              Open dashboard <ArrowRight size={18} />
            </Link>
          )}
        </div>
        <div className="setup-progress">
          <span className="complete">
            <Check size={16} /> Account created
          </span>
          <span>
            <Link2 size={16} />{' '}
            {count ? count + ' leagues connected' : 'Connect your leagues'}
          </span>
          <span>
            Weekly game plan <ArrowRight size={15} />
          </span>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {success && <output className="form-success">{success}</output>}
        {restore && (
          <section className="restore-panel">
            <div>
              <h2>Your saved workspace is ready.</h2>
              <p>
                Restore your existing league connections to this account. This
                private link can be used once.
              </p>
            </div>
            <Button
              disabled={!!busy}
              onClick={() =>
                update({ action: 'claim', token: restore }, 'claim')
              }
            >
              {busy === 'claim' ? 'Restoring…' : 'Restore my leagues'}
            </Button>
          </section>
        )}
        <div className="setup-grid">
          {(['sleeper', 'espn'] as const).map((provider) => {
            const connection = connections.find((c) => c.provider === provider);
            return (
              <section className="setup-card" key={provider}>
                <div className="setup-card-heading">
                  <span className={'platform ' + provider}>
                    {provider.toUpperCase()}
                  </span>
                  <span className={connection ? 'connection-ready' : 'muted'}>
                    {connection ? (
                      <>
                        <Check size={15} /> Connected
                      </>
                    ) : (
                      'Not connected'
                    )}
                  </span>
                </div>
                <h2>
                  {provider === 'sleeper'
                    ? 'Link by username.'
                    : 'Connect private leagues.'}
                </h2>
                <p className="muted">
                  {provider === 'sleeper'
                    ? 'Sleeper provides read-only league data by username. No Sleeper password needed.'
                    : 'Use your ESPN session to read leagues you belong to. Your ESPN password is never needed.'}
                </p>
                {connection && (
                  <div className="connected-leagues">
                    <strong>
                      {connection.label} · {connection.leagues.length} leagues
                    </strong>
                    <ul>
                      {connection.leagues.map((l) => (
                        <li key={l.id}>
                          <Check size={13} />
                          {l.name}
                          <span>{l.season}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      values = new FormData(form);
                    void update(
                      provider === 'sleeper'
                        ? { provider, username: values.get('username') }
                        : {
                            provider,
                            s2: values.get('s2'),
                            swid: values.get('swid'),
                            leagueIds: (values.get('leagueIds') as string)
                              .split(/[\s,]+/)
                              .filter(Boolean),
                          },
                      provider,
                      form,
                    );
                  }}
                >
                  {provider === 'sleeper' ? (
                    <label htmlFor="username">
                      Sleeper username
                      <Input
                        id="username"
                        name="username"
                        required
                        autoComplete="off"
                        placeholder="Your username"
                        maxLength={40}
                        defaultValue={
                          provider === 'sleeper' ? connection?.label : undefined
                        }
                      />
                    </label>
                  ) : (
                    <>
                      <details className="connection-help">
                        <summary>
                          Where do I find these values?{' '}
                          <ChevronDown size={15} />
                        </summary>
                        <ol>
                          <li>
                            Sign in to{' '}
                            <a
                              href="https://fantasy.espn.com/football/"
                              target="_blank"
                              rel="noreferrer"
                            >
                              ESPN Fantasy
                            </a>{' '}
                            in Chrome or Edge on a computer.
                          </li>
                          <li>
                            Open Developer Tools (F12 or right-click → Inspect),
                            then Application → Cookies → the ESPN site.
                          </li>
                          <li>
                            Copy the values named <strong>espn_s2</strong> and{' '}
                            <strong>SWID</strong> into the private fields below.
                          </li>
                          <li>
                            Find each league ID in League Settings or the league
                            page address after leagueId=.
                          </li>
                        </ol>
                        <p>
                          These cookies grant account access. Only paste them
                          into your private connection form. They can expire;
                          reconnect here when needed. A computer is easiest for
                          this step.
                        </p>
                      </details>
                      <label htmlFor="leagueIds">
                        League IDs
                        <Input
                          id="leagueIds"
                          name="leagueIds"
                          required
                          placeholder="123456, 789012"
                          maxLength={440}
                          defaultValue={connection?.leagues
                            .map((l) => l.id)
                            .join(', ')}
                        />
                      </label>
                      <label htmlFor="s2">
                        espn_s2 session value
                        <Textarea
                          id="s2"
                          name="s2"
                          required
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={6000}
                          rows={3}
                          className="secret-field"
                          placeholder="Paste the full cookie value"
                        />
                      </label>
                      <label htmlFor="swid">
                        SWID
                        <Input
                          id="swid"
                          name="swid"
                          required
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={38}
                          placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                        />
                      </label>
                    </>
                  )}
                  <Button
                    type="submit"
                    disabled={!!busy}
                    className="connect-submit"
                  >
                    {busy === provider
                      ? 'Checking your leagues…'
                      : connection
                        ? 'Reconnect & refresh leagues'
                        : 'Connect ' +
                          (provider === 'sleeper' ? 'Sleeper' : 'ESPN')}
                    <ArrowRight size={16} />
                  </Button>
                </form>
                {connection && (
                  <div className="disconnect-row">
                    {confirm === provider ? (
                      <>
                        <span>Disconnect this account?</span>
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            update({ action: 'disconnect', provider }, provider)
                          }
                        >
                          Disconnect
                        </button>
                        <button onClick={() => setConfirm('')}>
                          Keep connected
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={!!busy}
                        onClick={() => setConfirm(provider)}
                      >
                        Disconnect account
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div className="setup-assurance">
          <ShieldCheck />
          <p>
            <strong>Connected for insight.</strong> Sunday Desk reads your
            leagues. Set lineups, make trades, and submit waivers directly in
            ESPN or Sleeper.
          </p>
          <LockKeyhole />
          <p>
            <strong>Private to your account.</strong> ESPN session values are
            encrypted on the server and never returned to your browser.
          </p>
        </div>
      </main>
    </div>
  );
}
