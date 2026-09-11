'use client';
import { useState } from 'react';
export default function SignOut() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  return (
    <button
      className="account-signout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          const r = await fetch('/api/auth/sign-out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          if (!r.ok) throw new Error();
          window.location.replace('/login');
        } catch {
          setError(true);
          setBusy(false);
        }
      }}
    >
      {error ? 'Retry sign out' : busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
