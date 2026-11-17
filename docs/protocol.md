# Bulb command protocol

Shared contract between the app (`software/app/web/`), bulb firmware
(`firmware/bulb/`),
and (later) the Phase 6 voice host pipeline. Change it here first, then both
sides.

Scope: the bulb **state object** and its transports. System-level concerns —
room/group topics, device discovery, OTA updates, the voice command schema —
are covered in `docs/architecture.md`; extend this doc when those land.

## State object

```json
{
  "on": true,
  "brightness": 80,
  "r": 100, "g": 100, "b": 100,
  "ww": 0, "cw": 0,
  "channels": ["ww"]
}
```

- `on` — power
- `brightness` — master dimmer, 0–100, applied on top of channel levels
- `r`, `g`, `b`, `ww`, `cw` — PWM channel intensities, 0–100
  (RGB color + warm/cool white)
- `channels` — **device → host only**: which channels are physically wired.
  Absent means assume all five. The app greys out controls for missing
  channels, so dead sliders never pretend to work.

Updates are partial: send any subset of fields; the device merges and returns
the full state object. An empty object `{}` is a state query.

## Transports

### MQTT (product) — `firmware/bulb/mqtt.py`

One broker serves every bulb, the app, and (later) the voice pipeline.
Protocol level MQTT 3.1.1 everywhere (MicroPython `umqtt`, aedes dev broker,
MQTT.js pinned to `protocolVersion: 4`).

- Bulb **subscribes** `bulb/<id>/cmd` — payload is a partial state object.
  If `ROOMS` is set in firmware, it also subscribes `room/<name>/cmd`.
- Bulb **publishes** the full state object to `bulb/<id>/state`,
  `retain=True` — late-joining apps/hosts get last-known state instantly,
  and the app auto-discovers bulbs via `bulb/+/state`.
- Every command (including `{}` queries) triggers a state publish.

Dev broker (no Mosquitto needed):

```
cd utils && npm install && node mqtt-broker.js
# TCP :1883 for firmware, WebSocket :9001 for the web app
```

Production: Mosquitto on the Pi/PC hub (`docs/architecture.md`).

### USB serial (bench) — `firmware/bulb/serial.py`

For breadboard work without Wi-Fi/broker. Same state object:

- host → device: one JSON object per line (partial patch; `{}` reads state)
- device → host: one JSON line with the full state object
- firmware must run as `main.py` — it owns the serial port at boot
- non-JSON lines (boot logs) are ignored by the host

## Channel → GPIO map

30-pin `ESP32-D0WD` dev board (all PWM-capable, none boot/strapping):

| channel | GPIO | notes                    |
|---------|------|--------------------------|
| `r`     | 16   |                          |
| `g`     | 17   |                          |
| `b`     | 18   |                          |
| `ww`    | 4    | Phase 1 LED lives here   |
| `cw`    | 19   |                          |

`WIRED_CHANNELS` in each firmware file reports which are populated —
currently `["ww"]` until Phase 3 hardware exists.
