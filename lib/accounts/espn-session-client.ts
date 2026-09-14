export type EspnSession = { s2: string; swid: string };
export class EspnConnectError extends Error {
  code: string;
  constructor(message: string, code = 'CONNECTION_FAILED') {
    super(message);
    this.code = code;
  }
}
export function validEspnSession(value: unknown): value is EspnSession {
  const v = value as EspnSession | null;
  return (
    !!v &&
    typeof v.s2 === 'string' &&
    v.s2.length > 0 &&
    v.s2.length <= 6000 &&
    !/[\r\n\u0000]/.test(v.s2) &&
    typeof v.swid === 'string' &&
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\})$/i.test(
      v.swid,
    )
  );
}
type ExtensionResult = {
  credentials?: EspnSession;
  navigating?: boolean;
  [key: string]: unknown;
};
export function requestEspnExtension(
  target: Window,
  type: string,
  flowId?: string,
  signal?: AbortSignal,
): Promise<ExtensionResult> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let timer = 0;
    function cleanup() {
      target.removeEventListener('message', receive);
      target.clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    function cancel() {
      cleanup();
      reject(new EspnConnectError('Connection cancelled.', 'CANCELLED'));
    }
    function receive(event: MessageEvent) {
      const value = event.data;
      if (
        event.source !== target ||
        event.origin !== target.location.origin ||
        value?.type !== 'SUNDAY_DESK_ESPN_RESULT' ||
        value.requestId !== requestId
      )
        return;
      cleanup();
      if (target.location.pathname !== '/setup') {
        reject(
          new EspnConnectError(
            'Return to Sunday Desk setup to connect ESPN.',
            'UNTRUSTED_ORIGIN',
          ),
        );
        return;
      }
      if (value.error)
        reject(
          new EspnConnectError(
            value.loginRequired
              ? 'Sign in to ESPN, then return here to find your teams.'
              : 'The ESPN connector could not complete that step. Please try again.',
            value.loginRequired ? 'LOGIN_REQUIRED' : 'CONNECTION_FAILED',
          ),
        );
      else if (validEspnSession(value.credentials))
        resolve({
          credentials: {
            s2: value.credentials.s2,
            swid: value.credentials.swid,
          },
        });
      else if (
        type === 'SUNDAY_DESK_ESPN_BEGIN_LOGIN' &&
        value.navigating === true &&
        value.flowId === flowId
      )
        resolve({ navigating: true });
      else
        reject(
          new EspnConnectError(
            'ESPN did not return a signed-in session. Sign in and try again.',
            'LOGIN_REQUIRED',
          ),
        );
    }
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener('abort', cancel, { once: true });
    target.addEventListener('message', receive);
    timer = target.setTimeout(() => {
      cleanup();
      reject(
        new EspnConnectError(
          'The connector did not respond. Check that it is enabled, then try again.',
        ),
      );
    }, 10000);
    target.postMessage(
      { type, requestId, ...(flowId ? { flowId } : {}) },
      target.location.origin,
    );
  });
}

