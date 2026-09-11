import { seal, unseal } from './crypto.ts';
import { InputError } from './errors.ts';
import type { ProviderConnection } from './types.ts';
const duration = 10 * 60 * 1000;
type Preview = {
  connection: ProviderConnection;
  revision: string;
  expiresAt: number;
};
export function createEspnPreview(
  user: string,
  connection: ProviderConnection,
  revision: string,
) {
  return seal(
    { connection, revision, expiresAt: Date.now() + duration },
    'espn-preview:' + user,
  );
}
export function confirmEspnPreview(
  user: string,
  ticket: unknown,
  selected: unknown,
): Preview {
  if (typeof ticket !== 'string' || ticket.length > 30000)
    throw new InputError(
      'This connection preview is invalid. Import your leagues again.',
    );
  let preview: Preview;
  try {
    preview = unseal<Preview>(ticket, 'espn-preview:' + user);
  } catch {
    throw new InputError(
      'This connection preview is invalid. Import your leagues again.',
    );
  }
  if (preview.expiresAt <= Date.now() || preview.connection.provider !== 'espn')
    throw new InputError(
      'This connection preview expired. Import your leagues again.',
    );
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > 20 ||
    selected.some((id) => typeof id !== 'string' || !/^\d{1,20}$/.test(id))
  )
    throw new InputError('Choose at least one league to connect.');
  const ids = new Set(selected);
  const leagues = preview.connection.leagues.filter((l) => ids.has(l.id));
  if (leagues.length !== ids.size)
    throw new InputError('Choose leagues from this connection preview.');
  return { ...preview, connection: { ...preview.connection, leagues } };
}
