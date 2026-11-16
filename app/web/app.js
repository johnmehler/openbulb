import { DEFAULT_STATE, createSimDevice, createSerialDevice, connectMqttHub } from './devices.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- color math ----------

// hue 0-360, sat 0-100 -> [r, g, b] each 0-100. These are the raw PWM channel
// values sent to the bulb; low saturation lifts all three toward full.
function hsvToChannels(h, s) {
  const sv = s / 100;
  const c = sv, hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = 1 - c;
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m].map((v) => Math.round(clamp(v, 0, 1) * 100));
}

// r/g/b channels 0-100 -> { h: 0-360, s: 0-100 }, so the pickers can sync to a
// bulb's real color when it's selected.
function rgbToHsv(r, g, b) {
  const R = r / 100, G = g / 100, B = b / 100;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === R) h = 60 * (((G - B) / d) % 6);
    else if (mx === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h: Math.round(h), s: mx > 1e-6 ? Math.round((d / mx) * 100) : 0 };
}

// Approximate additive light each channel contributes, for the on-screen preview.
const TINTS = {
  r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1],
  ww: [1, 0.5, 0.15], cw: [0.45, 0.62, 1],
};

function previewColor(st) {
  const bri = (st.on ? st.brightness : 0) / 100;
  let R = 0, G = 0, B = 0;
  for (const k of ['r', 'g', 'b', 'ww', 'cw']) {
    const i = (st[k] ?? 0) / 100;
    const t = TINTS[k];
    R += t[0] * i; G += t[1] * i; B += t[2] * i;
  }
  const m = Math.max(R, G, B, 1e-6);
  const n = m > 1 ? 1 / m : 1; // normalize only when channels would clip
  const to255 = (v) => Math.round(clamp(v * n * bri, 0, 1) * 255);
  return [to255(R), to255(G), to255(B)];
}

// ---------- bulb registry ----------

const ls = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let bulbs = (ls.get('bulbs', [
  { id: 'sim-desk', name: 'Desk (sim)', transport: 'sim', url: null },
  { id: 'sim-bed', name: 'Bedroom (sim)', transport: 'sim', url: null },
])).filter((b) => (b.transport ?? (b.url ? 'http' : 'sim')) !== 'http'); // HTTP transport removed
let selected = bulbs[0]?.id ?? null;
const devices = new Map();
let hub = null;               // MQTT broker connection (null until connected)
const sessionBulbs = [];      // bulbs discovered via MQTT — not persisted

function deviceFor(bulb) {
  const transport = bulb.transport ?? 'sim';
  if (transport === 'mqtt') {
    const d = devices.get(bulb.id);
    if (!d) throw new Error('mqtt not connected');
    return d;
  }
  if (!devices.has(bulb.id)) {
    if (transport === 'serial') {
      // pre-connected via the Connect USB button
      throw new Error('serial not connected');
    }
    devices.set(bulb.id, createSimDevice(`sim:${bulb.id}`));
  }
  return devices.get(bulb.id);
}

function allBulbs() { return [...bulbs, ...sessionBulbs]; }

function deviceLabel(dev) {
  return dev.kind === 'sim' ? 'simulator'
    : dev.kind === 'serial' ? 'USB serial'
    : dev.kind === 'mqtt' ? 'MQTT'
    : 'device';
}

function targets() {
  if (selected === 'all') return allBulbs();
  const b = allBulbs().find((x) => x.id === selected);
  return b ? [b] : [];
}

// ---------- UI state ----------

// hue/saturation are app-level picker state; everything else comes from the device.
const ui = { h: 210, s: 80 };
let view = { ...DEFAULT_STATE }; // last known state of the selection
let pending = null;
let flushTimer = null;

const CHANNELS = ['r', 'g', 'b', 'ww', 'cw'];
let enabled = new Set(CHANNELS); // channels the selected device reports as wired

function applyAvailability() {
  const color = enabled.has('r') && enabled.has('g') && enabled.has('b');
  const map = [
    ['hue', color], ['sat', color],
    ['ww', enabled.has('ww')], ['cw', enabled.has('cw')],
  ];
  for (const [id, ok] of map) {
    const el = $(`#${id}`);
    el.disabled = !ok;
    el.closest('.ctl').classList.toggle('disabled', !ok);
  }
}

function renderChips() {
  const el = $('#deviceChips');
  el.innerHTML = '';
  const mk = (id, name) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (selected === id ? ' active' : '');
    chip.textContent = name;
    chip.onclick = () => select(id);
    el.appendChild(chip);
  };
  mk('all', 'All bulbs');
  allBulbs().forEach((b) => mk(b.id, b.name));
  const sb = $('#connectSerial');
  if (sb) sb.textContent = devices.has('esp32-usb') ? 'Disconnect USB' : 'Connect USB (ESP32)';
  const bb = $('#connectBroker');
  if (bb) bb.textContent = hub ? 'Disconnect broker' : 'Connect broker';
}

