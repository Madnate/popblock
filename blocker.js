// Runs in the page's MAIN world so the overrides below affect the page's own scripts.
// It can't use chrome.* APIs: state arrives from bridge.js via a DOM event.
(function () {
  'use strict';

  const SAFE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation';
  const MIRROR_KEY   = 'popup_blocker_enabled';   // sync copy written by bridge.js
  const STATE_EVENT  = 'popup-blocker:state';

  // Read the mirrored state synchronously so blocking is active before page scripts run.
  // bridge.js then confirms it from chrome.storage (the source of truth).
  let enabled = false;
  try { enabled = localStorage.getItem(MIRROR_KEY) === 'true'; } catch (_) {}
  const isBlocking = () => enabled;

  document.addEventListener(STATE_EVENT, e => {
    const next = e.detail === true;
    if (next === enabled) return;
    enabled = next;
    if (enabled) nukeAll();
    console.info('[Popup blocker]', enabled ? 'ON' : 'OFF');
  });

  // ─── 1. Block window.open ──────────────────────────────────────────────────
  window.open = new Proxy(window.open, {
    apply(target, thisArg, args) {
      const url = args[0] || '';
      if (isBlocking() && !url.startsWith(location.origin) && url !== '' && url !== 'about:blank') {
        console.warn('[Popup blocked] window.open →', url);
        return { closed: true, close() {} };
      }
      return target.apply(thisArg, args);
    }
  });

  // ─── 2. Intercept setAttribute to sandbox iframes BEFORE src is set ────────
  const _setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (isBlocking() && this.tagName === 'IFRAME') {
      if (name.toLowerCase() === 'src') {
        if (!this.hasAttribute('sandbox')) {
          console.warn('[Popup blocked] sandboxing iframe before src →', value);
          _setAttribute.call(this, 'sandbox', SAFE_SANDBOX);
        } else {
          const sb = this.getAttribute('sandbox');
          if (sb.includes('allow-popups')) {
            _setAttribute.call(this, 'sandbox', sb.replace(/allow-popups(-to-escape-sandbox)?/g, '').trim());
          }
        }
      }
      if (name.toLowerCase() === 'sandbox' && value.includes('allow-popups')) {
        console.warn('[Popup blocked] stripped allow-popups from sandbox attr');
        value = value.replace(/allow-popups(-to-escape-sandbox)?/g, '').trim();
      }
      if (name.toLowerCase() === 'allow' && value.includes('popups')) {
        console.warn('[Popup blocked] stripped popups from allow attr');
        value = value.replace('popups', '').trim();
      }
    }
    return _setAttribute.call(this, name, value);
  };

  // ─── 3. Intercept createElement for <iframe> and <a> ──────────────────────
  const _createElement = document.createElement.bind(document);
  document.createElement = function (tag, options) {
    const el = _createElement(tag, options);
    const t = String(tag).toLowerCase();
    if (isBlocking() && t === 'iframe') {
      _setAttribute.call(el, 'sandbox', SAFE_SANDBOX);
      console.warn('[Popup blocked] new iframe pre-sandboxed');
    }
    if (t === 'a') {
      new MutationObserver(() => {
        if (isBlocking() && el.target === '_blank' && el.href && !el.href.startsWith(location.origin)) {
          el.target = '_self';
          el.href = 'javascript:void(0)';
        }
      }).observe(el, { attributes: true });
    }
    return el;
  };

  // ─── 4. Nuke existing iframes and overlays ────────────────────────────────
  function nukeAll() {
    if (!isBlocking()) return;
    document.querySelectorAll('iframe').forEach(f => {
      const sb = f.getAttribute('sandbox');
      if (sb === null) {
        _setAttribute.call(f, 'sandbox', SAFE_SANDBOX);
        console.warn('[Popup blocked] existing iframe sandboxed →', f.src);
      } else if (sb.includes('allow-popups')) {
        _setAttribute.call(f, 'sandbox', sb.replace(/allow-popups(-to-escape-sandbox)?/g, '').trim());
      }
    });
    document.querySelectorAll('a[target="_blank"]').forEach(a => {
      if (!a.href || a.href.startsWith(location.origin)) return;
      const r = a.getBoundingClientRect(), s = getComputedStyle(a);
      if ((s.position === 'fixed' || s.position === 'absolute') && r.width > 200 && r.height > 200) {
        a.remove();
      } else {
        a.target = '_self';
      }
    });
    document.querySelectorAll('form[target="_blank"]').forEach(f => f.target = '_self');
  }

  // ─── 5. Log possible navigation hijacks ───────────────────────────────────
  window.addEventListener('beforeunload', () => {
    if (isBlocking()) console.warn('[Popup blocked] beforeunload fired - possible navigation hijack');
  });

  // ─── 6. Block mousedown + click + touchstart ──────────────────────────────
  function blockEvent(e) {
    if (!isBlocking()) return;
    const a = e.target.closest && e.target.closest('a');
    if (a && a.target === '_blank' && a.href && !a.href.startsWith(location.origin)) {
      e.preventDefault(); e.stopImmediatePropagation();
      console.warn('[Popup blocked] click <a> →', a.href);
    }
  }
  document.addEventListener('mousedown',  blockEvent, true);
  document.addEventListener('click',      blockEvent, true);
  document.addEventListener('touchstart', blockEvent, { capture: true, passive: false });

  // ─── 7. MutationObserver + DOMContentLoaded ───────────────────────────────
  new MutationObserver(nukeAll).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nukeAll);
  } else {
    nukeAll();
  }
})();
