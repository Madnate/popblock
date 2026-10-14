// Runs in the isolated world: reads chrome.storage and relays the state to blocker.js.
(() => {
  const host        = location.hostname;
  const MIRROR_KEY  = 'popup_blocker_enabled';
  const STATE_EVENT = 'popup-blocker:state';

  function apply(enabled) {
    // Mirror into page localStorage so blocker.js can read it synchronously on the next load.
    try { localStorage.setItem(MIRROR_KEY, String(enabled)); } catch (_) {}
    document.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: enabled }));
    chrome.runtime.sendMessage({ type: 'state', enabled }).catch(() => {});
  }

  chrome.storage.local.get('sites').then(({ sites = {} }) => apply(!!sites[host]));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.sites) return;
    const now    = !!(changes.sites.newValue || {})[host];
    const before = !!(changes.sites.oldValue || {})[host];
    if (now !== before) apply(now);
  });
})();
