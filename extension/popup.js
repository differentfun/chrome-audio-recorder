async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const bitrateSel = document.getElementById('bitrate');
const filenameInput = document.getElementById('filename');
const statusEl = document.getElementById('status');

async function refreshState() {
  const { recording } = await chrome.storage.local.get('recording');
  if (recording) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'In registrazione…';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', refreshState);

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Avvio registrazione…';
  try {
    // Apri una finestra recorder persistente SENZA rubare il focus
    const bitrateKbps = parseInt(bitrateSel.value, 10) || 128;
    const filename = encodeURIComponent(filenameInput.value || 'tab-audio.mp3');
    await chrome.windows.create({
      url: `recorder.html?bitrate=${bitrateKbps}&filename=${filename}`,
      type: 'popup', width: 360, height: 160, focused: false
    });
    // Lo stato verrà impostato dal recorder
    statusEl.textContent = 'In registrazione…';
    stopBtn.disabled = false;
    chrome.storage.local.set({ recording: true });
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Errore: ' + e.message;
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  statusEl.textContent = 'Arresto e salvataggio…';
  try {
    await chrome.runtime.sendMessage({ type: 'RECORDER_STOP' });
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Errore: ' + e.message;
  } finally {
    startBtn.disabled = false;
  }
});

// Aggiorna UI al termine del download o in caso di errore
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RECORDER_SAVED') {
    statusEl.textContent = 'File salvato: ' + (msg.filename || 'MP3');
    stopBtn.disabled = true;
    startBtn.disabled = false;
    chrome.storage.local.set({ recording: false });
    if (typeof msg.downloadId === 'number') {
      try { chrome.downloads.show(msg.downloadId); } catch (_) {}
    }
  } else if (msg?.type === 'RECORDER_ERROR') {
    statusEl.textContent = 'Errore salvataggio: ' + msg.error;
    stopBtn.disabled = true;
    startBtn.disabled = false;
    chrome.storage.local.set({ recording: false });
  }
});
