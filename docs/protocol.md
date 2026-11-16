# Bulb command protocol

Shared contract between the app (`app/web/`), bulb firmware (`firmware/bulb/`),
and (later) the Phase 6 voice host pipeline. Change it here first, then both
sides.

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
the full state object.

## Transports

### HTTP (Wi-Fi) — `firmware/bulb/wifi.py`

- `GET /api/state` → state object
- `POST /api/state` ← partial state → responds with full state object

### USB serial — `firmware/bulb/serial.py`

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
currently `["ww"]` until Phase 2 hardware exists.
