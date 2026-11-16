# Bulb firmware (ESP32)

MicroPython firmware for the ESP32 inside each bulb. Two variants — same
state model, GPIO map, and protocol (`docs/protocol.md`):

| file        | transport                | use for                                  |
|-------------|--------------------------|------------------------------------------|
| `mqtt.py`   | Wi-Fi + MQTT (product)   | deployed bulbs on the broker network     |
| `serial.py` | USB serial, JSON-lines   | bench work, no Wi-Fi/broker              |

`led_test.py` — Phase 1 blink/PWM verification script (`mpremote run`).

## mqtt.py — the product firmware

Set `SSID`, `PASSWORD`, `BROKER` (broker host IP), `BULB_ID` (unique per
bulb), and optionally `ROOMS` at the top of the file, then:

```
python -m mpremote connect COM3 fs cp firmware/bulb/mqtt.py :main.py
python -m mpremote connect COM3 reset
```

- Needs `umqtt` on the board (most ESP32 MicroPython builds include it; if
  not, `mpremote mip install umqtt.robust` while the board has Wi-Fi).
- Dev broker: `cd tools && npm install && node mqtt-broker.js` — set
  `BROKER` to this PC's LAN IP. Production broker: Mosquitto on the hub.
- Bulbs discover each other through the broker — the app sees every bulb
  that publishes retained state, no manual pairing.
- `WIRED_CHANNELS` reports populated PWM channels — `["ww"]` now
  (Phase 1 LED on GPIO4); set all five when Phase 2 hardware is built.
  GPIO map: `r=16 g=17 b=18 ww=4 cw=19`.

## serial.py — bench firmware

```
python -m mpremote connect COM3 fs cp firmware/bulb/serial.py :main.py
python -m mpremote connect COM3 reset
```

Don't leave an `mpremote` session connected while the web app holds the
serial port — only one process can own COM3.
