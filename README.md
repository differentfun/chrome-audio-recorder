# Tab Audio MP3 Recorder (Chrome Extension)

Record the active tab’s audio and save it as an MP3 file. Choose bitrate, set a filename, and optionally monitor the audio while recording. Encoding runs locally in the browser using LAME.js — no servers involved.

## Features

- Record active tab audio to MP3 locally.
- Selectable MP3 bitrate (96–320 kbps).
- Custom filename before saving.
- Optional live monitor (listen while recording).
- Simple popup UI with Start/Stop.

## How It Works

- Uses Chrome’s `tabCapture` API to capture audio from the currently active tab at the moment you start recording.
- Encodes audio to MP3 on the fly with [`lame.js`](https://github.com/zhuker/lamejs) in the extension page (no backend).
- A small recorder window (`recorder.html`) stays open during recording and finalizes the MP3 on Stop.
- Downloads the MP3 via the `chrome.downloads` API, optionally opening the item in the Downloads UI.

## Installation (Unpacked)

1. Open `chrome://extensions` in Chrome/Chromium (or Edge with extension support).
2. Enable “Developer mode”.
3. Click “Load unpacked” and select the `extension` folder in this repository.

The extension will appear in your toolbar as “Tab MP3 Recorder”. Pin it for quick access.

## Usage

1. Go to the tab you want to record and make sure it’s the active tab.
2. Click the extension icon to open the popup.
3. Pick an MP3 bitrate and filename.
4. Click “Start”. A small recorder window opens in the background and recording begins.
5. When you’re done, click “Stop” in the popup or the recorder window.
6. Choose where to save the MP3 (the browser’s Save dialog will appear).

Notes:

- The recorder window must remain open while recording; it will close automatically after saving.
- The audio monitor can cause feedback if your system routes the tab’s audio back into itself — use headphones if monitoring.
- `tabCapture` targets the active tab at start time. Switch tabs if needed before you click Start.

## Permissions

- `tabCapture`: Capture audio from the current tab.
- `downloads`: Save the encoded MP3 via the browser’s download manager.
- `storage`: Persist small bits of UI/recording state between views.
- `activeTab`: Interact with the currently active tab when starting capture.

## Repo Structure

```
extension/
  background.js      # MV3 service worker: relays messages
  manifest.json      # Extension manifest (MV3)
  popup.html/.js     # Start/Stop UI, bitrate/filename inputs
  recorder.html/.js  # Actual capture + MP3 encoding + save
  offscreen.html/.js # Alternative capture route (not wired by default)
  lib/lame.min.js    # MP3 encoder (LAME.js)
LICENSE.md           # MIT License
```

The current flow uses `recorder.html` (a small window) to keep the Web Audio graph running and feed LAME.js. The `offscreen.*` files are included for an alternative architecture and are not used by the manifest as-is.

## Limitations

- Uses `ScriptProcessorNode` for simplicity, which is deprecated but widely supported; migrating to `AudioWorklet` is a future improvement.
- Captures only the tab’s audio (not the microphone). Combining sources would require additional capture logic.
- Some sites restrict or delay audio playback until user interaction; start playback first if you get silence.

## Development

- No build step required; everything runs directly from `extension/`.
- Edit the files under `extension/` and reload the extension from `chrome://extensions`.
- If you wire up the `offscreen.*` path, you’ll need additional manifest entries for offscreen documents (MV3).

## Privacy

All processing happens locally in the browser. Audio never leaves your machine; the extension has no network access.

## License

MIT — see `LICENSE.md`. MP3 encoding provided by LAME.js (license under its upstream project).

