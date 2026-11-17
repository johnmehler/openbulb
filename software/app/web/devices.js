// Device adapters for the bulb command protocol (docs/protocol.md):
// state object { on, brightness, r, g, b, ww, cw, channels? } (channels 0-100).
// Transport: USB serial JSON-lines to firmware/bulb/serial.py on the ESP32.

// Real bulb over USB serial: an ESP32 running firmware/bulb/serial.py.
// Every command gets exactly one JSON-line reply; {} reads the state.
// Always shows the port picker so the user explicitly chooses the ESP32's
// COM port — previously granted ports are NOT auto-reused (a stale grant
// can silently open the wrong or dead port).
// NOTE: requestPort() must run inside a user gesture (button click).
export async function createSerialDevice() {
  const port = await navigator.serial.requestPort({
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

  // Opening the port resets the ESP32 (DTR/RTS), and MicroPython + main.py
  // need a few seconds before the JSON-lines loop is reading stdin. Poll
  // until the device answers or ~12s elapse, then fail the connect.
  for (let i = 0; i < 6; i++) {
    try {
      await send({});
      break;
    } catch (e) {
      if (i === 5) {
        await port.close().catch(() => {});
        throw e;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return {
    kind: 'serial',
    getState: () => send({}),
    setState: (patch) => send(patch),
    close: () => port.close(),
  };
}

// Wraps the physical serial device to expose ONE PWM channel as an
// independent bulb. The physical device's master on/brightness are pinned
// to on/100% so the channel level is absolute; the bulb's "brightness" IS
// the channel level, and "on" is derived from level > 0.
//   channel = physical PWM channel on the parent (e.g. "ww")
//   pseudo  = channel name reported to the UI (e.g. "r" for tint lookup)
export function createChannelDevice(parent, channel, pseudo) {
  let lastLvl = 0;
  let pinned = false;
  const virt = {
    kind: 'channel',
    channel,
    async getState() {
      if (!pinned) {
        pinned = true;
        await parent.setState({ on: true, brightness: 100 });
      }
      const phys = await parent.getState();
      const lvl = phys[channel] ?? 0;
      if (lvl > 0) lastLvl = lvl;
      const st = { on: lvl > 0, brightness: lvl, channels: [pseudo] };
      st[pseudo] = 100; // level lives in `brightness`; pseudo stays maxed
      return st;
    },
    async setState(patch) {
      const p = {};
      if ('on' in patch) p[channel] = patch.on ? (lastLvl || 50) : 0;
      if ('brightness' in patch) p[channel] = patch.brightness;
      if (pseudo in patch) p[channel] = patch[pseudo];
      if (channel in patch) p[channel] = patch[channel];
      if (Object.keys(p).length) {
        await parent.setState(p);
        if (p[channel] > 0) lastLvl = p[channel];
      }
      return virt.getState();
    },
  };
  return virt;
}
