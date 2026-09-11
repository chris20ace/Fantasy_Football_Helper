import { espnAccess } from './policy.js';
const status = document.querySelector('#status');
const enable = document.querySelector('#enable');
async function refresh() {
  const ready = await chrome.permissions.contains(espnAccess);
  enable.textContent = ready ? 'ESPN access enabled ✓' : 'Enable ESPN access';
  status.textContent = ready
    ? 'Return to setup and choose Import from ESPN.'
    : '';
}
enable.addEventListener('click', async () => {
  try {
    const granted = await chrome.permissions.request(espnAccess);
    if (granted) await refresh();
    else status.textContent = 'Access was not granted. Nothing was imported.';
  } catch {
    status.textContent = 'Access could not be enabled. Please try again.';
  }
});
document.querySelector('#disable').addEventListener('click', async () => {
  await chrome.permissions.remove(espnAccess);
  await refresh();
  status.textContent =
    'Browser access removed. To delete the saved server connection, disconnect ESPN in Sunday Desk.';
});
void refresh();
