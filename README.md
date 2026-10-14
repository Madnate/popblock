# popblock

A Chrome extension (Manifest V3) that blocks click-jacked popups, with an on/off toggle per site.

## What it blocks

- `window.open` calls to other origins
- iframes that can open popups: they get sandboxed, and `allow-popups` is stripped
- `target="_blank"` links and forms pointing off-site, including full-screen invisible overlay links
- `mousedown`, `click` and `touchstart` events on hijacked off-site links

## Install

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repo folder.

Requires Chrome 111 or later, for `"world": "MAIN"` content scripts.

## Usage

Blocking is **off** on every site by default. Click the toolbar icon and flip the switch to enable it for the current site. Tabs where blocking is active show an **ON** badge.

## How it works

| File | Role |
| --- | --- |
| `blocker.js` | Runs in the page's own JS context (`world: "MAIN"`) at `document_start`, so its overrides of `window.open`, `setAttribute` and `createElement` affect the page's scripts. |
| `bridge.js` | Runs in the extension's isolated world. Reads the per-site setting from `chrome.storage` and relays it to `blocker.js` through a DOM event. |
| `popup.html` / `popup.js` | Toolbar popup with the per-site switch. |
| `background.js` | Sets the ON badge per tab. |

Because `chrome.storage` is asynchronous, `bridge.js` also mirrors the state into the site's `localStorage`. On the next load, `blocker.js` reads that copy synchronously, so blocking is already active before any page script runs.
