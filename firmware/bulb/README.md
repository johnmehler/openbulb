# Bulb firmware (ESP32)

MicroPython firmware for the ESP32 inside each bulb. Two transport variants —
same state model, GPIO map, and protocol (`docs/protocol.md`):

| file        | transport          | use for                                  |
|-------------|--------------------|------------------------------------------|
| `serial.py` | USB serial, JSON-lines | bench work, no Wi-Fi (currently flashed) |
| `wifi.py`   | HTTP on port 80    | deployed bulbs on home Wi-Fi             |

`led_test.py` — Phase 1 blink/PWM verification script (`mpremote run`).

## Flashing

Board: 30-pin `ESP32-D0WD` on `COM3`.

USB-serial mode (current):

```
python -m mpremote connect COM3 fs cp firmware/bulb/serial.py :main.py
python -m mpremote connect COM3 reset
```

Wi-Fi mode — edit `SSID`/`PASSWORD` at the top of `wifi.py` first:

```
python -m mpremote connect COM3 fs cp firmware/bulb/wifi.py :main.py
python -m mpremote connect COM3 reset
```

Notes:

- Firmware must be `main.py` to auto-start on boot.
- Don't leave an `mpremote` session connected while the web app holds the
  serial port — only one process can own COM3.
- `WIRED_CHANNELS` in each file reports which PWM channels are physically
  populated — `["ww"]` now (Phase 1 LED on GPIO4); set all five when Phase 2
  hardware is built. GPIO map: `r=16 g=17 b=18 ww=4 cw=19`.
