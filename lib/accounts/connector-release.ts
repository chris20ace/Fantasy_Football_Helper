export const connectorStoreId = 'nmnefiogkokeggmhhijpjoaheegmkjcg';
export const connectorStoreUrl =
  'https://chromewebstore.google.com/detail/' + connectorStoreId;
export type ConnectorRelease = {
  version: string;
  status: 'preparing' | 'in-review' | 'published';
  storeUrl: string | null;
};
// The server enables installation only after Google's public release is verified.
export const connectorRelease: ConnectorRelease = {
  version: '0.2.0',
  status: 'in-review',
  storeUrl: null,
};
