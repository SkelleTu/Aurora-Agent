import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAIProvider } from './providers/index.mjs';
import { createAuroraCore } from './agent/core.mjs';

const port = Number(process.env.PORT || process.env.AURORA_PORT || 8787);
const webRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const provider = createAIProvider();
const aurora = createAuroraCore({ provider });
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-transcribe';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE ?? 'alloy';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buffer = await readBuffer(req);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString('utf8'));
}

async function transcribe(req) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for voice transcription.');
  const body = await readBuffer(req);
  const upstream = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': req.headers['content-type'] ?? '' },
    body,
  });
  if (!upstream.ok) throw new Error(`OpenAI transcription failed (${upstream.status}): ${await upstream.text()}`);
  return upstream.json();
}

async function synthesize(text) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for voice synthesis.');
  const upstream = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: 'mp3' }),
  });
  if (!upstream.ok) throw new Error(`OpenAI speech failed (${upstream.status}): ${await upstream.text()}`);
  return Buffer.from(await upstream.arrayBuffer());
}

function serveWeb(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(join(webRoot, relative));
  const candidate = safePath.startsWith(webRoot) ? safePath : join(webRoot, 'index.html');
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(webRoot, 'index.html');

  if (!existsSync(file)) return json(res, 503, { error: 'web_build_missing' });

  res.writeHead(200, {
    'content-type': contentTypes[extname(file)] || 'application/octet-stream',
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, {
        ok: true,
        agent: 'aurora',
        version: '0.4.0',
        provider: provider.name,
        model: provider.model,
        configured: provider.configured ?? true,
        voice: Boolean(OPENAI_API_KEY),
        web: existsSync(join(webRoot, 'index.html')),
      });
    }

    if (req.method === 'POST' && req.url === '/api/session') {
      return json(res, 200, { sessionId: crypto.randomUUID(), status: 'ready' });
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = await readJson(req);
      const result = await aurora.handleMessage({ sessionId: body.sessionId, message: body.message, signal: req.signal });
      return json(res, 200, {
        ...result,
        events: [
          { type: 'agent.message', timestamp: new Date().toISOString(), payload: { text: result.message } },
          ...result.actions.map((action) => ({ type: 'agent.action', timestamp: new Date().toISOString(), payload: action })),
        ],
      });
    }

    if (req.method === 'POST' && req.url === '/api/transcribe') {
      return json(res, 200, await transcribe(req));
    }

    if (req.method === 'POST' && req.url === '/api/tts') {
      const body = await readJson(req);
      const audio = await synthesize(String(body.text ?? '').trim());
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
      return res.end(audio);
    }

    if (req.method === 'GET') return serveWeb(req, res);
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[Aurora]', error);
    return json(res, 500, { error: 'aurora_request_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Aurora backend listening on port ${port}`);
});
