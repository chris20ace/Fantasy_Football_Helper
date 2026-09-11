(() => {
  if (
    window !== window.top ||
    location.origin !== 'https://fantasy-football-helper-orcin.vercel.app' ||
    location.pathname !== '/setup'
  )
    return;
  let pending = false;
  window.addEventListener('message', async (event) => {
    if (
      location.pathname !== '/setup' ||
      event.source !== window ||
      event.origin !== location.origin
    )
      return;
    const data = event.data;
    if (
      !data ||
      typeof data.requestId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(data.requestId)
    )
      return;
    if (data.type === 'SUNDAY_DESK_ESPN_PING') {
      window.postMessage(
        { type: 'SUNDAY_DESK_ESPN_PONG', requestId: data.requestId },
        location.origin,
      );
      return;
    }
    if (data.type !== 'SUNDAY_DESK_ESPN_SESSION' || pending) return;
    pending = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: data.type,
        requestId: data.requestId,
      });
      window.postMessage(
        {
          type: 'SUNDAY_DESK_ESPN_RESULT',
          requestId: data.requestId,
          ...response,
        },
        location.origin,
      );
    } catch {
      window.postMessage(
        {
          type: 'SUNDAY_DESK_ESPN_RESULT',
          requestId: data.requestId,
          error: 'Reload this page after installing or updating the connector.',
        },
        location.origin,
      );
    } finally {
      pending = false;
    }
  });
})();
