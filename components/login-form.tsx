'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordForm } from './password-management';
export default function LoginForm({ emailReady }: { emailReady: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin'),
    [email, setEmail] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const signup = mode === 'signup',
    forgot = mode === 'forgot';
  const heading = useRef<HTMLHeadingElement>(null),
    previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current !== mode) heading.current?.focus();
    previousMode.current = mode;
  }, [mode]);
  function switchMode(next: typeof mode) {
    setMode(next);
    setError('');
    setMessage('');
    setShow(false);
  }
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch(
        '/api/auth/' + (signup ? 'sign-up/email' : 'sign-in/email'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: ((form.get('name') as string) ?? '').trim(),
            email: (form.get('email') as string).trim(),
            password: form.get('password') as string,
          }),
        },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          response.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : signup
              ? (result.message ?? 'Could not create your account. Try again.')
              : 'Email or password is incorrect.',
        );
      }
      if (signup) {
        setMode('signin');
        setMessage('Account created. Sign in to open your workspace.');
      } else {
        const next =
          new URLSearchParams(window.location.search).get('next') ?? '/';
        const target = new URL(next, window.location.origin);
        window.location.assign(
          target.origin === window.location.origin
            ? target.pathname + target.search
            : '/',
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Sign-in is temporarily unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <Link prefetch={false} className="auth-brand" href="/login">
          <Zap />
          Sunday<span>Desk</span>
        </Link>
        <div>
          <span className="auth-kicker">YOUR FANTASY WORKSPACE</span>
          <h1>
            Every league.
            <br />
            Your game plan.
          </h1>
          <p>
            Bring your rosters together. Find your strongest lineup. Head into
            the week ready.
          </p>
          <div className="auth-platforms">
            <span>SLEEPER</span>
            <span>ESPN FANTASY</span>
          </div>
        </div>
        <p className="auth-privacy">
          <ShieldCheck size={18} /> Your league connections stay in your
          workspace.
        </p>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <div className="eyebrow">SUNDAY DESK</div>
          <h2 ref={heading} tabIndex={-1}>
            {forgot
              ? 'Forgot your password?'
              : signup
                ? 'Build your weekly advantage.'
                : 'Welcome back.'}
          </h2>
          <p className="muted">
            {forgot
              ? emailReady
                ? 'Enter your Sunday Desk email to get a reset link.'
                : 'Password-reset emails are not available yet.'
              : signup
                ? 'Create your account, then connect your fantasy leagues.'
                : 'Sign in to your leagues, lineups, and weekly notes.'}
          </p>
          {forgot ? (
            <div className="auth-recovery">
              <PasswordForm
                mode="forgot"
                emailReady={emailReady}
                initialEmail={email}
                onBackToSignIn={() => switchMode('signin')}
              />
              {emailReady && (
                <p className="password-hint">
                  Use the recovery email you verified in Account settings.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              {signup && (
                <label htmlFor="name">
                  Your name
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                    placeholder="How should we call you?"
                  />
                </label>
              )}
              <label htmlFor="email">
                Email address
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label htmlFor="password">
                Password
                <div className="password-field">
                  <Input
                    id="password"
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    required
                    minLength={signup ? 12 : 1}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {signup && <small>Use at least 12 characters.</small>}
              </label>
              {!signup && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  disabled={busy}
                  className="forgot-password-link"
                >
                  Forgot password?
                </button>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {message && <output className="form-success">{message}</output>}
              <Button type="submit" disabled={busy} className="auth-submit">
                {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
                <ArrowRight size={18} />
              </Button>
            </form>
          )}
          <p className="auth-switch">
            {forgot
              ? ''
              : signup
                ? 'Already have an account? '
                : 'New to Sunday Desk? '}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                switchMode(mode === 'signin' ? 'signup' : 'signin')
              }
            >
              {forgot
                ? 'Back to sign in'
                : signup
                  ? 'Sign in'
                  : 'Create an account'}
            </button>
          </p>
          <div className="auth-footnote">
            <ShieldCheck size={16} /> Your account password is separate from
            ESPN and Sleeper.
          </div>
        </div>
      </section>
    </main>
  );
}
