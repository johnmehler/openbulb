import { createSerialDevice, createChannelDevice } from './devices.js';

const $ = (s) => document.querySelector(s);

// The bench ESP32 drives two single-color LEDs; each PWM channel is one
// bulb in the UI. channel = physical channel in serial.py, pseudo = the
// channel key reported by the device adapter (drives nothing but state).
const BULBS = [
  { id: 'red', name: 'Red', channel: 'ww', pseudo: 'r', tint: [1, 0.12, 0.12] },
  { id: 'blue', name: 'Blue', channel: 'cw', pseudo: 'b', tint: [0.25, 0.45, 1] },
];

const bulbs = new Map(); // id -> { def, device, state, els, pending, timer }
let serial = null;

function setStatus(kind, text) {
  const el = $('#connStatus');
  el.className = `status ${kind}`;
  el.textContent = text;
}

// ---------- bulb cards ----------

const bulbsEl = $('#bulbs');
for (const def of BULBS) {
  const card = document.createElement('div');
  card.className = 'bulb-card';
  card.innerHTML = `
    <div class="bulb"></div>
    <div class="bulb-name">${def.name}</div>
    <div class="bulb-controls">
      <button class="bulb-power" title="Power">⏻</button>
      <div class="ctl">
        <label>Brightness <span class="bulb-level"></span></label>
        <input type="range" min="0" max="100" value="0" disabled>
      </div>
    </div>`;
  const slider = card.querySelector('input');
  const power = card.querySelector('.bulb-power');
  const b = {
    def,
    device: null,
    state: { on: false, level: 0, last: 0 },
    pending: null,
    timer: null,
    els: {
      card,
      orb: card.querySelector('.bulb'),
      level: card.querySelector('.bulb-level'),
      slider,
      power,
    },
  };
  slider.addEventListener('input', () => push(b, { brightness: +slider.value }));
  power.onclick = () => {
    if (!b.device) return;
    push(b, { on: b.state.on ? false : true });
  };
  bulbsEl.appendChild(card);
  bulbs.set(def.id, b);
}

function applyState(b, st) {
  const lvl = st.brightness ?? 0;
  b.state.on = !!st.on;
  b.state.level = lvl;
  if (lvl > 0) b.state.last = lvl;
}

// Level shown on the slider: actual level when on, last level (dimmed) when off.
function shownLevel(b) {
  return b.state.on ? b.state.level : b.state.last;
}

function renderBulb(b) {
  const { card, orb, level, slider, power } = b.els;
  const lit = b.state.on ? b.state.level / 100 : 0;
  const [r, g, bl] = b.def.tint.map((v) => Math.round(v * lit * 255));
  orb.style.background = `rgb(${r},${g},${bl})`;
  orb.style.filter = lit > 0
    ? `drop-shadow(0 0 ${20 + b.state.level * 0.4}px rgba(${r},${g},${bl},0.55))`
    : '';
  card.classList.toggle('off', !b.state.on);
  power.classList.toggle('on', b.state.on);
  power.textContent = b.state.on ? '⏻' : '○';
  const disp = shownLevel(b);
  slider.value = disp;
  level.textContent = `${disp}%`;
  slider.disabled = !b.device;
}

function renderAll() { for (const b of bulbs.values()) renderBulb(b); }

// Optimistic local update + debounced push to the device.
function push(b, patch) {
  if (!b.device) return;
  b.pending = { ...b.pending, ...patch };
  if ('brightness' in patch) {
    b.state.level = patch.brightness;
    if (patch.brightness > 0) { b.state.last = patch.brightness; b.state.on = true; }
    else b.state.on = false;
  }
  if ('on' in patch) b.state.on = patch.on;
  renderBulb(b);
  clearTimeout(b.timer);
  b.timer = setTimeout(() => flush(b), 80);
}

async function flush(b) {
  const p = b.pending;
  b.pending = null;
  if (!p || !b.device) return;
  try {
    applyState(b, await b.device.setState(p));
  } catch {
    setStatus('err', `${b.def.name} — update failed`);
  }
  renderBulb(b);
}

// ---------- connect / disconnect (USB serial only) ----------

const connectBtn = $('#connectBtn');

