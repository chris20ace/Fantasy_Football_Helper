export type ConnectedLeague = {
  id: string;
  name: string;
  season: number;
  teamName?: string;
};
export type ProviderConnection = {
  provider: 'sleeper' | 'espn';
  accountId: string;
  label: string;
  leagues: ConnectedLeague[];
  credentials?: { s2: string; swid: string };
  updatedAt: string;
};
export type Workspace = { revision: string; connections: ProviderConnection[] };
export type PublicConnection = Omit<
  ProviderConnection,
  'credentials' | 'accountId'
>;
