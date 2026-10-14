// Runs in the isolated world, after lib/rules.js. Works out whether this page should block,
// relays that to blocker.js, and forwards blocked-popup reports to the service worker.
(() => {
  const { getSettings, evaluate, KEYS } = globalThis.Popblock;

  const host        = location.hostname;
  const MIRROR_KEY  = 'popup_blocker_enabled';
  const STATE_EVENT = 'popup-blocker:state';
  const BLOCK_EVENT = 'popup-blocker:blocked';

  const send = msg => chrome.runtime.sendMessage(msg).catch(() => {});

  // Until storage answers, trust the same mirror blocker.js started from.
  let blocking = false;
  try { blocking = localStorage.getItem(MIRROR_KEY) === 'true'; } catch (_) {}
  let lastSent = null;
  let resumeTimer = 0;

  async function refresh() {
    const state = evaluate(await getSettings(), host);

    // Re-evaluate the moment a pause runs out.
    clearTimeout(resumeTimer);
    if (state.paused) resumeTimer = setTimeout(refresh, state.pausedUntil - Date.now() + 50);

    blocking = state.blocking;
    const key = `${state.blocking}|${state.paused}`;
    if (key === lastSent) return;
    lastSent = key;

    // Mirror into page localStorage so blocker.js can read it synchronously on the next load.
    try { localStorage.setItem(MIRROR_KEY, String(state.blocking)); } catch (_) {}
    document.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: state.blocking }));
    send({ type: 'state', blocking: state.blocking, paused: state.paused });
  }

  document.addEventListener(BLOCK_EVENT, e => {
    if (!blocking || typeof e.detail !== 'string') return;
    let data;
    try { data = JSON.parse(e.detail); } catch (_) { return; }
    if (typeof data?.kind !== 'string' || typeof data?.url !== 'string') return;
    send({ type: 'blocked', kind: data.kind.slice(0, 32), url: data.url.slice(0, 2048) });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEYS.some(k => k in changes)) refresh();
  });

  send({ type: 'reset' }); // new page: clear this tab's counter and log
  refresh();
})();
