import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowLeft, KeyRound, Zap } from 'lucide-react';
import { getAuth } from '@/lib/accounts/auth';
import { recoveryEmailReady } from '@/lib/accounts/email';
import { PasswordForm, RecoveryEmail } from '@/components/password-management';
import SignOut from '@/components/sign-out';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Account settings | Sunday Desk',
  robots: { index: false },
};
async function AccountContent() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login?next=/account');
  return (
    <main className="password-page account-page">
      <header className="password-header">
        <Link prefetch={false} href="/" className="auth-brand">
          <Zap />
          Sunday<span>Desk</span>
        </Link>
        <SignOut />
      </header>
      <div className="password-account-heading">
        <Link prefetch={false} href="/" className="password-back">
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>
        <h1>Account settings</h1>
        <p>Manage your Sunday Desk password and recovery email.</p>
      </div>
      <div className="password-account-grid">
        <RecoveryEmail
          email={session.user.email}
          verified={session.user.emailVerified}
          emailReady={recoveryEmailReady()}
        />
        <section className="auth-card password-card">
          <span className="password-icon">
            <KeyRound />
          </span>
          <h2>Change password</h2>
          <p className="muted">
            Enter your current password and choose a new one. Your other devices
            will be signed out.
          </p>
          <PasswordForm mode="change" />
        </section>
      </div>
    </main>
  );
}
export default function Account() {
  return <AccountContent />;
}
