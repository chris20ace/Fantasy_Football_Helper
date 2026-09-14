import { connectorInfo, type ConnectorInfo } from './espn-browser-flow.ts';
// The extension bridge starts at document_idle, which can follow hydration.
export function watchConnector(
  target: Window,
  onReady: (info: ConnectorInfo) => void,
  onChecking: (checking: boolean) => void,
) {
  let requestId = '',
    retry = 0,
    timeout = 0,
    disposed = false;
  function stop() {
    target.clearInterval(retry);
    target.clearTimeout(timeout);
  }
  function probe() {
    if (disposed || target.document.visibilityState === 'hidden') return;
    stop();
    requestId = crypto.randomUUID();
    onChecking(true);
    const ping = () =>
      target.postMessage(
        { type: 'SUNDAY_DESK_ESPN_PING', requestId },
        target.location.origin,
      );
    retry = target.setInterval(ping, 750);
    timeout = target.setTimeout(() => {
      stop();
      onChecking(false);
    }, 7500);
    ping();
  }
  function receive(event: MessageEvent) {
    if (
      event.source !== target ||
      event.origin !== target.location.origin ||
      event.data?.type !== 'SUNDAY_DESK_ESPN_PONG' ||
      event.data.requestId !== requestId
    )
      return;
    stop();
    onChecking(false);
    onReady(connectorInfo(event.data));
  }
  target.addEventListener('message', receive);
  target.addEventListener('focus', probe);
  target.document.addEventListener('visibilitychange', probe);
  probe();
  return {
    probe,
    dispose() {
      disposed = true;
      stop();
      target.removeEventListener('message', receive);
      target.removeEventListener('focus', probe);
      target.document.removeEventListener('visibilitychange', probe);
    },
  };
}