function render() {
  const [r, g, b] = previewColor(view);
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  $('#bulb').style.background = `rgb(${r},${g},${b})`;
  $('#bulbGlow').style.filter = view.on && view.brightness > 0
    ? `drop-shadow(0 0 ${40 + view.brightness * 0.8}px rgba(${r},${g},${b},0.55))`
    : 'none';
  $('#bulbName').textContent = selected === 'all' ? 'All bulbs (broadcast)' : (allBulbs().find((x) => x.id === selected)?.name ?? '—');
  $('#powerBtn').classList.toggle('on', !!view.on);
  $('#powerBtn').textContent = view.on ? '⏻' : '○';
  $('#brightness').value = view.brightness;
  $('#ww').value = view.ww ?? 0;
  $('#cw').value = view.cw ?? 0;
  $('#brightnessVal').textContent = `${view.brightness}%`;
  $('#wwVal').textContent = `${view.ww ?? 0}%`;
  $('#cwVal').textContent = `${view.cw ?? 0}%`;
  $('#hueVal').textContent = `${ui.h}°`;
  $('#satVal').textContent = `${ui.s}%`;
  $('#hue').value = ui.h;
  $('#sat').value = ui.s;
  $('#colorReadout').textContent = `${hex}  rgb(${r}, ${g}, ${b})`;

  const bars = $('#channelBars');
  bars.innerHTML = '';
  for (const k of CHANNELS.filter((c) => enabled.has(c))) {
    const wrap = document.createElement('div');
    wrap.className = 'chbar';
    wrap.innerHTML = `<div>${k.toUpperCase()}</div><div class="track"><div class="fill" style="height:${view[k] ?? 0}%"></div></div>`;
    bars.appendChild(wrap);
  }
}

function setStatus(kind, text) {
  const el = $('#connStatus');
  el.className = `status ${kind}`;
  el.textContent = text;
}

async function select(id) {
  selected = id;
  renderChips();
  const ts = targets();
  if (!ts.length) return;
  const dev = deviceFor(ts[0]);
  const label = deviceLabel(dev);
  setStatus('idle', label);
  try {
    const res = await dev.getState();
    const { channels, ...st } = res;
    view = st;
    enabled = new Set(channels ?? CHANNELS);
    applyAvailability();
    if (ts.length === 1) {
      const { h, s } = rgbToHsv(view.r ?? 100, view.g ?? 100, view.b ?? 100);
      ui.h = h; ui.s = s;
    }
    setStatus('ok', dev.kind === 'sim' ? label : `${label} — connected`);
  } catch (e) {
    view = { ...DEFAULT_STATE };
    enabled = new Set(CHANNELS);
    applyAvailability();
    setStatus('err', `${label} — unreachable`);
  }
  render();
}

// Optimistic local update + debounced push to the device(s).
function push(patch) {
  view = { ...view, ...patch };
  render();
  pending = { ...pending, ...patch };
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 80);
}

async function flush() {
  if (!pending) return;
  const p = pending;
  pending = null;
  for (const b of targets()) {
    try {
      const st = await deviceFor(b).setState(p);
      if (b.id === selected && selected !== 'all') view = st;
    } catch {
      setStatus('err', `${b.name} — update failed`);
    }
  }
  render();
}

// ---------- wiring ----------

function bindRange(id, key, transform = (v) => +v) {
  const el = $(`#${id}`);
  el.addEventListener('input', () => {
    const v = transform(el.value);
    if (id === 'hue') ui.h = v; else if (id === 'sat') ui.s = v;
    if (id === 'hue' || id === 'sat') {
      const [r, g, b] = hsvToChannels(ui.h, ui.s);
      push({ r, g, b });
    } else {
      push({ [key]: v });
    }
  });
}

bindRange('brightness', 'brightness');
bindRange('ww', 'ww');
bindRange('cw', 'cw');
bindRange('hue', null);
bindRange('sat', null);

$('#powerBtn').onclick = () => push({ on: !view.on });

const serialBtn = $('#connectSerial');
if ('serial' in navigator) {
  serialBtn.onclick = async () => {
    if (devices.has('esp32-usb')) {
      try { await devices.get('esp32-usb').close(); } catch {}
      devices.delete('esp32-usb');
      bulbs = bulbs.filter((b) => b.id !== 'esp32-usb');
      ls.set('bulbs', bulbs);
      renderChips();
      select(bulbs[0]?.id ?? 'all');
      return;
    }
    serialBtn.disabled = true;
    try {
      const dev = await createSerialDevice();
      const id = 'esp32-usb';
      devices.set(id, dev);
      if (!bulbs.some((b) => b.id === id)) {
        bulbs.push({ id, name: 'ESP32 (USB)', transport: 'serial', url: null });
        ls.set('bulbs', bulbs);
      }
      renderChips();
      await select(id);
    } catch {
      setStatus('err', 'USB connect failed');
    } finally {
      serialBtn.disabled = false;
    }
  };
} else {
  serialBtn.style.display = 'none';
}

const brokerBtn = $('#connectBroker');
const brokerUrlEl = $('#brokerUrl');
brokerUrlEl.value = ls.get('brokerUrl', 'ws://localhost:9001');
brokerBtn.onclick = async () => {
  if (hub) {
    try { hub.client.end(); } catch {}
    hub = null;
    sessionBulbs.length = 0;
    renderChips();
    select(bulbs[0]?.id ?? 'all');
    return;
  }
  brokerBtn.disabled = true;
  try {
    hub = await connectMqttHub(brokerUrlEl.value.trim() || 'ws://localhost:9001');
    ls.set('brokerUrl', brokerUrlEl.value.trim());
    hub.onState((id) => {
      if (sessionBulbs.some((b) => b.bulbId === id)) return;
      const entry = { id: `mqtt:${id}`, name: id, transport: 'mqtt', bulbId: id };
      sessionBulbs.push(entry);
      devices.set(entry.id, hub.deviceFor(id));
      renderChips();
    });
    renderChips();
    setStatus('ok', 'broker connected');
  } catch {
    setStatus('err', 'broker unreachable');
    hub = null;
  } finally {
    brokerBtn.disabled = false;
  }
};

renderChips();
select(selected);
