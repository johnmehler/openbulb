# Bulb Controller (web)

Browser-based control UI for the smart bulb project. Runs entirely on your
computer today; the same UI ports to the phone app and the voice remote later.
No build step — plain HTML/CSS/JS.

## Run it

From this directory:

```
python -m http.server 8000
```

Then open http://localhost:8000 in a browser. USB serial mode requires
Chrome or Edge (Web Serial API); the simulator works everywhere.

## Bulb modes

- **Simulator bulbs** ("Desk (sim)", "Bedroom (sim)") — fake bulbs whose state
  persists in localStorage. Fully exercises the UI with no hardware.
- **USB serial** — click "Connect USB (ESP32)" and pick the board's COM port.
  Talks JSON-lines to `firmware/bulb/serial.py`. No Wi-Fi needed; best for
  bench work.
- **Real bulbs over Wi-Fi** — "Add bulb" with the ESP32's IP (e.g.
  `http://192.168.1.50`). Talks to `firmware/bulb/wifi.py`.
- **All bulbs** — broadcasts every change to every configured bulb.

## Protocol

The command contract lives in `docs/protocol.md` — HTTP `GET/POST /api/state`
for Wi-Fi bulbs, one-JSON-object-per-line for USB serial. Firmware reports
which channels are wired (`channels` field); the app greys out controls that
can't do anything (e.g. Hue/Saturation on the single-LED Phase 1 rig).
