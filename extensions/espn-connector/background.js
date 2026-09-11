import { allowedSender, validRequest, espnAccess } from './policy.js';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!allowedSender(sender, chrome.runtime.id) || !validRequest(message))
    return false;
  void (async () => {
    try {
      if (!(await chrome.permissions.contains(espnAccess))) {
        respond({
          error:
            'Open the Sunday Desk extension from your browser toolbar and enable ESPN access first.',
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
          'ESPN access was unavailable. Open the extension and enable access again.',
      });
    }
  })();
  return true;
});
