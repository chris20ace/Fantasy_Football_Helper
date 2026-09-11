'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PasswordField from './password-field';

type Mode = 'forgot' | 'reset' | 'change' | 'verify';
export function PasswordForm({
  mode,
  emailReady = true,
  initialEmail = '',
  onBackToSignIn,
}: {
  mode: Mode;
  emailReady?: boolean;
  initialEmail?: string;
  onBackToSignIn?: () => void;
}) {
  const capturedLink = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [token, setToken] = useState<string | null>(null),
    [tokenChecked, setTokenChecked] = useState(false);
  useEffect(() => {
    if (mode !== 'reset' && mode !== 'verify') return;
    if (capturedLink.current) return;
    capturedLink.current = true;
    const address = new URL(window.location.href);
    const value =
      new URLSearchParams(address.hash.slice(1)).get('token') ??
      address.searchParams.get('token');
    setToken(value && /^[A-Za-z0-9_.-]{20,4096}$/.test(value) ? value : null);
    setTokenChecked(true);
    window.history.replaceState(window.history.state, '', address.pathname);
  }, [mode]);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    setError('');
    const next = String(values.get('newPassword') ?? '');
    if (
      (mode === 'change' || mode === 'reset') &&
      next !== values.get('confirmPassword')
    ) {
      setError('The new passwords do not match.');
      return;
    }
    if (mode === 'change' && next === values.get('currentPassword')) {
      setError('Choose a different password from your current one.');
      return;
    }
    setBusy(true);
    try {
      const response =
        mode === 'verify'
          ? await fetch(
              `/api/auth/verify-email?${new URLSearchParams({ token: token ?? '' })}`,
              { cache: 'no-store', referrerPolicy: 'no-referrer' },
            )
          : await fetch(
              `/api/auth/${mode === 'forgot' ? 'request-password-reset' : mode === 'reset' ? 'reset-password' : 'change-password'}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                  mode === 'forgot'
                    ? {
                        email: String(values.get('email') ?? '').trim(),
                        redirectTo: window.location.origin + '/reset-password',
                      }
                    : mode === 'reset'
                      ? { token, newPassword: next }
                      : {
                          currentPassword: values.get('currentPassword'),
                          newPassword: next,
                          revokeOtherSessions: true,
                        },
                ),
              },
            );
      if (!response.ok) {
        if (response.status === 429)
          throw new Error('Too many attempts. Wait a minute and try again.');
        if (response.status === 401 && mode === 'change') {
          window.location.assign('/login?next=/account');
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        throw new Error(
          mode === 'reset' || mode === 'verify'
            ? 'This link has expired or has already been used. Request a new email and try again.'
            : mode === 'change' && data.code === 'INVALID_PASSWORD'
              ? 'Your current password is incorrect.'
              : mode === 'change'
                ? 'We could not change your password. Check your current password and try again.'
                : 'Password reset is temporarily unavailable. Please try again later.',
        );
      }
      form.reset();
      setToken(null);
      setSuccess(
        mode === 'forgot'
          ? 'If this email belongs to an account with password recovery enabled, check your inbox for a reset link. The link expires in 30 minutes.'
          : mode === 'reset'
            ? 'Your password has been reset. Sign in with your new password.'
            : mode === 'verify'
              ? 'Recovery email confirmed. You can now use Forgot password if you need it.'
              : 'Your password has been changed. Your other devices have been signed out.',
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Connection interrupted. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (success)
    return (
      <div className="password-result">
        <CheckCircle2 size={30} />
        <output className="form-success">{success}</output>
        {mode === 'forgot' && onBackToSignIn ? (
          <button
            type="button"
            className="password-primary-link"
            onClick={onBackToSignIn}
          >
            Back to sign in
          </button>
        ) : (
          <Link
            prefetch={false}
            className="password-primary-link"
            href={
              mode === 'change' || mode === 'verify' ? '/account' : '/login'
            }
          >
            {mode === 'change' || mode === 'verify'
              ? 'Back to Account settings'
              : 'Back to sign in'}
          </Link>
        )}
        {mode === 'forgot' && (
          <button className="password-text-link" onClick={() => setSuccess('')}>
            Try another email
          </button>
        )}
      </div>
    );
  if ((mode === 'reset' || mode === 'verify') && !tokenChecked)
    return <p className="muted">Opening your secure link…</p>;
  if ((mode === 'reset' || mode === 'verify') && !token)
    return (
      <div className="password-result">
        <p className="form-error">
          This link is missing or invalid. Open the latest email, or request
          another link.
        </p>
        <Link
          prefetch={false}
          className="password-primary-link"
          href={mode === 'reset' ? '/forgot-password' : '/account'}
        >
          {mode === 'reset' ? 'Request a reset link' : 'Open Account settings'}
        </Link>
      </div>
    );
  if (mode === 'forgot' && !emailReady)
    return (
      <p className="form-error" role="status">
        Email recovery is still being set up. If you’re signed in on another
        device, you can change your password in Account settings there.
      </p>
    );
  return (
    <form onSubmit={submit}>
      {mode === 'forgot' && (
        <label htmlFor="recovery-email">
          Your account email
          <Input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            defaultValue={initialEmail}
          />
        </label>
      )}
      {mode === 'change' && (
        <PasswordField id="currentPassword" label="Current password" current />
      )}
      {(mode === 'change' || mode === 'reset') && (
        <>
          <PasswordField id="newPassword" label="New password" />
          <PasswordField id="confirmPassword" label="Confirm new password" />
          <p className="password-hint">
            Use 12–128 characters. Your Sunday Desk password is separate from
            ESPN and Sleeper.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="auth-submit" disabled={busy}>
        {busy
          ? 'One moment…'
          : mode === 'forgot'
            ? 'Email me a reset link'
            : mode === 'reset'
              ? 'Reset password'
              : mode === 'verify'
                ? 'Confirm recovery email'
                : 'Change password'}
      </Button>
      {(mode === 'reset' || mode === 'verify') && error && (
        <Link
          prefetch={false}
          href={mode === 'reset' ? '/forgot-password' : '/account'}
          className="password-text-link"
        >
          Request another link
        </Link>
      )}
    </form>
  );
}

export function PasswordPage({
  mode,
  emailReady,
}: {
  mode: 'forgot' | 'reset' | 'verify';
  emailReady?: boolean;
}) {
  return (
    <main className="password-page">
      <Link prefetch={false} href="/login" className="auth-brand">
        <Zap />
        Sunday<span>Desk</span>
      </Link>
      <section className="auth-card password-card">
        <span className="password-icon">
          {mode === 'forgot' ? (
            <Mail />
          ) : mode === 'reset' ? (
            <KeyRound />
          ) : (
            <ShieldCheck />
          )}
        </span>
        <h1>
          {mode === 'forgot'
            ? 'Forgot your password?'
            : mode === 'reset'
              ? 'Choose a new password'
              : 'Confirm your recovery email'}
        </h1>
        <p className="muted">
          {mode === 'forgot'
            ? 'Enter your Sunday Desk email to get a reset link.'
            : mode === 'reset'
              ? 'After resetting, sign in again on each of your devices.'
              : 'Confirm that this inbox can be used to recover your Sunday Desk account.'}
        </p>
        <PasswordForm key={mode} mode={mode} emailReady={emailReady} />
        {mode === 'forgot' && (
          <p className="password-hint">
            Recovery email must first be verified in Account settings. If you’re
            still signed in on another device, you can enable it there.
          </p>
        )}
        <Link prefetch={false} href="/login" className="password-back">
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
      </section>
    </main>
  );
}

export function RecoveryEmail({
  email,
  verified,
  emailReady,
}: {
  email: string;
  verified: boolean;
  emailReady: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  return (
    <section className="auth-card password-card">
      <span className="password-icon">
        <Mail />
      </span>
      <h2>Recovery email</h2>
      <p className="password-email">{email}</p>
      {verified ? (
        <p className="form-success">
          Verified. You can use Forgot password to recover this account.
        </p>
      ) : (
        <>
          <p className="muted">
            Verify this address once to enable password-reset emails.
          </p>
          {!emailReady ? (
            <p className="form-error">
              Recovery emails are being set up. Changing your password below
              still works.
            </p>
          ) : sent ? (
            <output className="form-success">
              Check your inbox and confirm the link within 30 minutes. Then
              return here and refresh.
            </output>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget,
                  values = new FormData(form);
                setBusy(true);
                setError('');
                try {
                  const r = await fetch('/api/account/verify-recovery-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      currentPassword: values.get('recoveryPassword'),
                    }),
                  });
                  const result = (await r.json().catch(() => ({}))) as {
                    message?: string;
                  };
                  if (r.status === 401) {
                    window.location.assign('/login?next=/account');
                    return;
                  }
                  if (!r.ok)
                    throw new Error(
                      result.message ??
                        'We could not send the email. Please try again.',
                    );
                  form.reset();
                  setSent(true);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Connection interrupted. Please try again.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <PasswordField
                id="recoveryPassword"
                label="Current password"
                current
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="auth-submit" disabled={busy}>
                {busy ? 'Sending…' : 'Verify recovery email'}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
