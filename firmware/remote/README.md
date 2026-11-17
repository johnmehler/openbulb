# Remote firmware (ESP32-S3)

Handheld push-to-talk remote — the final product's voice input. **Not built
yet** — scaffold for Phase 6.

## Hardware (planned)

- Thumbnail ESP32-S3 board with LiPo charger (XIAO ESP32-S3 or QT Py ESP32-S3)
- `INMP441` I2S digital microphone
- Momentary push-to-talk button on an RTC-capable wake GPIO (deep sleep
  between presses → microamp draw, weeks per charge)
- Mini RGB status LED (WS2812): *Listening* / *Thinking* / *Updated* /
  *Voice Rejected*
- `3.7V` LiPo + slide switch, 3D-printed or Hammond `1551` enclosure

## Responsibilities

- Button press → wake, record audio while held, stream to host pipeline
  (`software/host/`) over Wi-Fi
- Drive status LED through the voice-command lifecycle
- Report result back to host for confirmation

Pin map and audio streaming protocol to be defined when built — see
`outline.md` Phase 6 and `docs/architecture.md`.
