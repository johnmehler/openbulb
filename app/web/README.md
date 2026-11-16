# Bulb Controller (web)

Browser-based control UI for the smart bulb project. Runs entirely on your
computer today; the same UI ports to the phone app and the voice remote later.
No build step — plain HTML/CSS/JS (+ vendored MQTT.js).

## Run it

From this directory:

```
python -m http.server 8000
```

Then open http://localhost:8000 in a browser. USB serial mode requires
Chrome or Edge (Web Serial API); everything else works anywhere.

## Bulb modes

- **Simulator bulbs** ("Desk (sim)", "Bedroom (sim)") — fake bulbs whose state
  persists in localStorage. Fully exercises the UI with no hardware.
- **MQTT bulbs** — click "Connect broker" (`ws://localhost:9001` by default)
  and every bulb publishing state appears as a chip automatically. Talks to
  `firmware/bulb/mqtt.py` through the broker.
- **USB serial** — click "Connect USB (ESP32)" (Chrome/Edge only) and pick
  the board's COM port. Talks JSON-lines to `firmware/bulb/serial.py`. Bench
  mode, no Wi-Fi/broker needed.
- **All bulbs** — broadcasts every change to every configured bulb.

## Dev broker

```
cd tools && npm install && node mqtt-broker.js
```

Serves MQTT over TCP `:1883` (firmware) and WebSocket `:9001` (this app).
Production will be Mosquitto on the Pi/PC hub — see `docs/architecture.md`.

## Protocol

The command contract lives in `docs/protocol.md` — MQTT topics
`bulb/<id>/cmd` + retained `bulb/<id>/state`, or USB serial JSON-lines.
Firmware reports which channels are wired (`channels` field); the app greys
out controls that can't do anything (e.g. Hue/Saturation on the single-LED
Phase 1 rig).
