# Voice host pipeline

Software backbone for voice control — **not built yet**, scaffold for
Phase 6. Runs on a Raspberry Pi 4/5 or always-on home PC. Also the natural
home of the MQTT hub that gives multi-bulb room control zero lag (see
`docs/architecture.md`).

## Planned modules

| module      | job                                                                  |
|-------------|----------------------------------------------------------------------|
| `ingest/`   | Receive audio streams from `firmware/remote/` remotes                |
| `verify/`   | Speaker verification (SpeechBrain ECAPA-TDNN / Resemblyzer) — only   |
|             | the enrolled voiceprint passes; guests and TV audio are rejected     |
| `enroll/`   | Voiceprint enrollment flow (3–5 sample sentences)                    |
| `stt/`      | Speech-to-text (faster-whisper)                                      |
| `nlp/`      | LLM maps transcript → structured bulb command JSON                   |
| `dispatch/` | Publish commands to the broker — same topics the app uses            |

## Command schema (planned)

```json
{"action": "set|on|off|scene", "target": "bulb:<id>|room:<name>",
 "params": {"brightness": 30, "ww": 20, "r": 0, "g": 0, "b": 0}}
```

## Infra notes

- Mosquitto MQTT broker lives here (or alongside) — bulbs subscribe to
  `bulb/<id>/cmd` and `room/<name>/cmd`
- Python service; `requirements.txt` when scaffolding starts
