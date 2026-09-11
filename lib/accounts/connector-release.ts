// Set the public listing only after its store page is available for installation.
export const connectorRelease: {
  version: string;
  status: 'preparing' | 'in-review' | 'published';
  storeUrl: string | null;
} = {
  version: '0.2.0',
  status: 'preparing',
  storeUrl: null,
};
