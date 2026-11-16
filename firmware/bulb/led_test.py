from machine import Pin, PWM
import time

led = PWM(Pin(4), freq=1000)

print("blink test: 3 flashes")
for _ in range(3):
    led.duty(1023)
    time.sleep_ms(300)
    led.duty(0)
    time.sleep_ms(300)

print("dimming test: fade up and down x2")
for _ in range(2):
    for d in range(0, 1024, 16):
        led.duty(d)
        time.sleep_ms(15)
    for d in range(1023, -1, -16):
        led.duty(d)
        time.sleep_ms(15)

led.duty(128)
print("done - LED held at ~12% brightness")
