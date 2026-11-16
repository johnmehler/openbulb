# serial.py — USB-serial control for the smart bulb (no Wi-Fi needed).
#
# Same state model and GPIO map as wifi.py, but instead of HTTP it reads
# one JSON object per line from USB serial (REPL stdin) and replies with the
# full state as one JSON line (contract: docs/protocol.md):
#
#   host -> device : {"ww": 50}        (partial patch, {} returns state)
#   device -> host : {"on":true,"brightness":80,"r":100,"g":100,"b":100,
#                     "ww":100,"cw":0,"channels":["ww"]}
#
# MUST run as main.py so it starts on boot — mpremote can't share the serial
# port while the web app is connected:
#   python -m mpremote connect COMx fs cp firmware/bulb/serial.py :main.py
#   python -m mpremote connect COMx reset
# Ctrl+C at the REPL stops the loop.

import json
import sys
import time

from machine import Pin, PWM

# ---- channel -> GPIO map (same as bulb_server.py) ---------------------------
CHANNEL_PINS = {
    "r": 16,
    "g": 17,
    "b": 18,
    "ww": 4,   # Phase 1 indicator LED
    "cw": 19,
}
PWM_FREQ = 5000
DUTY_MAX = 1023

# Channels actually wired on the bench rig — reported to the app so it can
# disable controls that can't do anything. Update when hardware changes.
# ww=GPIO4 (LED 1), cw=GPIO19 (LED 2).
WIRED_CHANNELS = ["ww", "cw"]

STATE = {
    "on": True,
    "brightness": 80,
    "r": 100, "g": 100, "b": 100,
    "ww": 100, "cw": 100,
}

pwm = {name: PWM(Pin(pin), freq=PWM_FREQ, duty=0)
       for name, pin in CHANNEL_PINS.items()}

CHANNEL_KEYS = ("on", "brightness", "r", "g", "b", "ww", "cw")


def apply_state():
    bri = STATE["brightness"] / 100.0 if STATE["on"] else 0.0
    for name, ch in pwm.items():
        ch.duty(int(STATE.get(name, 0) / 100.0 * bri * DUTY_MAX))


def handle(line):
    line = line.strip()
    if line:
        try:
            patch = json.loads(line)
            if isinstance(patch, dict):
                for k in CHANNEL_KEYS:
                    if k in patch:
                        STATE[k] = patch[k]
        except (ValueError, OSError):
            pass
    apply_state()
    out = dict(STATE)
    out["channels"] = WIRED_CHANNELS
    return out


apply_state()
print("bulb_serial ready")

while True:
    line = sys.stdin.readline()
    if line:
        print(json.dumps(handle(line)))
    else:
        time.sleep(0.05)
