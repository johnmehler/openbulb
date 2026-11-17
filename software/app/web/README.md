# Bulb Controller (web)

Browser-based control UI for the smart bulb project. Runs entirely on your
computer today; the same UI ports to the phone app and the voice remote later.
No build step — plain HTML/CSS/JS.

## Run it

With AI commands (recommended — serves the files AND the `/api/interpret`
endpoint that calls OpenAI; needs `OPENAI_API_KEY` in `.env`):

```
node utils/app-server.js     # from the repo root → http://localhost:8000
```

Static-only (no AI box): `python -m http.server 8000` from this directory —
the AI input will report the server as unreachable.

Then open http://localhost:8000 in a browser. USB serial requires Chrome or
Edge (Web Serial API).

## Bulbs

Two single-color bulbs, one per LED on the bench ESP32:

- **Red** — `ww` PWM channel (GPIO4)
- **Blue** — `cw` PWM channel (GPIO19)

Each bulb gets a power button and a brightness slider. Click **Connect** to
open the board's serial port (JSON-lines to `firmware/bulb/serial.py`);
**Disconnect** closes it. No Wi-Fi or broker needed.

## Protocol

The command contract lives in `docs/protocol.md` — USB serial JSON-lines.
Firmware reports which channels are wired (`channels` field); the app maps
each wired channel to one bulb and pins the master's `on`/`brightness` so
per-bulb levels are absolute.
