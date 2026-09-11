import {
  allowedSender,
  validRequest,
  espnAccess,
  appOrigin,
} from './policy.js';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!allowedSender(sender, chrome.runtime.id) || !validRequest(message))
    return false;
  void (async () => {
    try {
      if (!(await chrome.permissions.contains(espnAccess))) {
        respond({
          error:
            'Allow this connector to access fantasy.espn.com in your browser extension settings, then try again.',
        });
        return;
      }
      const s2 = await chrome.cookies.get({
        url: 'https://fantasy.espn.com/',
        name: 'espn_s2',
      });
      const swid = await chrome.cookies.get({
        url: 'https://fantasy.espn.com/',
        name: 'SWID',
      });
      if (!s2?.value || !swid?.value) {
        respond({
          error:
            'Sign in to ESPN Fantasy in this browser, then try importing again.',
        });
        return;
      }
      respond({ credentials: { s2: s2.value, swid: swid.value } });
    } catch {
      respond({
        error:
          'ESPN access was unavailable. Check this connector’s site access in your browser extension settings.',
      });
    }
  })();
  return true;
});

function openSetup() {
  void chrome.tabs.create({ url: appOrigin + '/setup', active: true });
}
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openSetup();
});
chrome.action.onClicked.addListener(openSetup);
