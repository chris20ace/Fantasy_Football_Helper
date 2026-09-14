(() => {
  if (
    window !== window.top ||
    location.origin !== 'https://fantasy.espn.com' ||
    !/^\/football(?:\/|$)/.test(location.pathname)
  )
    return;
  // No page-message bridge on ESPN. Only this isolated script can request status.
  void (async () => {
    let status;
    try {
      status = await chrome.runtime.sendMessage({
        type: 'SUNDAY_DESK_ESPN_LOGIN_STATUS',
        requestId: crypto.randomUUID(),
      });
    } catch {
      return;
    }
    if (
      !status?.active ||
      typeof status.flowId !== 'string' ||
      !Number.isFinite(status.expiresAt) ||
      status.expiresAt <= Date.now()
    )
      return;
    const host = document.createElement('div');
    host.id = 'sunday-desk-connect';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(360px,calc(100vw - 32px));color-scheme:light}
      *{box-sizing:border-box}
      section{font:15px/1.5 system-ui,sans-serif;color:#142d4e;background:white;border:1px solid #cad7e7;border-top:4px solid #a9e96d;border-radius:16px;padding:18px;box-shadow:0 8px 40px #00152f40}
      h2{font:700 19px/1.3 system-ui,sans-serif;margin:0 0 8px}
      p{margin:0 0 12px}p[data-status]{font-size:14px;color:#a12424}
      .actions{display:flex;gap:8px;flex-wrap:wrap}
      button{font:600 14px/1.3 system-ui,sans-serif;min-height:44px;border-radius:10px;padding:10px 14px;cursor:pointer;border:1px solid #b5c7df;background:white;color:#173557}
      button.primary{background:#2253f1;color:white;border-color:#2253f1;flex:1}
      button:focus-visible{outline:3px solid #779dff;outline-offset:3px}
      button:disabled{cursor:wait;opacity:.6}
      small{display:block;font-size:12px;color:#516a86;margin-top:12px}
    `;
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Connect ESPN to Sunday Desk');
    const title = document.createElement('h2');
    title.textContent = 'Connect to Sunday Desk';
    const description = document.createElement('p');
    description.textContent =
      'Sign in using ESPN’s Log In button. Then continue to choose which football leagues to connect.';
    const feedback = document.createElement('p');
    feedback.dataset.status = '';
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const proceed = document.createElement('button');
    proceed.type = 'button';
    proceed.className = 'primary';
    proceed.textContent = 'Continue to Sunday Desk';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const privacy = document.createElement('small');
    privacy.textContent =
      'Sunday Desk uses your ESPN session to find your leagues. Your ESPN password stays with ESPN. Nothing is saved until you confirm in Sunday Desk.';
    async function send(type) {
      proceed.disabled = cancel.disabled = true;
      feedback.hidden = true;
      try {
        const result = await chrome.runtime.sendMessage({
          type,
          requestId: crypto.randomUUID(),
          flowId: status.flowId,
        });
        if (result?.navigating) return;
        feedback.textContent =
          result?.error || 'Unable to continue. Try again from Sunday Desk.';
      } catch {
        feedback.textContent =
          'The connector updated or became unavailable. Return to Sunday Desk and start again.';
      }
      feedback.hidden = false;
      proceed.disabled = cancel.disabled = false;
    }
    proceed.addEventListener('click', (event) => {
      if (event.isTrusted) void send('SUNDAY_DESK_ESPN_COMPLETE_LOGIN');
    });
    cancel.addEventListener('click', (event) => {
      if (event.isTrusted) void send('SUNDAY_DESK_ESPN_CANCEL_LOGIN');
    });
    actions.append(proceed, cancel);
    panel.append(title, description, feedback, actions, privacy);
    root.append(style, panel);
    document.documentElement.append(host);
  })();
})();
