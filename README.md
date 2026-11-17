# bulb

Open, programmable Wi-Fi smart light bulbs — multiple bulbs on a local
network, controlled by an app you own and a voice-locked AI push-to-talk
remote. Roadmap: `outline.md` (local, gitignored). System design:
`docs/architecture.md`.

## Layout

| path                       | what                                                                    |
|----------------------------|-------------------------------------------------------------------------|
| `software/app/`            | Control surfaces — `web/` browser app today, `mobile/` later.            |
| `software/host/`           | Phase 6: voice pipeline — verify → STT → LLM → dispatch (scaffold).      |
| `firmware/bulb/`           | ESP32 firmware inside each bulb — `mqtt.py` (product) / `serial.py` (bench). |
| `firmware/remote/`         | Phase 6: XIAO ESP32-S3 push-to-talk remote (scaffold).                   |
| `hardware/`                | Phases 3–5: KiCad PCBs, bulb shell, remote enclosure, BOMs (scaffold).    |
| `docs/protocol.md`         | Bulb command contract shared by app + firmware.                          |
| `docs/architecture.md`     | Whole-system design: broker topology, voice flow, topic scheme.          |
| `utils/`                   | Dev tooling — MQTT broker (`node mqtt-broker.js`, TCP :1883 + WS :9001)
                          and app dev server (`node app-server.js`).        |
| `outline.md`               | Phase roadmap (gitignored — local working doc).                          |

## Quick start

```
# app (simulator bulbs work with no hardware; AI box needs OPENAI_API_KEY)
node utils/app-server.js   →   http://localhost:8000

# firmware — see firmware/bulb/README.md
```
