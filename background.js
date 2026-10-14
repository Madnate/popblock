// Service worker: keeps each tab's counter and recent-blocks log, draws the badge,
// and handles the keyboard shortcut.
import './lib/rules.js';

const { hostFromUrl, toggleSite, migrate } = globalThis.Popblock;

const LOG_SIZE = 10;
const COLORS = { on: '#1e7a3e', paused: '#8a6d1a', warn: '#a33' };

const tabKey   = id => `tab:${id}`;
const emptyTab = () => ({ blocking: false, paused: false, count: 0, log: [] });

// Per-tab state lives in storage.session: it survives the worker being suspended but
// not a browser restart. Updates are chained so rapid reports don't overwrite each other.
let chain = Promise.resolve();
function updateTab(tabId, fn) {
  chain = chain
    .then(async () => {
      const key = tabKey(tabId);
      const { [key]: current = emptyTab() } = await chrome.storage.session.get(key);
      const next = fn(current);
      await chrome.storage.session.set({ [key]: next });
      await renderBadge(tabId, next);
    })
    .catch(err => console.error('[Popup blocker]', err));
  return chain;
}

async function renderBadge(tabId, s) {
  let text = '', color = COLORS.on;
  if (s.paused) {
    text = 'II';
    color = COLORS.paused;
  } else if (s.blocking) {
    text = s.count === 0 ? 'ON' : s.count > 99 ? '99+' : String(s.count);
  }
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
  } catch (_) { /* tab already closed */ }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null || sender.frameId !== 0) return;

  switch (msg?.type) {
    case 'reset':
      updateTab(tabId, () => emptyTab());
      break;
    case 'state':
      updateTab(tabId, cur => ({ ...cur, blocking: !!msg.blocking, paused: !!msg.paused }));
      break;
    case 'blocked':
      updateTab(tabId, cur => ({
        ...cur,
        count: cur.count + 1,
        log: [{ kind: msg.kind, url: msg.url, time: Date.now() }, ...cur.log].slice(0, LOG_SIZE)
      }));
      break;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(tabKey(tabId));
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-site' || tab?.id == null) return;
  const host = hostFromUrl(tab.url);
  if (!host) return;

  const result = await toggleSite(host);
  if (result.ok) return; // bridge.js picks up the change and updates the badge

  // A wildcard rule decides this site: flash "!" so the shortcut doesn't fail silently.
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: COLORS.warn });
  await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
  setTimeout(async () => {
    const key = tabKey(tab.id);
    const { [key]: s = emptyTab() } = await chrome.storage.session.get(key);
    renderBadge(tab.id, s);
  }, 1500);
});

chrome.runtime.onInstalled.addListener(() => {
  migrate().catch(err => console.error('[Popup blocker] migration failed', err));
});
