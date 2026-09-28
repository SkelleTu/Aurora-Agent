import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InferenceClient } from '@huggingface/inference';
import { createAIProvider } from './providers/index.mjs';
import { createAuroraCore } from './agent/core.mjs';
import { HUGGING_FACE_TASKS, AURORA_MODEL_PROFILES } from './providers/huggingface-capabilities.mjs';

const port = Number(process.env.PORT || process.env.AURORA_PORT || 8787);
const webRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const provider = createAIProvider();
const aurora = createAuroraCore({ provider });
const HF_TOKEN = process.env.HF_TOKEN;
const HF_STT_MODEL = process.env.HF_STT_MODEL ?? 'openai/whisper-large-v3';
const HF_TTS_MODEL = process.env.HF_TTS_MODEL ?? 'espnet/kan-bayashi_ljspeech_vits';
const HF_TTS_PROVIDER = process.env.HF_TTS_PROVIDER || undefined;
const hf = HF_TOKEN ? new InferenceClient(HF_TOKEN) : null;

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
async function readBuffer(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
async function readJson(req) { const buffer = await readBuffer(req); if (!buffer.length) return {}; return JSON.parse(buffer.toString('utf8')); }
function requireHF() { if (!hf) throw new Error('HF_TOKEN is required for Hugging Face voice features.'); }

async function transcribe(req) {
  requireHF();
  const data = await readBuffer(req);
  const result = await hf.automaticSpeechRecognition({ model: HF_STT_MODEL, data });
  return { text: result.text ?? '' };
}

async function synthesize(text) {
  requireHF();
  const options = HF_TTS_PROVIDER ? { provider: HF_TTS_PROVIDER } : undefined;
  const audio = await hf.textToSpeech({ model: HF_TTS_MODEL, inputs: text }, options);
  return { buffer: Buffer.from(await audio.arrayBuffer()), contentType: audio.type || 'audio/wav' };
}

function serveWeb(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(join(webRoot, relative));
  const candidate = safePath.startsWith(webRoot) ? safePath : join(webRoot, 'index.html');
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(webRoot, 'index.html');
  if (!existsSync(file)) return json(res, 503, { error: 'web_build_missing' });
  res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, {
      ok: true, agent: 'aurora', version: '0.7.0', provider: provider.name, model: provider.model,
      configured: provider.configured ?? true, voice: Boolean(HF_TOKEN), web: existsSync(join(webRoot, 'index.html')),
      architecture: { reasoning: 'huggingface', capabilities: 'huggingface', voice: 'huggingface', tools: 'aurora-system' },
      voiceModels: { stt: HF_STT_MODEL, tts: HF_TTS_MODEL },
      modelProfiles: AURORA_MODEL_PROFILES,
      capabilities: Object.keys(HUGGING_FACE_TASKS),
    });
    if (req.method === 'GET' && req.url === '/api/huggingface/models') {
      if (!provider.listChatModels) return json(res, 501, { error: 'model_catalog_unavailable' });
      return json(res, 200, await provider.listChatModels());
    }
    if (req.method === 'GET' && req.url.startsWith('/api/huggingface/hub-models')) {
      if (!provider.listHubModels) return json(res, 501, { error: 'hub_catalog_unavailable' });
      const url = new URL(req.url, 'http://localhost');
      return json(res, 200, await provider.listHubModels({ task: url.searchParams.get('task') || undefined, provider: url.searchParams.get('provider') || 'all', limit: Math.min(Number(url.searchParams.get('limit') || 100), 500) }));
    }
    if (req.method === 'POST' && req.url === '/api/session') return json(res, 200, { sessionId: crypto.randomUUID(), status: 'ready' });
    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = await readJson(req);
      const result = await aurora.handleMessage({ sessionId: body.sessionId, message: body.message, signal: req.signal });
      return json(res, 200, { ...result, events: [
        { type: 'agent.message', timestamp: new Date().toISOString(), payload: { text: result.message } },
        ...result.actions.map((action) => ({ type: 'agent.action', timestamp: new Date().toISOString(), payload: action })),
      ] });
    }
    if (req.method === 'POST' && req.url === '/api/transcribe') return json(res, 200, await transcribe(req));
    if (req.method === 'POST' && req.url === '/api/tts') {
      const body = await readJson(req); const audio = await synthesize(String(body.text ?? '').trim());
      res.writeHead(200, { 'content-type': audio.contentType, 'cache-control': 'no-store' }); return res.end(audio.buffer);
    }
    if (req.method === 'GET') return serveWeb(req, res);
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[Aurora]', error);
    return json(res, 500, { error: 'aurora_request_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Aurora backend listening on port ${port}`));