async function disconnect() {
  for (const b of bulbs.values()) {
    b.device = null;
    b.pending = null;
    clearTimeout(b.timer);
    b.state = { on: false, level: 0, last: b.state.last };
  }
  if (serial) {
    try { await serial.close(); } catch { /* already closed */ }
    serial = null;
  }
  connectBtn.textContent = 'Connect';
  renderAll();
}

if (!('serial' in navigator)) {
  connectBtn.disabled = true;
  connectBtn.textContent = 'USB serial unsupported — use Chrome or Edge';
  setStatus('err', 'browser lacks Web Serial API');
} else {
  connectBtn.onclick = async () => {
    if (serial) {
      await disconnect();
      setStatus('idle', 'not connected');
      return;
    }
    connectBtn.disabled = true;
    try {
      serial = await createSerialDevice();
      for (const b of bulbs.values()) {
        b.device = createChannelDevice(serial, b.def.channel, b.def.pseudo);
        applyState(b, await b.device.getState());
      }
      connectBtn.textContent = 'Disconnect';
      setStatus('ok', 'USB connected');
    } catch (err) {
      console.error('USB connect failed:', err);
      await disconnect();
      const msg = err?.name === 'NotFoundError' ? 'no port selected'
        : err?.message === 'serial timeout' ? 'ESP32 not responding — is serial.py running?'
        : `USB connect failed (${err?.name || err?.message || 'unknown error'})`;
      setStatus('err', msg);
    } finally {
      connectBtn.disabled = false;
      renderAll();
    }
  };
}

// ---------- AI assistant ----------
// Natural-language commands → POST /api/interpret (tools/app-server.js) →
// OpenAI returns {reply, commands:[{bulbs, patch}]} → applied via the same
// device adapters the sliders use.

const aiLog = $('#assistantLog');
const aiForm = $('#aiForm');
const aiInput = $('#aiInput');
const aiSend = $('#aiSend');

function logAi(cls, text, cmds) {
  const el = document.createElement('div');
  el.className = `ai-msg ${cls}`;
  el.textContent = text;
  if (cmds) {
    const c = document.createElement('span');
    c.className = 'cmds';
    c.textContent = cmds;
    el.appendChild(c);
  }
  aiLog.appendChild(el);
  aiLog.scrollTop = aiLog.scrollHeight;
}

async function bulbsForAi() {
  const out = [];
  for (const b of bulbs.values()) {
    let state = null;
    if (b.device) {
      try {
        const st = await b.device.getState();
        state = { on: st.on, brightness: st.brightness };
      } catch { /* offline bulb — model still gets id+name */ }
    }
    out.push({ id: b.def.id, name: b.def.name, state });
  }
  return out;
}

function resolveAiBulbs(list) {
  const all = [...bulbs.values()];
  if (list === 'all') return all;
  if (!Array.isArray(list) || !list.length) return all;
  return all.filter((b) => list.some((x) => x === b.def.id || x === b.def.name));
}

aiForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = aiInput.value.trim();
  if (!text) return;
  aiInput.value = '';
  logAi('user', text);
  aiSend.disabled = true;
  try {
    const res = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, bulbs: await bulbsForAi() }),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`server returned non-JSON (HTTP ${res.status}) — run \`node tools/app-server.js\`, not a plain static server`);
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const summary = [];
    for (const cmd of data.commands ?? []) {
      const patch = cmd.patch ?? {};
      if (!Object.keys(patch).length) continue;
      for (const b of resolveAiBulbs(cmd.bulbs)) {
        if (!b.device) continue;
        try {
          applyState(b, await b.device.setState(patch));
          summary.push(`${b.def.name}: ${JSON.stringify(patch)}`);
        } catch {
          logAi('err', `${b.def.name} — update failed`);
        }
      }
    }
    renderAll();
    logAi('bot', data.reply || 'Done.', summary.join('  ·  ') || null);
  } catch (err) {
    logAi('err', err.message.includes('fetch')
      ? 'AI server unreachable — run `node tools/app-server.js` instead of a plain static server'
      : err.message);
  } finally {
    aiSend.disabled = false;
  }
});

renderAll();
