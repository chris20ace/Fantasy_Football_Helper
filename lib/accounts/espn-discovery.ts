import { InputError } from './errors.ts';
type FanResponse = {
  preferences?: {
    type?: { id?: number | string };
    metaData?: {
      entry?: {
        gameId?: number | string;
        seasonId?: number | string;
        groups?: { groupId?: number | string }[];
      };
    };
  }[];
};
// ESPN's own fantasy client uses preference types 9/10 and gameId 1 for NFL.
export function espnLeagueIds(response: unknown, season: number): string[] {
  const data = response as FanResponse | null;
  if (!data || !Array.isArray(data.preferences))
    throw new InputError(
      'ESPN could not list your teams. Sign in again, or use the manual connection below.',
    );
  const ids = new Set<string>();
  for (const preference of data.preferences) {
    const entry = preference?.metaData?.entry;
    if (
      ![9, 10].includes(Number(preference?.type?.id)) ||
      Number(entry?.gameId) !== 1 ||
      Number(entry?.seasonId) !== season
    )
      continue;
    const id = String(entry?.groups?.[0]?.groupId ?? '');
    if (/^\d{1,20}$/.test(id)) ids.add(id);
  }
  if (!ids.size)
    throw new InputError(
      'No ESPN NFL teams were found for ' +
        season +
        '. Check which ESPN account is signed in, or use the manual connection below.',
    );
  if (ids.size > 20)
    throw new InputError(
      'This workspace supports up to 20 ESPN leagues. Use the manual connection to choose league IDs.',
    );
  return [...ids];
}
