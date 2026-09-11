export const appOrigin = 'https://fantasy-football-helper-orcin.vercel.app';
export const espnAccess = {
  permissions: ['cookies'],
  origins: ['https://*.espn.com/*'],
};
export function allowedSender(sender, extensionId) {
  if (sender?.id !== extensionId || sender?.frameId !== 0) return false;
  try {
    const url = new URL(sender.url);
    return url.origin === appOrigin && url.pathname === '/setup';
  } catch {
    return false;
  }
}
export function validRequest(data) {
  return (
    data?.type === 'SUNDAY_DESK_ESPN_SESSION' &&
    typeof data.requestId === 'string' &&
    /^[a-f0-9-]{36}$/i.test(data.requestId)
  );
}
