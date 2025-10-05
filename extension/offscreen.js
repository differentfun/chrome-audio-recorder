// Offscreen document: performs tab audio capture and MP3 encoding

let audioContext;
let sourceNode;
let processorNode;
let muteNode;
let stream;
let encoder;
let mp3Chunks = [];
let channels = 2;
let isRecording = false;
let targetSampleRate = 44100;
let targetBitrate = 128;
let targetFilename = 'tab-audio.mp3';

function interleave(left, right) {
  const len = left.length + right.length;
  const inter = new Float32Array(len);
  let index = 0, inputIndex = 0;
  while (index < len) {
    inter[index++] = left[inputIndex];
    inter[index++] = right[inputIndex];
    inputIndex++;
  }
  return inter;
}

function floatTo16BitPCM(float32Array) {
  const len = float32Array.length;
  const pcm = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm;
}

function encodeMp3(pcmL, pcmR) {
  // LAME prefers blocks of 1152 samples per channel
  const maxSamples = 1152;
  let idx = 0;
  while (idx < pcmL.length) {
    const leftChunk = pcmL.subarray(idx, idx + maxSamples);
    const rightChunk = pcmR.subarray(idx, idx + maxSamples);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) mp3Chunks.push(new Uint8Array(mp3buf));
    idx += maxSamples;
  }
}

async function startRecording({ tabId, bitrateKbps, filename }) {
  if (isRecording) return;
  targetBitrate = bitrateKbps || 128;
  targetFilename = filename || 'tab-audio.mp3';

  // Capture active tab or specified tab
  const options = { audio: true, video: false };

  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture(options, async (capturedStream) => {
      if (chrome.runtime.lastError || !capturedStream) {
        reject(new Error(chrome.runtime.lastError?.message || 'Impossibile catturare audio tab'));
        return;
      }
      try {
        stream = capturedStream;
        audioContext = new (self.AudioContext || self.webkitAudioContext)();
        targetSampleRate = audioContext.sampleRate || 44100;
        sourceNode = audioContext.createMediaStreamSource(stream);
        // ScriptProcessorNode (deprecated) but simplest cross-support
        const bufferSize = 4096;
        processorNode = audioContext.createScriptProcessor(bufferSize, channels, channels);

        // Ensure context is running in background
        try { await audioContext.resume(); } catch (_) {}

        // Initialize MP3 encoder
        encoder = new lamejs.Mp3Encoder(channels, targetSampleRate, targetBitrate);
        mp3Chunks = [];
        isRecording = true;

        processorNode.onaudioprocess = (e) => {
          if (!isRecording) return;
          const ch0 = e.inputBuffer.getChannelData(0);
          const ch1 = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : ch0;

          const pcmL = floatTo16BitPCM(ch0);
          const pcmR = floatTo16BitPCM(ch1);
          encodeMp3(pcmL, pcmR);
        };

        sourceNode.connect(processorNode);
        // Keep the graph alive but mute output to avoid echo
        muteNode = audioContext.createGain();
        muteNode.gain.value = 0.0;
        processorNode.connect(muteNode);
        muteNode.connect(audioContext.destination);

        // If capture stops unexpectedly, finalize file
        stream.getAudioTracks().forEach(t => {
          t.onended = () => {
            if (isRecording) {
              stopRecordingAndSave();
            }
          };
        });

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function stopRecordingAndSave() {
  if (!isRecording) return;
  isRecording = false;
  try {
    if (processorNode) processorNode.disconnect();
    if (muteNode) muteNode.disconnect();
    if (sourceNode) sourceNode.disconnect();
    if (audioContext) await audioContext.close();
  } catch (_) {}
  try {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
  } catch (_) {}

  // Flush encoder
  try {
    const mp3buf = encoder.flush();
    if (mp3buf.length > 0) mp3Chunks.push(new Uint8Array(mp3buf));
  } catch (_) {}

  // Create blob and download via chrome.downloads
  const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({ url, filename: targetFilename, saveAs: true });
    // Notify others and optionally highlight in Downloads
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_SAVED', downloadId, filename: targetFilename });
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', error: e?.message || String(e) });
  } finally {
    // Revoke URL shortly after to free memory
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'OFFSCREEN_START') {
      try {
        await startRecording({ tabId: msg.tabId, bitrateKbps: msg.bitrateKbps, filename: msg.filename });
        sendResponse({ ok: true });
      } catch (e) {
        console.error(e);
        sendResponse({ ok: false, error: e.message });
      }
    } else if (msg?.type === 'OFFSCREEN_STOP') {
      await stopRecordingAndSave();
      sendResponse({ ok: true });
    }
  })();
  return true; // async
});
