import {
  allowedSender,
  allowedEspnSender,
  validRequest,
  espnAccess,
  appOrigin,
  espnLoginUrl,
  flowLifetimeMs,
  validId,
} from './policy.js';

const appMessages = new Set([
  'SUNDAY_DESK_ESPN_SESSION',
  'SUNDAY_DESK_ESPN_BEGIN_LOGIN',
  'SUNDAY_DESK_ESPN_RESUME_LOGIN',
]);
const espnMessages = new Set([
  'SUNDAY_DESK_ESPN_LOGIN_STATUS',
  'SUNDAY_DESK_ESPN_COMPLETE_LOGIN',
  'SUNDAY_DESK_ESPN_CANCEL_LOGIN',
]);
const jobs = new Map();
const flowKey = (tabId) => `espn-login:${tabId}`;
const validTab = (tabId) => Number.isInteger(tabId) && tabId >= 0;

async function getFlow(tabId) {
  const key = flowKey(tabId);
  const value = (await chrome.storage.session.get(key))[key];
  if (!value) return null;
  if (
    !validId(value.flowId) ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= Date.now() ||
    value.expiresAt > Date.now() + flowLifetimeMs ||
    !['sign-in', 'returned'].includes(value.phase)
  ) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return value;
}
async function getCredentials() {
  const s2 = await chrome.cookies.get({
    url: 'https://fantasy.espn.com/',
    name: 'espn_s2',
  });
  const swid = await chrome.cookies.get({
    url: 'https://fantasy.espn.com/',
    name: 'SWID',
  });
  return s2?.value && swid?.value ? { s2: s2.value, swid: swid.value } : null;
}
const missingSession = {
  loginRequired: true,
  error:
    'Sign in to ESPN Fantasy in this browser, then continue to Sunday Desk.',
};
const expiredFlow = {
  error:
    'This ESPN connection attempt expired. Return to Sunday Desk and start again.',
};

async function handle(message, sender, respond) {
  const tabId = sender.tab?.id;
  if (message.type !== 'SUNDAY_DESK_ESPN_SESSION' && !validTab(tabId)) {
    respond(expiredFlow);
    return;
  }
  if (message.type === 'SUNDAY_DESK_ESPN_LOGIN_STATUS') {
    const flow = await getFlow(tabId);
    respond(
      flow?.phase === 'sign-in'
        ? { active: true, flowId: flow.flowId, expiresAt: flow.expiresAt }
        : { active: false },
    );
    return;
  }
  if (message.type === 'SUNDAY_DESK_ESPN_CANCEL_LOGIN') {
    const flow = await getFlow(tabId);
    // An expired panel can still take the user back; never cancel a newer flow.
    if (flow && (flow.phase !== 'sign-in' || flow.flowId !== message.flowId)) {
      respond(expiredFlow);
      return;
    }
    await chrome.storage.session.remove(flowKey(tabId));
    respond({ navigating: true });
    await chrome.tabs.update(tabId, { url: appOrigin + '/setup' });
    return;
  }
  if (!(await chrome.permissions.contains(espnAccess))) {
    respond({
      error:
        'Allow this connector to access fantasy.espn.com in your browser extension settings, then try again.',
    });
    return;
  }
  if (message.type === 'SUNDAY_DESK_ESPN_BEGIN_LOGIN') {
    await chrome.storage.session.set({
      [flowKey(tabId)]: {
        flowId: message.flowId,
        phase: 'sign-in',
        expiresAt: Date.now() + flowLifetimeMs,
      },
    });
    // Acknowledge before navigation destroys the setup content script.
    respond({ navigating: true, flowId: message.flowId });
    try {
      await chrome.tabs.update(tabId, { url: espnLoginUrl });
    } catch {
      await chrome.storage.session.remove(flowKey(tabId));
    }
    return;
  }
  if (message.type === 'SUNDAY_DESK_ESPN_COMPLETE_LOGIN') {
    const flow = await getFlow(tabId);
    if (flow?.phase !== 'sign-in' || flow.flowId !== message.flowId) {
      respond(expiredFlow);
      return;
    }
    if (!(await getCredentials())) {
      respond(missingSession);
      return;
    }
    await chrome.storage.session.set({
      [flowKey(tabId)]: { ...flow, phase: 'returned' },
    });
    // The ESPN page receives no cookie values, only a navigation acknowledgement.
    respond({ navigating: true });
    try {
      await chrome.tabs.update(tabId, {
        url: appOrigin + '/setup#espn-connect=' + flow.flowId,
      });
    } catch {
      await chrome.storage.session.remove(flowKey(tabId));
    }
    return;
  }
  if (message.type === 'SUNDAY_DESK_ESPN_RESUME_LOGIN') {
    const flow = await getFlow(tabId);
    if (flow?.phase !== 'returned' || flow.flowId !== message.flowId) {
      respond(expiredFlow);
      return;
    }
    // Consume before reading cookies. A retry must start a fresh explicit connection.
    await chrome.storage.session.remove(flowKey(tabId));
  }
  const credentials = await getCredentials();
  respond(credentials ? { credentials } : missingSession);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    !validRequest(message) ||
    !(
      (appMessages.has(message.type) &&
        allowedSender(sender, chrome.runtime.id)) ||
      (espnMessages.has(message.type) &&
        allowedEspnSender(sender, chrome.runtime.id))
    )
  )
    return false;
  // Serialize per tab so a one-time return cannot be consumed by concurrent requests.
  const key = sender.tab?.id;
  let responded = false;
  const respondOnce = (response) => {
    if (responded) return;
    responded = true;
    respond(response);
  };
  const pending = (jobs.get(key) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      try {
        await handle(message, sender, respondOnce);
      } catch {
        respondOnce({
          error:
            'ESPN access was unavailable. Check this connector’s site access in your browser extension settings.',
        });
      }
    });
  jobs.set(key, pending);
  void pending.finally(() => {
    if (jobs.get(key) === pending) jobs.delete(key);
  });
  return true;
});

function openSetup(tab) {
  if (!validTab(tab?.id)) return;
  void chrome.storage.session.remove(flowKey(tab.id)).catch(() => {});
  void chrome.tabs.update(tab.id, { url: appOrigin + '/setup' }).catch(() => {
    // The tab may have closed. Do not create a replacement window or tab.
  });
}
chrome.action.onClicked.addListener(openSetup);
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(flowKey(tabId)).catch(() => {});
});
