const key = 'sunday-desk:espn-login';
const lifetime = 10 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Flow = { flowId: string; accountId: string; expiresAt: number };

// Only navigation state belongs here. ESPN credentials never enter web storage.
export function beginEspnFlow(
  store: Store,
  accountId: string,
  now = Date.now(),
) {
  const flow: Flow = {
    flowId: crypto.randomUUID(),
    accountId,
    expiresAt: now + lifetime,
  };
  store.setItem(key, JSON.stringify(flow));
  return flow.flowId;
}
export function clearEspnFlow(store: Store) {
  store.removeItem(key);
}
export function consumeEspnReturn(
  store: Store,
  hash: string,
  accountId: string,
  now = Date.now(),
) {
  if (!hash.startsWith('#espn-connect=')) return null;
  const value = store.getItem(key);
  store.removeItem(key);
  const flowId = hash.slice('#espn-connect='.length);
  if (!uuid.test(flowId) || !value) return null;
  try {
    const flow = JSON.parse(value) as Flow;
    return flow.flowId === flowId &&
      flow.accountId === accountId &&
      Number.isFinite(flow.expiresAt) &&
      flow.expiresAt > now &&
      flow.expiresAt <= now + lifetime
      ? flowId
      : null;
  } catch {
    return null;
  }
}

export type ConnectorInfo = { version: string | null; guidedLogin: boolean };
export function connectorInfo(value: unknown): ConnectorInfo {
  const data = value as { version?: unknown; capabilities?: unknown } | null;
  return {
    version:
      typeof data?.version === 'string' &&
      /^\d+(?:\.\d+){1,3}$/.test(data.version)
        ? data.version
        : null,
    guidedLogin:
      Array.isArray(data?.capabilities) &&
      data.capabilities.includes('same-tab-login'),
  };
}
