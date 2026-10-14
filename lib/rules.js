// Shared settings logic.
// Loaded as a classic script before bridge.js in the content script, and imported for its
// side effect by the service worker, the popup and the options page. Exposes globalThis.Popblock.
(function (root) {
  'use strict';

  const PAUSE_MS = 10 * 60 * 1000;

  // chrome.storage.local layout
  const DEFAULTS = Object.freeze({
    mode: 'perSite',     // 'perSite': off unless listed · 'global': on unless listed
    enabledSites: [],    // patterns used in perSite mode
    excludedSites: [],   // patterns used in global mode
    pausedUntil: {}      // { hostname: epoch ms }
  });
  const KEYS = Object.keys(DEFAULTS);

  const PATTERN_RE = /^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/;

  // Accepts "example.com", "*.example.com" or a pasted URL. Returns null if invalid.
  function normalizePattern(input) {
    let p = String(input ?? '').trim().toLowerCase();
    p = p.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');  // scheme
    p = p.split(/[/?#]/)[0];                       // path, query, hash
    p = p.replace(/:\d+$/, '').replace(/\.$/, ''); // port, trailing dot
    return PATTERN_RE.test(p) ? p : null;
  }

  // "*.example.com" matches example.com and any subdomain; anything else is an exact hostname.
  function matches(pattern, host) {
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2);
      return host === base || host.endsWith('.' + base);
    }
    return host === pattern;
  }

  // Prefers an exact entry, which the popup and shortcut can toggle, over a wildcard.
  function findRule(list, host) {
    if (list.includes(host)) return host;
    return list.find(p => matches(p, host)) || null;
  }

  async function getSettings() {
    const s = await chrome.storage.local.get(KEYS);
    return {
      mode: s.mode === 'global' ? 'global' : 'perSite',
      enabledSites: Array.isArray(s.enabledSites) ? s.enabledSites : [],
      excludedSites: Array.isArray(s.excludedSites) ? s.excludedSites : [],
      pausedUntil: s.pausedUntil && typeof s.pausedUntil === 'object' ? s.pausedUntil : {}
    };
  }

  function evaluate(settings, host, now = Date.now()) {
    const listKey = settings.mode === 'global' ? 'excludedSites' : 'enabledSites';
    const rule = findRule(settings[listKey], host);
    const active = settings.mode === 'global' ? !rule : !!rule;
    const until = settings.pausedUntil[host] || 0;
    const paused = active && until > now;
    return {
      mode: settings.mode,
      listKey,
      rule,                      // the list entry that applies to this host, if any
      active,                    // blocking is switched on for this host
      paused,
      pausedUntil: paused ? until : 0,
      blocking: active && !paused
    };
  }

  function prunePauses(map, now = Date.now()) {
    const out = {};
    for (const [host, until] of Object.entries(map || {})) if (until > now) out[host] = until;
    return out;
  }

  // Flips blocking for one host by adding or removing its exact entry in the list the
  // current mode uses. A wildcard rule can't be overridden this way.
  async function toggleSite(host) {
    const s = await getSettings();
    const ev = evaluate(s, host);
    if (ev.rule && ev.rule !== host) return { ok: false, reason: 'wildcard', rule: ev.rule };
    const list = s[ev.listKey].filter(p => p !== host);
    if (!ev.rule) list.push(host);
    const pausedUntil = prunePauses(s.pausedUntil);
    delete pausedUntil[host];
    await chrome.storage.local.set({ [ev.listKey]: list, pausedUntil });
    return { ok: true };
  }

  async function pauseSite(host, ms = PAUSE_MS) {
    const pausedUntil = prunePauses((await getSettings()).pausedUntil);
    pausedUntil[host] = Date.now() + ms;
    await chrome.storage.local.set({ pausedUntil });
  }

  async function resumeSite(host) {
    const pausedUntil = prunePauses((await getSettings()).pausedUntil);
    delete pausedUntil[host];
    await chrome.storage.local.set({ pausedUntil });
  }

  // v1.0 stored { sites: { hostname: true } }.
  async function migrate() {
    const { sites } = await chrome.storage.local.get('sites');
    if (!sites || typeof sites !== 'object') return;
    const s = await getSettings();
    const fromV1 = Object.keys(sites).filter(h => sites[h]).map(normalizePattern).filter(Boolean);
    await chrome.storage.local.set({ enabledSites: [...new Set([...s.enabledSites, ...fromV1])] });
    await chrome.storage.local.remove('sites');
  }

  function hostFromUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
    } catch (_) {
      return null;
    }
  }

  root.Popblock = Object.freeze({
    PAUSE_MS, KEYS,
    normalizePattern, matches, findRule,
    getSettings, evaluate, toggleSite, pauseSite, resumeSite, migrate, hostFromUrl
  });
})(globalThis);
