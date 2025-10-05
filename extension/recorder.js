// Recorder page: persists while recording and encodes to MP3

const statusEl = document.getElementById('status');
const stopBtn = document.getElementById('stop');
const monitorEl = document.getElementById('monitor');
const monitorToggle = document.getElementById('monitorToggle');

let audioContext;
let sourceNode;
let processorNode;
let sinkDest; // inaudible sink to keep graph running
let stream;
let encoder;
let mp3Chunks = [];
let channels = 2;
let isRecording = false;
let targetSampleRate = 44100;
let targetBitrate = 128;
let targetFilename = 'tab-audio.mp3';

function setStatus(s) { statusEl.textContent = s; }

function floatTo16BitPCM(float32Array) {
  const len = float32Array.length;
  const pcm = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    let v = Math.max(-1, Math.min(1, float32Array[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
  }
  return pcm;
}

function encodeMp3(pcmL, pcmR) {
  const maxSamples = 1152;
  let i = 0;
  while (i < pcmL.length) {
    const l = pcmL.subarray(i, i + maxSamples);
    const r = pcmR.subarray(i, i + maxSamples);
    const mp3buf = encoder.encodeBuffer(l, r);
    if (mp3buf.length) mp3Chunks.push(new Uint8Array(mp3buf));
    i += maxSamples;
  }
}

async function startRecording({ bitrateKbps, filename }) {
  if (isRecording) return;
  targetBitrate = bitrateKbps || 128;
  targetFilename = filename || 'tab-audio.mp3';

  setStatus('Avvio cattura tab…');

  return new Promise((resolve, reject) => {
    // Nota: tabCapture.capture funziona solo sulla tab attiva al momento della chiamata
    chrome.tabCapture.capture({ audio: true, video: false }, async (capturedStream) => {
      if (chrome.runtime.lastError || !capturedStream) {
        const msg = chrome.runtime.lastError?.message || 'Impossibile catturare audio della tab (assicurati che sia attiva)';
        setStatus('Errore: ' + msg);
        reject(new Error(msg));
        return;
      }
      try {
        stream = capturedStream;

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        try { await audioContext.resume(); } catch (_) {}
        targetSampleRate = audioContext.sampleRate || 44100;

        sourceNode = audioContext.createMediaStreamSource(stream);
        processorNode = audioContext.createScriptProcessor(4096, channels, channels);
        encoder = new lamejs.Mp3Encoder(channels, targetSampleRate, targetBitrate);
        mp3Chunks = [];
        isRecording = true;

        processorNode.onaudioprocess = (e) => {
          if (!isRecording) return;
          const ch0 = e.inputBuffer.getChannelData(0);
          const ch1 = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : ch0;
          encodeMp3(floatTo16BitPCM(ch0), floatTo16BitPCM(ch1));
        };

        // Collega a un sink non udibile per mantenere attivo il processing
        sourceNode.connect(processorNode);
        sinkDest = audioContext.createMediaStreamDestination();
        processorNode.connect(sinkDest);

        // Monitor opzionale (ascolto durante la registrazione)
        try {
          monitorEl.srcObject = stream;
          monitorEl.muted = false;
          monitorEl.volume = 1.0;
          monitorEl.play().catch(() => {});
        } catch (_) {}

        // Autostop se lo stream viene interrotto
        stream.getAudioTracks().forEach(t => {
          t.onended = () => { if (isRecording) stopRecordingAndSave(); };
        });

        // Stato persistente
        chrome.storage.local.set({ recording: true, filename: targetFilename });
        setStatus('In registrazione… (' + targetBitrate + ' kbps)');
        resolve();
      } catch (err) {
        setStatus('Errore: ' + err.message);
        reject(err);
      }
    });
  });
}

async function stopRecordingAndSave() {
  if (!isRecording) return;
  isRecording = false;
  setStatus('Arresto e salvataggio…');
  try {
    if (processorNode) processorNode.disconnect();
    if (sinkDest) sinkDest.disconnect();
    if (sourceNode) sourceNode.disconnect();
    if (audioContext) await audioContext.close();
  } catch (_) {}
  try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (_) {}

  try {
    const mp3buf = encoder.flush();
    if (mp3buf.length) mp3Chunks.push(new Uint8Array(mp3buf));
  } catch (_) {}

  const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({ url, filename: targetFilename, saveAs: true });
    chrome.storage.local.set({ recording: false });
    chrome.runtime.sendMessage({ type: 'RECORDER_SAVED', downloadId, filename: targetFilename });
    setStatus('File salvato: ' + targetFilename);
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'RECORDER_ERROR', error: e?.message || String(e) });
    setStatus('Errore salvataggio: ' + (e?.message || e));
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    // Chiudi la finestra del recorder dopo un attimo
    setTimeout(() => { window.close(); }, 2000);
  }
}

// UI stop
stopBtn.addEventListener('click', stopRecordingAndSave);

// Toggle monitor audio
monitorToggle.addEventListener('change', () => {
  try {
    monitorEl.muted = !monitorToggle.checked;
    if (monitorToggle.checked) {
      monitorEl.play().catch(() => {});
    } else {
      monitorEl.pause();
    }
  } catch (_) {}
});

// Ascolta stop da popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RECORDER_STOP') stopRecordingAndSave();
});

// Avvia automaticamente prendendo parametri da query (opzionali)
(async () => {
  try {
    const url = new URL(window.location.href);
    const bitrate = parseInt(url.searchParams.get('bitrate') || '128', 10);
    const filename = url.searchParams.get('filename') || 'tab-audio.mp3';
    await startRecording({ bitrateKbps: bitrate, filename });
  } catch (_) {}
})();
