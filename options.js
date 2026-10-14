import './lib/rules.js';

const { getSettings, normalizePattern } = globalThis.Popblock;
const $ = id => document.getElementById(id);
const version = chrome.runtime.getManifest().version;

$('version').textContent = `v${version}`;

// ─── Mode ───────────────────────────────────────────────────────────────────
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    if (radio.checked) chrome.storage.local.set({ mode: radio.value });
  });
}

// ─── Site lists ─────────────────────────────────────────────────────────────
async function updateList(key, fn) {
  const s = await getSettings();
  await chrome.storage.local.set({ [key]: fn(s[key]) });
}

for (const section of document.querySelectorAll('.list')) {
  const key = section.dataset.key;
  const form = section.querySelector('form');
  const input = form.querySelector('input');
  const error = section.querySelector('.error');

  const showError = msg => {
    error.textContent = msg;
    input.setAttribute('aria-invalid', String(!!msg));
  };
  input.addEventListener('input', () => showError(''));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const pattern = normalizePattern(input.value);
    if (!pattern) return showError('Enter a hostname such as example.com or *.example.com.');
    const { [key]: list } = await getSettings();
    if (list.includes(pattern)) return showError(`${pattern} is already in this list.`);
    await updateList(key, l => [...l, pattern]);
    input.value = '';
    showError('');
    input.focus();
  });
}

function renderList(section, settings) {
  const key = section.dataset.key;
  const inUse = (key === 'enabledSites') === (settings.mode === 'perSite');
  section.classList.toggle('inactive', !inUse);
  section.querySelector('.in-use').textContent = inUse ? 'In use' : 'Not used in this mode';

  const ul = section.querySelector('ul');
  const items = [...settings[key]].sort().map(pattern => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = pattern;
    const remove = document.createElement('button');
    remove.className = 'btn small';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${pattern}`);
    remove.addEventListener('click', () => updateList(key, l => l.filter(p => p !== pattern)));
    li.append(label, remove);
    return li;
  });

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No sites yet.';
    items.push(empty);
  }
  ul.replaceChildren(...items);
}

async function render() {
  const s = await getSettings();
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === s.mode;
  for (const section of document.querySelectorAll('.list')) renderList(section, s);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') render();
});

// ─── Shortcut ───────────────────────────────────────────────────────────────
const commands = await chrome.commands.getAll();
const shortcut = commands.find(c => c.name === 'toggle-site')?.shortcut;
if (shortcut) $('shortcut').textContent = shortcut;
$('edit-shortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// ─── Backup ─────────────────────────────────────────────────────────────────
$('export').addEventListener('click', async () => {
  const s = await getSettings();
  const data = {
    app: 'popblock',
    version,
    exportedAt: new Date().toISOString(),
    mode: s.mode,
    enabledSites: s.enabledSites,
    excludedSites: s.excludedSites
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `popblock-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('backup-status').textContent = 'Settings exported.';
});

$('import').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const status = $('backup-status');
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    status.textContent = 'That file isn\'t valid JSON.';
    return;
  }

  let skipped = 0;
  const clean = list => {
    if (!Array.isArray(list)) return [];
    const out = new Set();
    for (const item of list) {
      const p = normalizePattern(item);
      if (p) out.add(p); else skipped++;
    }
    return [...out];
  };

  const mode = data?.mode === 'global' ? 'global' : 'perSite';
  const enabledSites = clean(data?.enabledSites);
  const excludedSites = clean(data?.excludedSites);
  const total = enabledSites.length + excludedSites.length;

  if (!total && !('mode' in (data ?? {}))) {
    status.textContent = 'No settings found in that file.';
    return;
  }
  const ok = confirm(
    `Replace your current settings with this file?\n\n` +
    `Mode: ${mode === 'global' ? 'on everywhere' : 'off by default'}\n` +
    `${enabledSites.length} site(s) on · ${excludedSites.length} site(s) excluded`
  );
  if (!ok) return;

  await chrome.storage.local.set({ mode, enabledSites, excludedSites });
  status.textContent = `Imported ${total} site(s)` + (skipped ? `, skipped ${skipped} invalid entr${skipped === 1 ? 'y' : 'ies'}.` : '.');
});

await render();
