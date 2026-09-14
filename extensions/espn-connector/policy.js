export const appOrigin = 'https://fantasy-football-helper-orcin.vercel.app';
export const espnOrigin = 'https://fantasy.espn.com';
export const espnLoginUrl = espnOrigin + '/football/';
export const flowLifetimeMs = 10 * 60 * 1000;
export const espnAccess = {
  permissions: ['cookies'],
  origins: [espnOrigin + '/*'],
};
export function validId(value) {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}
function topLevelSender(sender, extensionId) {
  return sender?.id === extensionId && sender?.frameId === 0;
}
export function allowedSender(sender, extensionId) {
  if (!topLevelSender(sender, extensionId)) return false;
  try {
    const url = new URL(sender.url);
    return url.origin === appOrigin && url.pathname === '/setup';
  } catch {
    return false;
  }
}
export function allowedEspnSender(sender, extensionId) {
  if (!topLevelSender(sender, extensionId)) return false;
  try {
    const url = new URL(sender.url);
    return (
      url.origin === espnOrigin && /^\/football(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export function validRequest(data) {
  if (!validId(data?.requestId)) return false;
  if (
    data.type === 'SUNDAY_DESK_ESPN_SESSION' ||
    data.type === 'SUNDAY_DESK_ESPN_LOGIN_STATUS'
  )
    return true;
  return (
    [
      'SUNDAY_DESK_ESPN_BEGIN_LOGIN',
      'SUNDAY_DESK_ESPN_RESUME_LOGIN',
      'SUNDAY_DESK_ESPN_COMPLETE_LOGIN',
      'SUNDAY_DESK_ESPN_CANCEL_LOGIN',
    ].includes(data.type) && validId(data.flowId)
  );
}
