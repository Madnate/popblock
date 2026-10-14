const hostEl  = document.getElementById('host');
const toggle  = document.getElementById('toggle');
const label   = document.getElementById('label');
const hint    = document.getElementById('hint');

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

let host = null;
try {
  const url = new URL(tab?.url ?? '');
  if (url.protocol === 'http:' || url.protocol === 'https:') host = url.hostname;
} catch (_) {}

function render(enabled) {
  toggle.classList.toggle('on', enabled);
  toggle.setAttribute('aria-checked', String(enabled));
  label.textContent = enabled ? 'BLOCKER ON' : 'BLOCKER OFF';
}

if (!host) {
  hostEl.textContent = 'Not available on this page';
  toggle.disabled = true;
  render(false);
} else {
  hostEl.textContent = host;
  hostEl.title = host;
  const { sites = {} } = await chrome.storage.local.get('sites');
  render(!!sites[host]);
  hint.textContent = 'Applies to this site only. Takes effect immediately; reload if a popup was already armed.';

  toggle.addEventListener('click', async () => {
    const { sites = {} } = await chrome.storage.local.get('sites');
    const enabled = !sites[host];
    if (enabled) sites[host] = true; else delete sites[host];
    await chrome.storage.local.set({ sites });
    render(enabled);
  });
}
