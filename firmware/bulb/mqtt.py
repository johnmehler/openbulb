# mqtt.py — Wi-Fi + MQTT control for a smart bulb (the product transport).
#
# Contract: docs/protocol.md + docs/architecture.md
#   subscribe : bulb/<id>/cmd        (partial state JSON; {} reads state)
#               room/<name>/cmd      (for each name in ROOMS)
#   publish   : bulb/<id>/state      (full state JSON, retained)
#
# Flash (board must have umqtt — most ESP32 MicroPython builds do; if not,
# run `mpremote mip install umqtt.robust` while on Wi-Fi):
#   python -m mpremote connect COMx fs cp firmware/bulb/mqtt.py :main.py
#   python -m mpremote connect COMx reset

import json
import time

import network
from machine import Pin, PWM

try:
    from umqtt.robust import MQTTClient
except ImportError:
    from umqtt.simple import MQTTClient

# ---- config -----------------------------------------------------------------
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"
BROKER = "192.168.1.50"   # MQTT broker host — this PC's LAN IP for tools/mqtt-broker.js
BROKER_PORT = 1883
MQTT_USER = None          # set both for an authenticated broker
MQTT_PASS = None
BULB_ID = "bulb-01"       # unique per bulb — topic root is bulb/<BULB_ID>
ROOMS = []                # e.g. ["bedroom"] → also obeys room/bedroom/cmd

# ---- hardware ----------------------------------------------------------------
CHANNEL_PINS = {
    "r": 16,
    "g": 17,
    "b": 18,
    "ww": 4,   # Phase 1 indicator LED
    "cw": 19,
}
PWM_FREQ = 5000
DUTY_MAX = 1023

# Channels actually wired — reported to hosts so they can disable dead
# controls. Update when hardware changes.
WIRED_CHANNELS = ["ww"]

STATE = {
    "on": True,
    "brightness": 80,
    "r": 100, "g": 100, "b": 100,
    "ww": 100, "cw": 0,
}

CHANNEL_KEYS = ("on", "brightness", "r", "g", "b", "ww", "cw")

pwm = {name: PWM(Pin(pin), freq=PWM_FREQ, duty=0)
       for name, pin in CHANNEL_PINS.items()}


def apply_state():
    bri = STATE["brightness"] / 100.0 if STATE["on"] else 0.0
    for name, ch in pwm.items():
        ch.duty(int(STATE.get(name, 0) / 100.0 * bri * DUTY_MAX))


def state_payload():
    out = dict(STATE)
    out["channels"] = WIRED_CHANNELS
    return json.dumps(out)


# ---- Wi-Fi -------------------------------------------------------------------
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
if not wlan.isconnected():
    wlan.connect(SSID, PASSWORD)
    for _ in range(50):  # ~10 s
        if wlan.isconnected():
            break
        time.sleep(0.2)

if not wlan.isconnected():
    raise RuntimeError("wifi connect failed — check SSID/PASSWORD")
print("wifi:", wlan.ifconfig()[0])

# ---- MQTT --------------------------------------------------------------------
client = MQTTClient(BULB_ID, BROKER, port=BROKER_PORT,
                    user=MQTT_USER, password=MQTT_PASS, keepalive=60)
cmd_topic = f"bulb/{BULB_ID}/cmd"
state_topic = f"bulb/{BULB_ID}/state"
room_topics = [f"room/{name}/cmd" for name in ROOMS]


def on_message(topic, msg):
    try:
        patch = json.loads(msg.decode())
        if isinstance(patch, dict):
            for k in CHANNEL_KEYS:
                if k in patch:
                    STATE[k] = patch[k]
        apply_state()
    except (ValueError, OSError):
        pass
    client.publish(state_topic, state_payload(), retain=True)


client.set_callback(on_message)

apply_state()

while True:
    try:
        if not client.is_connected():
            client.connect()
            client.subscribe(cmd_topic)
            for t in room_topics:
                client.subscribe(t)
            client.publish(state_topic, state_payload(), retain=True)
            print("mqtt connected to", BROKER)
        client.wait_msg()
    except OSError:
        time.sleep(2)
