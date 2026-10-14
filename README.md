# popblock

A Chrome extension (Manifest V3) that blocks click-jacked popups, per site or everywhere, and shows you what it blocked.

## What it blocks

- `window.open` calls to other origins (relative and same-origin URLs pass through)
- iframes that can open popups: they get sandboxed, and `allow-popups` is stripped
- `target="_blank"` links and forms pointing off-site, including full-screen invisible overlay links
- `mousedown`, `click` and `touchstart` events on hijacked off-site links

## Install

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repo folder.

Requires Chrome 111 or later, for `"world": "MAIN"` content scripts.

## Usage

### Toolbar popup

- **On/off switch** for the current site.
- **Pause 10 min** turns blocking off temporarily on this site, for a checkout or login that needs a popup. Blocking resumes on its own.
- **Blocked on this page** shows a counter and the last 10 blocked popups, each with its type (`window.open`, `link`, `overlay`).
- **Allow once** opens a blocked URL in a new tab, for a popup you actually wanted.
- The extension version is shown in the header.

### Badge

| Badge | Meaning |
| --- | --- |
| *(empty)* | Blocking is off on this site |
| `ON` | Blocking, nothing caught yet on this page |
| `3` | Number of popups blocked on this page |
| `II` | Paused |
| `!` | The shortcut couldn't toggle this site because a wildcard rule decides it |

### Keyboard shortcut

**Alt+Shift+P** toggles blocking on the current site. You can change it in `chrome://extensions/shortcuts`, or from the options page.

### Options page

Right-click the toolbar icon and choose **Options**, or use the link in the popup.

- **Default behaviour**: *Off by default* blocks only on the sites you list. *On everywhere* blocks on every site except the ones you exclude. Each mode keeps its own list, so switching back and forth loses nothing.
- **Site lists** accept `example.com` or `*.example.com`. The wildcard covers the domain and all its subdomains. Pasted URLs are cleaned to their hostname.
- **Backup**: export or import the mode and both lists as JSON.

## How it works

| File | Role |
| --- | --- |
| `blocker.js` | Runs in the page's own JS context (`world: "MAIN"`) at `document_start`, so its overrides of `window.open`, `setAttribute` and `createElement` affect the page's scripts. It reports each block through a DOM event. |
| `bridge.js` | Runs in the extension's isolated world. Decides whether this page should block, relays that to `blocker.js`, and forwards block reports to the service worker. |
| `lib/rules.js` | Shared settings logic: modes, wildcard matching, toggle, pause, migration from v1.0. |
| `background.js` | Service worker. Keeps each tab's counter and log in `chrome.storage.session`, draws the badge, and handles the shortcut. |
| `popup.*`, `options.*`, `ui.css` | Toolbar popup and options page. |

Because `chrome.storage` is asynchronous, `bridge.js` also mirrors the current state into the site's `localStorage`. On the next load, `blocker.js` reads that copy synchronously, so blocking is already active before any page script runs.

**Limitation:** in *On everywhere* mode, the very first visit to a site has no mirror yet. Scripts that run in the first few milliseconds, before storage answers, aren't covered until the next load.

## Changelog

### 1.1.0

- Blocked-popup counter on the badge, a recent-blocks log, and "Allow once" in the popup
- *On everywhere* mode with an exclusion list, and wildcard site patterns
- Options page with list management and JSON import/export
- Keyboard shortcut (Alt+Shift+P) to toggle the current site
- Pause blocking on a site for 10 minutes
- Version shown in the popup
- Fix: relative `window.open` URLs (`/login`) were treated as external
- Fix: origin checks now compare real origins, so `https://site.com.evil.example` no longer counts as same-site

### 1.0.0

- Initial port of the userscript to a Manifest V3 extension with a per-site toggle
