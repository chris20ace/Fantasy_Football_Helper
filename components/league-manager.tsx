'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import LeagueChoices from './league-choices';
import type { PublicConnection } from '@/lib/accounts/types';
export default function LeagueManager({
  connection,
  disabled,
  onSave,
}: {
  connection: PublicConnection;
  disabled: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState(connection.leagues.map((l) => l.id));
  const dirty =
    selected.length !== connection.leagues.length ||
    connection.leagues.some((l) => !selected.includes(l.id));
  return (
    <form
      className="connected-leagues league-manager"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(selected);
      }}
    >
      <LeagueChoices
        label="My dashboard leagues"
        leagues={connection.availableLeagues ?? connection.leagues}
        selected={selected}
        disabled={disabled}
        onChange={setSelected}
      />
      <p>
        Uncheck a league to remove it from your dashboard. You can add it back
        here anytime.
      </p>
      {selected.length === 0 && (
        <p className="league-empty">
          Your account will stay connected with no leagues shown.
        </p>
      )}
      <Button type="submit" disabled={disabled || !dirty}>
        Save league choices
      </Button>
    </form>
  );
}
