# wifi.py — MicroPython HTTP control server for the smart bulb.
#
# Implements the bulb command protocol used by app/web/app.js
# (contract: docs/protocol.md):
#   GET  /api/state  -> {"on":bool,"brightness":0-100,"r":0-100,"g":0-100,
#                         "b":0-100,"ww":0-100,"cw":0-100,"channels":[...]}
#   POST /api/state  <- same shape, partial updates merged
#
# Flash with the ESP32 connected over USB:
#   python -m mpremote connect COMx run firmware/bulb/wifi.py
# (or copy it on as main.py so it auto-starts on boot)

import json
import socket
import time

import network
from machine import Pin, PWM

# ---- Wi-Fi credentials -----------------------------------------------------
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"
PORT = 80

# ---- channel -> GPIO map ---------------------------------------------------
# Phase 2 dev-board (30-pin ESP32-D0WD) map. All PWM-capable, none strapping.
# Unused channels are simply never wired — adjust for the custom PCB later.
CHANNEL_PINS = {
    "r": 16,
    "g": 17,
    "b": 18,
    "ww": 4,   # also the Phase 1 indicator-LED pin
    "cw": 19,
}
PWM_FREQ = 5000
DUTY_MAX = 1023  # 10-bit duty on ESP32 MicroPython

STATE = {
    "on": True,
    "brightness": 80,
    "r": 100, "g": 100, "b": 100,
    "ww": 100, "cw": 0,  # ww=100 default: lights the Phase 1 single LED on GPIO4
}

pwm = {name: PWM(Pin(pin), freq=PWM_FREQ, duty=0)
       for name, pin in CHANNEL_PINS.items()}

# Channels actually wired — reported to the app so it can disable dead
# controls. Update when hardware changes.
WIRED_CHANNELS = ["ww"]


def state_response():
    out = dict(STATE)
    out["channels"] = WIRED_CHANNELS
    return out


def apply_state():
    bri = STATE["brightness"] / 100.0 if STATE["on"] else 0.0
    for name, ch in pwm.items():
        duty = int(STATE.get(name, 0) / 100.0 * bri * DUTY_MAX)
        ch.duty(duty)


# ---- Wi-Fi -----------------------------------------------------------------
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
if not wlan.isconnected():
    wlan.connect(SSID, PASSWORD)
    for _ in range(50):  # ~10 s
        if wlan.isconnected():
            break
        time.sleep(0.2)

if wlan.isconnected():
    ip = wlan.ifconfig()[0]
    print("connected:", ip)
else:
    ip = "?"
    print("no wifi — AP mode fallback not implemented")

# ---- HTTP ------------------------------------------------------------------
def read_request(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(512)
        if not chunk:
            return None
        data += chunk
    head, _, rest = data.partition(b"\r\n\r\n")
    lines = head.decode().split("\r\n")
    method, path, _ = lines[0].split(" ", 2)

    length = 0
    for line in lines[1:]:
        if line.lower().startswith("content-length:"):
            length = int(line.split(":", 1)[1].strip())

    body = rest
    while len(body) < length:
        body += conn.recv(512)
    return method, path, body[:length]


def send_json(conn, obj, code=200):
    payload = json.dumps(obj).encode()
    reason = {200: "OK", 400: "Bad Request", 404: "Not Found"}.get(code, "OK")
    conn.sendall(
        f"HTTP/1.1 {code} {reason}\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(payload)}\r\n"
        "Connection: close\r\n\r\n".encode() + payload
    )


apply_state()

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("", PORT))
srv.listen(1)
print(f"listening on http://{ip}:{PORT}/api/state")

while True:
    conn, _ = srv.accept()
    try:
        req = read_request(conn)
        if req is None:
            continue
        method, path, body = req

        if path.startswith("/api/state"):
            if method == "GET":
                send_json(conn, state_response())
            elif method == "POST":
                try:
                    patch = json.loads(body.decode())
                    for k in ("on", "brightness", "r", "g", "b", "ww", "cw"):
                        if k in patch:
                            STATE[k] = patch[k]
                    apply_state()
                    send_json(conn, state_response())
                except (ValueError, OSError):
                    send_json(conn, {"error": "bad json"}, 400)
            else:
                send_json(conn, {"error": "method"}, 400)
        elif path == "/":
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n"
                         b"Connection: close\r\n\r\nbulb ok\n")
        else:
            send_json(conn, {"error": "not found"}, 404)
    except OSError:
        pass
    finally:
        conn.close()
