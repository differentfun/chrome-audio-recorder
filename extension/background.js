// background service worker (MV3)

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Al momento il background fa solo da passacarte se necessario
    if (msg?.type === 'RECORDER_STOP') {
      // inoltra a tutte le pagine dell'estensione, incluso recorder.html
      try { await chrome.runtime.sendMessage(msg); } catch (_) {}
      sendResponse({ ok: true });
    } else if (msg?.type === 'RECORDER_SAVED' || msg?.type === 'RECORDER_ERROR') {
      try { await chrome.runtime.sendMessage(msg); } catch (_) {}
      sendResponse({ ok: true });
    }
  })();
  // indicate async response
  return true;
});
