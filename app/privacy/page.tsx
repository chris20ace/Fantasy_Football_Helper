import Link from 'next/link';
import SetupLink from '@/components/setup-link';
import { Zap } from 'lucide-react';
export const metadata = {
  title: 'Privacy | Sunday Desk',
  description:
    'How Sunday Desk and its ESPN Connector handle your account and fantasy league data.',
};
export default function PrivacyPage() {
  return (
    <div className="setup-page">
      <header className="setup-top">
        <Link prefetch={false} href="/" className="auth-brand">
          <Zap />
          Sunday<span>Desk</span>
        </Link>
        <SetupLink>Back to setup</SetupLink>
      </header>
      <main className="privacy-content">
        <div className="eyebrow">SUNDAY DESK & ESPN CONNECTOR</div>
        <h1>Your data, explained.</h1>
        <p className="muted">Last updated September 10, 2026</p>
        <h2>What we collect and why</h2>
        <p>
          Sunday Desk stores the name and email you provide for your account, a
          hashed account password, and sign-in sessions. It also stores the
          fantasy accounts and leagues you choose, roster and matchup data used
          by your dashboard, and notes and review checkmarks you save. We use
          this information to provide your private fantasy football workspace.
        </p>
        <h2>Connecting ESPN</h2>
        <p>
          The browser connector reads only the espn_s2 and SWID cookies
          applicable to ESPN Fantasy after you choose to import. These cookies
          identify and authenticate your ESPN session; they can grant account
          access. Sunday Desk uses them to read your leagues. It does not
          collect your ESPN password, change lineups, submit waivers, or make
          trades.
        </p>
        <p>
          Import sends these session values over HTTPS to Sunday Desk to
          discover and verify your leagues. The preview returns league details
          and an encrypted, account-bound ticket that expires after 10 minutes.
          Discovery does not replace or save an ESPN connection in your
          workspace. If you confirm, the selected leagues and session values are
          saved encrypted for future dashboard refreshes.
        </p>
        <p>
          The extension does not store credentials, collect general browsing
          history, use analytics, or continuously monitor ESPN cookies.
          Opening Sunday Desk setup alone does not import an account.
        </p>
        <h2>Where data is processed</h2>
        <p>
          Vercel hosts the application and processes requests. Supabase
          PostgreSQL stores account, session, connection, note, and cache data.
          These providers may process operational logs and network information
          needed to run their services. ESPN and Sleeper receive requests needed
          to load the leagues you connect. We do not intentionally log ESPN
          session values.
        </p>
        <h2>Access and retention</h2>
        <p>
          Private records are associated with your authenticated Sunday Desk
          account. ESPN session values are encrypted and never included in
          normal dashboard or connection responses. Dashboard caches expire
          after seven days; connecting or disconnecting an account clears its
          private cache. Account information and notes remain while your Sunday
          Desk account is retained. Hosting providers may retain backup copies
          according to their backup policies.
        </p>
        <h2>Your controls</h2>
        <p>
          Disconnect ESPN in setup to delete its saved session from the active
          database and clear your private dashboard cache. Uninstalling the
          extension stops future browser imports but does not delete a
          previously saved server connection. Sign out to revoke your Sunday
          Desk session. Manage your ESPN sign-in directly on ESPN.
        </p>
        <h2>Limited use</h2>
        <p>
          Sunday Desk and the ESPN Connector comply with the Chrome Web Store
          User Data Policy, including its Limited Use requirements. We use
          collected information only to provide and improve the stated fantasy
          account connection and dashboard features. We do not sell it, use it
          for advertising, or transfer it for unrelated purposes. Human access
          is limited to your explicit support consent or necessary security and
          legal obligations.
        </p>
        <h2>Questions and requests</h2>
        <p>
          Contact the publisher through{' '}
          <a
            href="https://github.com/chris20ace/Fantasy_Football_Helper/issues"
            rel="noreferrer"
          >
            Sunday Desk support
          </a>{' '}
          for privacy questions or an account deletion request. Do not post
          passwords, session cookies, or private league details in a public
          support request.
        </p>
        <p className="muted">
          Sunday Desk is an independent project and is not affiliated with or
          endorsed by ESPN, Disney, or Sleeper.
        </p>
      </main>
    </div>
  );
}
