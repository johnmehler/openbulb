# bulb

Open, programmable Wi-Fi smart light bulbs — multiple bulbs on a local
network, controlled by an app you own and a voice-locked AI push-to-talk
remote. Roadmap: `outline.md` (local, gitignored). System design:
`docs/architecture.md`.

## Layout

| path                    | what                                                                    |
|-------------------------|-------------------------------------------------------------------------|
| `app/`                  | Control surfaces — `web/` browser app today, `mobile/` later.            |
| `firmware/bulb/`        | ESP32 firmware inside each bulb — `serial.py` (USB) / `wifi.py` (LAN).   |
| `firmware/remote/`      | Phase 6: XIAO ESP32-S3 push-to-talk remote (scaffold).                   |
| `host/`                 | Phase 6: voice pipeline — verify → STT → LLM → dispatch (scaffold).      |
| `hardware/`             | Phases 3–5: KiCad PCBs, bulb shell, remote enclosure, BOMs (scaffold).    |
| `docs/protocol.md`      | Bulb command contract shared by app + firmware.                          |
| `docs/architecture.md`  | Whole-system design: broker topology, voice flow, topic scheme.          |
| `outline.md`            | Phase roadmap (gitignored — local working doc).                          |

## Quick start

```
# app (simulator works with no hardware)
cd app/web && python -m http.server 8000   →  http://localhost:8000

# firmware — see firmware/bulb/README.md
```