type NativeCommand = 'status' | 'connect' | 'cancel';
type NativeResponse = {
  requestId: string;
  command: NativeCommand;
  success: boolean;
  available?: boolean;
  version?: number;
  s2?: string;
  swid?: string;
  error?: { code?: string };
};
type NativeWindow = Window & {
  SundayDeskEspn?: {
    postMessage: (message: string) => void;
    onmessage?: ((event: { data: string }) => void) | null;
  };
  webkit?: {
    messageHandlers?: {
      SundayDeskEspn?: {
        postMessage: (message: {
          command: NativeCommand;
          requestId: string;
        }) => Promise<unknown>;
      };
    };
  };
};
const nativeMessages: Record<string, string> = {
  CANCELLED: 'Connection cancelled.',
  BUSY: 'An ESPN sign-in is already open.',
  SESSION_MISSING: 'Finish signing in to ESPN, then tap Continue.',
  UNTRUSTED_ORIGIN: 'Return to Sunday Desk setup to connect ESPN.',
};
export function createNativeEspnClient(target: Window) {
  const native = target as NativeWindow;
  const android = native.SundayDeskEspn;
  const ios = native.webkit?.messageHandlers?.SundayDeskEspn;
  if (!android?.postMessage && !ios?.postMessage) return null;
  let disposed = false;
  let active: string | null = null;
  const pending = new Map<
    string,
    {
      finish: (v: NativeResponse) => void;
      reject: (e: Error) => void;
      cleanup: () => void;
    }
  >();
  const oldHandler = android?.onmessage;
  const trusted = () =>
    target.location.origin ===
      'https://fantasy-football-helper-orcin.vercel.app' &&
    target.location.pathname === '/setup';
  function receive(raw: unknown) {
    let value: NativeResponse;
    try {
      value = (
        typeof raw === 'string' ? JSON.parse(raw) : raw
      ) as NativeResponse;
    } catch {
      return;
    }
    if (
      !value ||
      typeof value.requestId !== 'string' ||
      !['status', 'connect', 'cancel'].includes(value.command)
    )
      return;
    const item = pending.get(value.command + ':' + value.requestId);
    if (!item) return;
    item.cleanup();
    if (!trusted()) {
      item.reject(
        new EspnConnectError(
          nativeMessages.UNTRUSTED_ORIGIN,
          'UNTRUSTED_ORIGIN',
        ),
      );
      return;
    }
    if (value.success === true) item.finish(value);
    else {
      const code = value.error?.code || 'CONNECTION_FAILED';
      item.reject(
        new EspnConnectError(
          nativeMessages[code] ||
            'Could not finish ESPN sign-in. Please try again.',
          code,
        ),
      );
    }
  }
  if (android) android.onmessage = (event) => receive(event.data);
  function send(
    command: NativeCommand,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<NativeResponse> {
    return new Promise((resolve, reject) => {
      if (disposed || !trusted()) {
        reject(
          new EspnConnectError(
            nativeMessages.UNTRUSTED_ORIGIN,
            'UNTRUSTED_ORIGIN',
          ),
        );
        return;
      }
      const key = command + ':' + requestId;
      const cleanup = () => {
        target.clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        pending.delete(key);
      };
      const cancel = () => {
        cleanup();
        if (command === 'connect')
          void send('cancel', requestId).catch(() => {});
        reject(new EspnConnectError(nativeMessages.CANCELLED, 'CANCELLED'));
      };
      const timer = target.setTimeout(
        () => {
          cleanup();
          if (command === 'connect')
            void send('cancel', requestId).catch(() => {});
          reject(
            new EspnConnectError(
              'The connection timed out. Please try again.',
              'TIMEOUT',
            ),
          );
        },
        command === 'connect' ? 15 * 60 * 1000 : 5000,
      );
      pending.set(key, { finish: resolve, reject, cleanup });
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const message = { command, requestId };
        if (android) android.postMessage(JSON.stringify(message));
        else
          Promise.resolve(ios!.postMessage(message)).then(receive, () => {
            if (pending.has(key)) {
              cleanup();
              reject(
                new EspnConnectError('Could not open ESPN sign-in. Try again.'),
              );
            }
          });
      } catch {
        cleanup();
        reject(new EspnConnectError('Could not open ESPN sign-in. Try again.'));
      }
    });
  }
  return {
    async available() {
      try {
        const r = await send('status', crypto.randomUUID());
        return r.available === true && r.version === 1;
      } catch {
        return false;
      }
    },
    async connect(signal?: AbortSignal): Promise<EspnSession> {
      if (active) throw new EspnConnectError(nativeMessages.BUSY, 'BUSY');
      active = crypto.randomUUID();
      try {
        const r = await send('connect', active, signal);
        if (!validEspnSession(r))
          throw new EspnConnectError(
            'ESPN did not return a signed-in session. Try again.',
            'SESSION_MISSING',
          );
        return { s2: r.s2, swid: r.swid };
      } finally {
        active = null;
      }
    },
    dispose() {
      if (active && trusted()) {
        const message = { command: 'cancel' as const, requestId: active };
        try {
          if (android) android.postMessage(JSON.stringify(message));
          else void Promise.resolve(ios!.postMessage(message)).catch(() => {});
        } catch {}
      }
      disposed = true;
      for (const item of [...pending.values()]) {
        item.cleanup();
        item.reject(
          new EspnConnectError(nativeMessages.CANCELLED, 'CANCELLED'),
        );
      }
      if (android) android.onmessage = oldHandler;
    },
  };
}
