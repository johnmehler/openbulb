// Device adapters for the bulb command protocol (see docs/protocol.md):
// state object { on, brightness, r, g, b, ww, cw, channels? } (channels 0-100).
// Transports: MQTT over the broker (product) and USB serial JSON-lines (bench).

export const DEFAULT_STATE = {
  on: true,
  brightness: 80,
  r: 100, g: 100, b: 100,
  ww: 0, cw: 0,
};

// Real bulb over USB serial: an ESP32 running firmware/bulb/serial.py.
// Every command gets exactly one JSON-line reply; {} reads the state.
// NOTE: requestPort() must run inside a user gesture (button click).
export async function createSerialDevice() {
  const ports = await navigator.serial.getPorts();
  const port = ports.length
    ? ports[0]
    : await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x10c4 }], // CP2102/CP210x USB-UART bridges
      });
  await port.open({ baudRate: 115200 });

  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const waiters = [];
  let buf = '';

  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue; // skip boot/log lines
        try {
          const w = waiters.shift();
          if (w) { clearTimeout(w.timer); w.res(JSON.parse(line)); }
        } catch { /* malformed JSON line */ }
      }
    }
  })();

  const send = (patch) => new Promise((res, rej) => {
    const w = {
      res,
      timer: setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        rej(new Error('serial timeout'));
      }, 2000),
    };
    waiters.push(w);
    writer.write(encoder.encode(JSON.stringify(patch) + '\n')).catch(rej);
  });

  return {
    kind: 'serial',
    getState: () => send({}),
    setState: (patch) => send(patch),
    close: () => port.close(),
  };
}

// ---- MQTT (broker) ----------------------------------------------------------
// One broker connection serves every bulb: bulbs publish retained state to
// bulb/<id>/state and obey partial-state JSON on bulb/<id>/cmd.
// The browser talks WebSocket (ws://host:9001); firmware talks TCP :1883 —
// tools/mqtt-broker.js bridges both to one broker for dev.

export async function connectMqttHub(brokerUrl) {
  const client = mqtt.connect(brokerUrl, {
    clientId: 'bulb-app-' + Math.random().toString(16).slice(2),
    reconnectPeriod: 3000,
    protocolVersion: 4, // MQTT 3.1.1 — matches umqtt on the ESP32 and aedes
  });
  await new Promise((res, rej) => {
    client.once('connect', res);
    client.once('error', rej);
  });

  const states = new Map(); // bulbId -> last known state object
  const stateListeners = new Set();

  client.on('message', (topic, payload) => {
    const m = topic.match(/^bulb\/([^/]+)\/state$/);
    if (!m) return;
    try {
      const st = JSON.parse(payload.toString());
      states.set(m[1], st);
      stateListeners.forEach((l) => l(m[1], st));
    } catch { /* malformed payload */ }
  });
  client.subscribe('bulb/+/state');

  function onState(l) {
    stateListeners.add(l);
    return () => stateListeners.delete(l);
  }

  function deviceFor(bulbId) {
    return {
      kind: 'mqtt',
      bulbId,
      async getState() {
        const cached = states.get(bulbId);
        if (cached) return cached;
        // No retained state seen yet — ask the bulb to republish.
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error('state query timeout')), 2000);
          const off = onState((id, st) => {
            if (id === bulbId) { clearTimeout(timer); off(); res(st); }
          });
          client.publish(`bulb/${bulbId}/cmd`, '{}');
        });
      },
      setState(patch) {
        client.publish(`bulb/${bulbId}/cmd`, JSON.stringify(patch));
        return Promise.resolve(states.get(bulbId) ?? {});
      },
    };
  }

  return { client, states, deviceFor, onState };
}
