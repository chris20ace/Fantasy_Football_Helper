import { seal, unseal } from './crypto.ts';
import { InputError } from './errors.ts';
import { selectLeagues } from './league-selection.ts';
import type { ProviderConnection } from './types.ts';
type Provider = ProviderConnection['provider'];
type Preview = {
  connection: ProviderConnection;
  revision: string;
  expiresAt: number;
};
export function createConnectionPreview(
  user: string,
  connection: ProviderConnection,
  revision: string,
) {
  return seal(
    { connection, revision, expiresAt: Date.now() + 10 * 60 * 1000 },
    connection.provider + '-preview:' + user,
  );
}
export function confirmConnectionPreview(
  user: string,
  provider: Provider,
  ticket: unknown,
  selected: unknown,
): Preview {
  if (typeof ticket !== 'string' || ticket.length > 40000)
    throw new InputError(
      'This connection preview is invalid. Find your leagues again.',
    );
  let preview: Preview;
  try {
    preview = unseal<Preview>(ticket, provider + '-preview:' + user);
  } catch {
    throw new InputError(
      'This connection preview is invalid. Find your leagues again.',
    );
  }
  if (
    !Number.isFinite(preview.expiresAt) ||
    preview.expiresAt <= Date.now() ||
    preview.connection.provider !== provider
  )
    throw new InputError(
      'This connection preview expired. Find your leagues again.',
    );
  if (!Array.isArray(selected) || !selected.length)
    throw new InputError('Choose at least one league to connect.');
  return {
    ...preview,
    connection: selectLeagues(preview.connection, selected),
  };
}
