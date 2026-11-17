// Dev server for the web app + AI command interpreter.
//
//   node tools/app-server.js   →   http://localhost:8000
//
// Serves app/web/ statics and exposes POST /api/interpret, which turns a
// natural-language message ("turn off the blue bulb") into bulb command
// patches via OpenAI. The API key stays server-side — never ship it to the
// browser. Requires OPENAI_API_KEY in .env (repo root) or the environment.
//
// Later the same prompt/schema moves to host/nlp/ for the Phase 6 voice
// pipeline — the bulb-facing contract doesn't change.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = fileURLToPath(new URL('../app/web', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

try { process.loadEnvFile(join(REPO_ROOT, '.env')); } catch { /* env may come from the shell */ }

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PORT = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

// The bulb state contract (docs/protocol.md): partial patches merge into
// device state; {} reads. Channels are PWM intensities 0-100 multiplied by
// the master `brightness` when `on` is true.
const SYSTEM_PROMPT = `You translate natural-language light commands into structured bulb commands for a smart-bulb system.

Each bulb is a single-color LED (e.g. "Red", "Blue") whose color is fixed. Its state object is:
- on: boolean — power
- brightness: 0-100 — light level

Commands are PARTIAL PATCHES merged into each bulb's current state: fields you omit keep their previous values. Typical commands:
- on: {"on": true, "brightness": <level>} — ensure brightness > 0 when turning on (default 80) unless the user gave a level
- off: {"on": false} (or {"brightness": 0})
- dim/brighten: adjust brightness relative to the bulb's current state you are given
- set a level: {"brightness": <0-100>}

You will receive the user's message and a list of bulbs, each with {id, name, state}. Match bulb references (names, colors of bulbs like "blue bulb", "all") to the provided ids. If a reference is ambiguous or matches nothing, still produce your best guess and say so in the reply.

Respond with ONLY a JSON object:
{
  "reply": "short natural-language confirmation or answer to show the user",
  "commands": [
    { "bulbs": ["<bulb id>", ...] or "all", "patch": { ...state fields... } }
  ]
}
Use "all" for commands that clearly target every bulb. Omit commands entirely (empty array) for questions or requests that don't map to bulb changes.`;

async function interpret(body) {
  if (!OPENAI_KEY) {
    const err = new Error('OPENAI_API_KEY is not set — add it to .env');
    err.status = 503;
    throw err;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(body) },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  const text = data.choices?.[0]?.message?.content;
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('model returned malformed JSON');
    err.status = 502;
    throw err;
  }
}

function readBody(req) {
  return new Promise((res, rej) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { rej(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { res(data ? JSON.parse(data) : {}); } catch { rej(new Error('bad JSON')); }
    });
    req.on('error', rej);
  });
}

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = normalize(join(WEB_ROOT, rel));
  if (!file.startsWith(WEB_ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/interpret') {
      const body = await readBody(req);
      if (typeof body?.message !== 'string' || !body.message.trim()) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'message is required' }));
      }
      const out = await interpret(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(url.pathname, res);
    }
    res.writeHead(405); res.end();
  } catch (e) {
    res.writeHead(e.status ?? 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`bulb app → http://localhost:${PORT}`);
  console.log(`AI interpret → POST /api/interpret (${OPENAI_KEY ? `model ${OPENAI_MODEL}` : 'NO OPENAI_API_KEY — set it in .env'})`);
});
