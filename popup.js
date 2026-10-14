import './lib/rules.js';

const { hostFromUrl, getSettings, evaluate, toggleSite, pauseSite, resumeSite } = globalThis.Popblock;
const $ = id => document.getElementById(id);

$('version').textContent = `v${chrome.runtime.getManifest().version}`;
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

const commands = await chrome.commands.getAll();
const shortcut = commands.find(c => c.name === 'toggle-site')?.shortcut;
if (shortcut) $('shortcut').textContent = `Toggle: ${shortcut}`;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const host = hostFromUrl(tab?.url);
const tabKey = tab ? `tab:${tab.id}` : null;

if (!host) {
  $('host').textContent = 'Not available on this page';
} else {
  $('host').textContent = host;
  $('host').title = host;
  $('activity').hidden = false;

  $('toggle').addEventListener('click', async () => {
    const result = await toggleSite(host);
    if (!result.ok) $('rule').textContent = `Set by ${result.rule}. Edit it in Options.`;
  });

  $('pause').addEventListener('click', async () => {
    const state = evaluate(await getSettings(), host);
    if (state.paused) await resumeSite(host);
    else await pauseSite(host);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') renderSettings();
    if (area === 'session' && tabKey in changes) renderLog(changes[tabKey].newValue);
  });
  setInterval(renderSettings, 10_000); // keeps the pause countdown current

  await renderSettings();
  await renderLog();
}

async function renderSettings() {
  const s = evaluate(await getSettings(), host);
  const toggle = $('toggle');
  const lockedByWildcard = !!s.rule && s.rule !== host;

  toggle.disabled = lockedByWildcard;
  toggle.classList.toggle('on', s.blocking);
  toggle.classList.toggle('paused', s.paused);
  toggle.setAttribute('aria-checked', String(s.active));
  $('toggle-label').textContent = s.paused ? 'BLOCKING PAUSED' : s.active ? 'BLOCKING ON' : 'BLOCKING OFF';
  $('rule').textContent = describeRule(s, lockedByWildcard);

  $('pause-row').hidden = !s.active;
  $('pause').textContent = s.paused ? 'Resume now' : 'Pause 10 min';
  $('pause-status').textContent = s.paused ? `Paused, resumes in ${minutesLeft(s.pausedUntil)}` : '';
}

function describeRule(s, lockedByWildcard) {
  if (lockedByWildcard) {
    return s.mode === 'global'
      ? `Excluded by ${s.rule}. Edit it in Options.`
      : `Enabled by ${s.rule}. Edit it in Options.`;
  }
  if (s.mode === 'global') return s.rule ? 'Excluded from "on everywhere" mode.' : 'On everywhere mode.';
  return s.rule ? '' : 'Off by default. Turn it on for this site.';
}

function minutesLeft(until) {
  const minutes = Math.ceil((until - Date.now()) / 60_000);
  return minutes <= 1 ? 'under a minute' : `${minutes} min`;
}

async function renderLog(state) {
  if (state === undefined) state = (await chrome.storage.session.get(tabKey))[tabKey];
  state ??= { count: 0, log: [] };

  $('count').textContent = String(state.count);
  const list = $('log');
  list.replaceChildren(...state.log.map(logItem));
  $('log-empty').hidden = state.log.length > 0;
}

function logItem(entry) {
  const li = document.createElement('li');

  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = entry.kind;

  const url = document.createElement('span');
  url.className = 'url';
  url.textContent = shortUrl(entry.url);
  url.title = entry.url;

  li.append(kind, url);

  // Only real web URLs can be let through.
  if (/^https?:\/\//i.test(entry.url)) {
    const allow = document.createElement('button');
    allow.className = 'btn small';
    allow.textContent = 'Allow once';
    allow.setAttribute('aria-label', `Allow once: open ${entry.url} in a new tab`);
    allow.addEventListener('click', () => {
      chrome.tabs.create({ url: entry.url, index: tab.index + 1, openerTabId: tab.id });
    });
    li.append(allow);
  }
  return li;
}

function shortUrl(href) {
  try {
    const u = new URL(href);
    return u.hostname + (u.pathname === '/' ? '' : u.pathname);
  } catch (_) {
    return href;
  }
}
