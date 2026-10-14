// Shows an "ON" badge on tabs where blocking is active.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'state' || sender.tab?.id == null) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: msg.enabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#1e7a3e' });
});
