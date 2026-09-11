import { InputError } from './errors.ts';
import type { ProviderConnection } from './types.ts';
export function selectLeagues(
  connection: ProviderConnection,
  selected: unknown,
): ProviderConnection {
  const availableLeagues = connection.availableLeagues ?? connection.leagues;
  const limit = connection.provider === 'espn' ? 20 : 30;
  if (
    !Array.isArray(selected) ||
    selected.length > limit ||
    selected.some((id) => typeof id !== 'string' || !/^\d{1,20}$/.test(id))
  )
    throw new InputError('Choose leagues from this account’s list.');
  const ids = new Set<string>(selected);
  const leagues = availableLeagues.filter((l) => ids.has(l.id));
  if (ids.size !== selected.length || leagues.length !== ids.size)
    throw new InputError('Choose leagues from this account’s list.');
  return {
    ...connection,
    availableLeagues,
    leagues,
    updatedAt: new Date().toISOString(),
  };
}
// A refresh must not undo an intentional removal or an empty selection.
export function retainLeagueSelection(
  discovered: ProviderConnection,
  previous?: ProviderConnection,
): ProviderConnection {
  const availableLeagues = discovered.availableLeagues ?? discovered.leagues;
  const sameAccount =
    previous?.provider === discovered.provider &&
    previous.accountId === discovered.accountId;
  const selected = new Set(
    sameAccount
      ? previous.leagues.map((l) => l.id)
      : availableLeagues.map((l) => l.id),
  );
  return {
    ...discovered,
    availableLeagues,
    leagues: availableLeagues.filter((l) => selected.has(l.id)),
  };
}
