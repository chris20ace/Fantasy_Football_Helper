'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LeagueChoices from './league-choices';
import type { ConnectedLeague, PublicConnection } from '@/lib/accounts/types';
type Preview = {
  ticket: string;
  leagues: ConnectedLeague[];
  selectedLeagueIds: string[];
};
export default function SleeperConnect({
  username,
  disabled,
  onBusy,
  onConnected,
}: {
  username?: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onConnected: (connections: PublicConnection[]) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [phase, setPhase] = useState(''),
    [error, setError] = useState('');
  async function send(body: Record<string, unknown>) {
    const response = await fetch('/api/connections/sleeper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 401) {
      window.location.assign('/login?next=/setup');
      throw new Error('Sign in again to connect your leagues.');
    }
    const value = (await response.json()) as Preview & {
      connections: PublicConnection[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(value.error ?? 'Could not connect Sleeper. Try again.');
    return value;
  }
  async function discover(value: FormDataEntryValue | null) {
    onBusy(true);
    setPhase('discover');
    setError('');
    try {
      const result = (await send({
        action: 'discover',
        username: value,
      })) as Preview;
      setPreview(result);
      setSelected(result.selectedLeagueIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not find your leagues.');
    } finally {
      onBusy(false);
      setPhase('');
    }
  }
  async function confirm() {
    if (!preview || !selected.length) return;
    onBusy(true);
    setPhase('confirm');
    setError('');
    try {
      const result = await send({
        action: 'confirm',
        ticket: preview.ticket,
        leagueIds: selected,
      });
      setPreview(null);
      onConnected(result.connections);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not connect your leagues.',
      );
    } finally {
      onBusy(false);
      setPhase('');
    }
  }
  return (
    <div className="sleeper-connect">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview ? (
        <section
          className="espn-review"
          aria-label="Review your Sleeper leagues"
        >
          <LeagueChoices
            label="Choose your Sleeper leagues"
            leagues={preview.leagues}
            selected={selected}
            disabled={disabled}
            onChange={setSelected}
          />
          <p className="muted">
            Only the leagues you choose will appear in your dashboard.
          </p>
          <Button
            type="button"
            disabled={disabled || !selected.length}
            className="connect-submit"
            onClick={() => void confirm()}
          >
            {phase === 'confirm'
              ? 'Connecting…'
              : `Connect ${selected.length} ${selected.length === 1 ? 'league' : 'leagues'}`}
            <ArrowRight size={16} />
          </Button>
          <button
            type="button"
            disabled={disabled}
            className="espn-cancel"
            onClick={() => {
              setPreview(null);
              setError('');
            }}
          >
            Cancel
          </button>
        </section>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void discover(new FormData(e.currentTarget).get('username'));
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
              defaultValue={username}
            />
          </label>
          <Button type="submit" disabled={disabled} className="connect-submit">
            {phase === 'discover'
              ? 'Finding your leagues…'
              : username
                ? 'Refresh available leagues'
                : 'Find my Sleeper leagues'}
            <ArrowRight size={16} />
          </Button>
        </form>
      )}
    </div>
  );
}
