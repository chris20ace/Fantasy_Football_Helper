import {
  createConnectionPreview,
  confirmConnectionPreview,
} from './connection-ticket.ts';
import type { ProviderConnection } from './types.ts';
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
  return createConnectionPreview(user, connection, revision);
}
export function confirmEspnPreview(
  user: string,
  ticket: unknown,
  selected: unknown,
): Preview {
  return confirmConnectionPreview(user, 'espn', ticket, selected);
}
