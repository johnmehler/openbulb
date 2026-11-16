// Device adapters for the bulb command protocol (see README.md):
//   GET  /api/state  -> { on, brightness, r, g, b, ww, cw }   (channels 0-100)
//   POST /api/state  <- same shape, partial updates accepted
// Serial transport speaks the same JSON shape, one object per line over USB.

export const DEFAULT_STATE = {
  on: true,
  brightness: 80,
  r: 100, g: 100, b: 100,
  ww: 0, cw: 0,
};

const ls = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// In-browser bulb. State persists in localStorage so sims survive reloads.
export function createSimDevice(storageKey, initial = {}) {
  let state = { ...DEFAULT_STATE, ...ls.get(storageKey, {}), ...initial };
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => l({ ...state }));
  return {
    kind: 'sim',
    async getState() { return { ...state }; },
    async setState(patch) {
      state = { ...state, ...patch };
      ls.set(storageKey, state);
      emit();
      return { ...state };
    },
    onChange(l) { listeners.add(l); },
  };
}

// Real bulb over Wi-Fi: an ESP32 running firmware/bulb_server.py on the LAN.
export function createHttpDevice(baseUrl) {
  const url = baseUrl.replace(/\/+$/, '');
  async function req(method, body) {
    const res = await fetch(`${url}/api/state`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  return {
    kind: 'http',
    baseUrl: url,
    getState: () => req('GET'),
    setState: (patch) => req('POST', patch),
  };
}

// Real bulb over USB serial: an ESP32 running firmware/bulb_serial.py.
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
