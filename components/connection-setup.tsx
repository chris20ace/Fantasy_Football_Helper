'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SignOut from './sign-out';
import EspnConnect from './espn-connect';
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
            <Button
              className="setup-dashboard"
              type="button"
              onClick={() => window.location.assign('/')}
            >
              Open dashboard <ArrowRight size={18} />
            </Button>
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
                    : 'Bring your ESPN teams.'}
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
                {provider === 'espn' ? (
                  <EspnConnect
                    disabled={!!busy}
                    onBusy={(value) => setBusy(value ? 'espn' : '')}
                    onConnected={(value) => {
                      setConnections(value);
                      setError('');
                      setSuccess(
                        'Your ESPN leagues are connected. Open your dashboard when you are ready.',
                      );
                    }}
                  />
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        values = new FormData(form);
                      void update(
                        { provider, username: values.get('username') },
                        provider,
                        form,
                      );
                    }}
                  >
                    <label htmlFor="username">
                      Sleeper username
                      <Input
                        id="username"
                        name="username"
                        required
                        autoComplete="off"
                        placeholder="Your username"
                        maxLength={40}
                        defaultValue={connection?.label}
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={!!busy}
                      className="connect-submit"
                    >
                      {busy === provider
                        ? 'Checking your leagues…'
                        : connection
                          ? 'Reconnect & refresh leagues'
                          : 'Connect Sleeper'}
                      <ArrowRight size={16} />
                    </Button>
                  </form>
                )}
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
