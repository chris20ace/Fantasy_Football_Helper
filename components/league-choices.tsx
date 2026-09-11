'use client';
import type { ConnectedLeague } from '@/lib/accounts/types';
export default function LeagueChoices({
  leagues,
  selected,
  disabled,
  onChange,
  label,
}: {
  leagues: ConnectedLeague[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
  label: string;
}) {
  return (
    <fieldset className="league-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div className="league-picker-actions">
        <span>
          {selected.length} of {leagues.length} selected
        </span>
        <button
          type="button"
          onClick={() => onChange(leagues.map((l) => l.id))}
        >
          Select all
        </button>
        <button type="button" onClick={() => onChange([])}>
          Clear all
        </button>
      </div>
      <div className="league-choices">
        {leagues.map((league) => (
          <label key={league.id} aria-label={league.name}>
            <input
              type="checkbox"
              checked={selected.includes(league.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, league.id]
                    : selected.filter((id) => id !== league.id),
                )
              }
            />
            <span>
              <strong>{league.name}</strong>
              <small>
                {league.teamName ? `${league.teamName} · ` : ''}
                {league.season}
              </small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
