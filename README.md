# bulb

Open, programmable Wi-Fi smart light bulbs — from a breadboard ESP32 to custom
PCBs inside real bulb shells, controlled by an app you own, finished with a
voice-locked AI push-to-talk remote. Roadmap: `outline.md` (local, gitignored).

## Layout

| path               | what                                                              |
|--------------------|-------------------------------------------------------------------|
| `app/web/`         | Browser control app (vanilla JS, no build). Becomes the PWA, later the phone app. |
| `firmware/bulb/`   | ESP32 firmware inside each bulb — `serial.py` (USB) and `wifi.py` (LAN) variants. |
| `docs/protocol.md` | Bulb command contract shared by app + firmware (+ future voice host). |
| `outline.md`       | Phase roadmap (gitignored — local working doc).                   |

## Target layout (final version)

```
app/web/                  PWA now → app/mobile/ (Expo/React Native) later
firmware/bulb/            per-bulb ESP32 firmware
firmware/remote/          Phase 6: XIAO ESP32-S3 push-to-talk remote
host/                     Phase 6: voice pipeline (speaker verify → STT → LLM → dispatch)
hardware/                 Phases 3-5: KiCad PCBs, BOMs, enclosure prints
```

## Quick start

```
# app (simulator works with no hardware)
cd app/web && python -m http.server 8000   →  http://localhost:8000

# firmware — see firmware/bulb/README.md
```
