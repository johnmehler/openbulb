# System architecture

Final product: multiple Wi-Fi smart bulbs + a voice-locked AI push-to-talk
remote + an app you own. One local MQTT broker is the backbone — bulbs, app,
and voice pipeline are all clients, so app control and voice control travel
the same command path.

## Components

| component                | code                   | runs on                          |
|--------------------------|------------------------|----------------------------------|
| Bulb firmware            | `firmware/bulb/`       | ESP32 inside each bulb           |
| Control app              | `software/app/web/` → `software/app/mobile/` | phone / computer |
| Voice remote firmware    | `firmware/remote/`     | XIAO ESP32-S3 in handheld        |
| Voice host pipeline      | `software/host/`       | Raspberry Pi 4/5 or always-on PC |
| MQTT broker              | `utils/mqtt-broker.js` (dev) → Mosquitto (prod) | same Pi/PC as host pipeline |
| Hardware designs         | `hardware/`            | KiCad files, BOMs, prints        |

## Topology

```
                 ┌──────────────────┐
                 │  Mosquitto broker│   (Pi/PC, always on)
                 └────────┬─────────┘
          ┌───────────────┼────────────────┐
          │               │                │
   ┌──────┴─────┐  ┌──────┴──────┐  ┌──────┴───────────┐
   │  Bulbs x N │  │  App        │  │  Voice remote +  │
   │  ESP32     │  │  web/mobile │  │  host pipeline   │
   └────────────┘  └─────────────┘  └──────────────────┘
```

## Command flow — app

1. App publishes to `bulb/<id>/cmd` or `room/<name>/cmd`
2. Broker fans out; each bulb executes and publishes state to `bulb/<id>/state`
3. App subscribes to state topics and updates the UI

## Command flow — voice

1. Remote button held → records audio via INMP441, streams to host
2. Host: **speaker verification** — enrolled voiceprint only; everyone else
   (guests, TV) is rejected → remote LED shows *Voice Rejected*
3. Host: **STT** (faster-whisper) → transcript
4. Host: **LLM translator** → structured command JSON
   `{"action": "set", "target": "room:bedroom", "params": {"ww": 20, "brightness": 30}}`
5. Host **dispatch** publishes to the same broker topics the app uses
6. Bulbs execute → state publishes back → remote LED shows *Updated*

## Topic scheme

Bulb state transport is live today (`docs/protocol.md`); voice/OTA topics
land with the remote and host pipeline:

- `bulb/<id>/cmd`, `bulb/<id>/state` — implemented (retained state)
- `room/<name>/cmd`, `room/<name>/state` — firmware supports via `ROOMS`; broker-side groups pending
- `voice/<remote>/audio`, `voice/<remote>/status` — Phase 6
- `bulb/<id>/ota` — wireless firmware updates to all bulbs at once

## Docs

- `docs/protocol.md` — bulb state object + transports (HTTP now, MQTT later)
- Phase breakdown: `outline.md` (local, gitignored)
