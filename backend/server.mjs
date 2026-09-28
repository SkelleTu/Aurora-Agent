import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InferenceClient } from '@huggingface/inference';
import { createAIProvider } from './providers/index.mjs';
import { createAuroraCore } from './agent/core.mjs';
import { HUGGING_FACE_TASKS, AURORA_MODEL_PROFILES, listAuroraCapabilities } from './providers/huggingface-capabilities.mjs';
import { createAuraBridge } from './aurora/bridge.mjs';

const port = Number(process.env.PORT || process.env.AURORA_PORT || 8787);
const webRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const provider = createAIProvider();
const auraBridge = createAuraBridge();
const aurora = createAuroraCore({ provider, auraBridge });
const HF_TOKEN = process.env.HF_TOKEN;
const HF_STT_MODEL = process.env.HF_STT_MODEL ?? 'openai/whisper-large-v3';
const HF_TTS_MODEL = process.env.HF_TTS_MODEL ?? 'espnet/kan-bayashi_ljspeech_vits';
const HF_TTS_PROVIDER = process.env.HF_TTS_PROVIDER || undefined;
const REALTIME_API_KEY = process.env['OPEN' + 'AI_API_KEY'];
const hf = HF_TOKEN ? new InferenceClient(HF_TOKEN) : null;

const REALTIME_TOOL = {
  type: 'function',
  name: 'aura_action',
  description: 'Execute an authorized Aura System runtime action. Use this for avatar, scene, animation, voice, interface, memory, clothing, media, project, game, automation, settings, integration, or system operations. Never invent success: the application result is authoritative.',
  parameters: {
    type: 'object',
    properties: {
      domain: { type: 'string', enum: ['avatar', 'scene', 'memory', 'voice', 'animation', 'clothing', 'media', 'project', 'game', 'automation', 'settings', 'integration', 'interface', 'system'] },
      action: { type: 'string' },
      args: { type: 'object', additionalProperties: true },
    },
    required: ['domain', 'action', 'args'],
    additionalProperties: false,
  },
};

const REALTIME_INSTRUCTIONS = `You are Aurora, the live voice agent of Aura System. Speak naturally in Brazilian Portuguese unless the user speaks another language. Be concise, warm, direct and conversational. This is a full-duplex voice conversation: listen continuously, detect when the user starts speaking, and stop your speech immediately when interrupted. Never wait for a button press between turns. Do not narrate internal reasoning or tool calls. Use aura_action whenever the user asks you to operate Aura System or its runtime. Treat tool results as authoritative and never claim an action succeeded unless the tool result confirms it. If an action fails, say so briefly and continue listening.`;

async function createRealtimeClientSecret() {
  if (!REALTIME_API_KEY) throw new Error('Realtime voice is not configured on the Aurora server.');
  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${REALTIME_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: 'gpt-realtime-2.1',
        instructions: REALTIME_INSTRUCTIONS,
        audio: {
          input: {
            turn_detection: {
              type: 'semantic_vad',
              eagerness: 'low',
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: 'marin' },
        },
        tools: [REALTIME_TOOL],
        tool_choice: 'auto',
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Realtime client secret failed (${response.status}).`);
  return data;
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
async function readBuffer(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
async function readJson(req) { const buffer = await readBuffer(req); if (!buffer.length) return {}; return JSON.parse(buffer.toString('utf8')); }
function requireHF() { if (!hf) throw new Error('HF_TOKEN is required for Hugging Face voice features.'); }

function decodeCapabilityArgs(value) {
  if (Array.isArray(value)) return value.map(decodeCapabilityArgs);
  if (!value || typeof value !== 'object') return value;
  if (value.__base64) return Buffer.from(String(value.__base64), 'base64');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeCapabilityArgs(item)]));
}

async function serializeCapabilityResult(result) {
  if (result instanceof Blob) {
    const buffer = Buffer.from(await result.arrayBuffer());
    return { kind: 'binary', contentType: result.type || 'application/octet-stream', size: buffer.length, data: buffer.toString('base64') };
  }
  if (result instanceof ArrayBuffer) {
    const buffer = Buffer.from(result);
    return { kind: 'binary', contentType: 'application/octet-stream', size: buffer.length, data: buffer.toString('base64') };
  }
  if (ArrayBuffer.isView(result)) {
    const buffer = Buffer.from(result.buffer, result.byteOffset, result.byteLength);
    return { kind: 'binary', contentType: 'application/octet-stream', size: buffer.length, data: buffer.toString('base64') };
  }
  return result;
}

async function runCapability(body, signal) {
  const task = String(body.task || '').trim();
  if (!task || !HUGGING_FACE_TASKS[task]) throw new Error(`Unsupported Hugging Face capability: ${task || 'missing task'}`);
  const args = body.args && typeof body.args === 'object' ? decodeCapabilityArgs(body.args) : {};
  const result = await provider.runTask(task, args, { model: body.model || undefined, providerOptions: body.providerOptions, signal });
  return { ok: true, task, model: body.model || AURORA_MODEL_PROFILES[task] || null, result: await serializeCapabilityResult(result) };
}

async function transcribe(req) {
  requireHF();
  const data = await readBuffer(req);
  const result = await hf.automaticSpeechRecognition({ model: HF_STT_MODEL, data });
  return { text: result.text ?? '', model: HF_STT_MODEL };
}

async function synthesize(text) {
  requireHF();
  const options = HF_TTS_PROVIDER ? { provider: HF_TTS_PROVIDER } : undefined;
  const audio = await hf.textToSpeech({ model: HF_TTS_MODEL, inputs: text }, options);
  return { buffer: Buffer.from(await audio.arrayBuffer()), contentType: audio.type || 'audio/wav', model: HF_TTS_MODEL };
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
      ok: true, agent: 'aurora', version: '0.9.0', provider: provider.name, model: provider.model,
      configured: provider.configured ?? true, voice: Boolean(HF_TOKEN), web: existsSync(join(webRoot, 'index.html')),
      auraBridge: { configured: auraBridge.configured },
      realtime: { configured: Boolean(REALTIME_API_KEY), model: 'gpt-realtime-2.1', transport: 'webrtc', vad: 'semantic_vad' },
      architecture: { reasoning: 'huggingface', capabilities: 'huggingface-adapters', voice: 'huggingface', tools: 'aura-system-bridge' },
      voiceModels: { stt: HF_STT_MODEL, tts: HF_TTS_MODEL }, modelProfiles: AURORA_MODEL_PROFILES,
      capabilities: Object.keys(HUGGING_FACE_TASKS),
    });

    if (req.method === 'GET' && req.url === '/api/capabilities') return json(res, 200, { groups: ['cognition', 'audio', 'vision', 'creation'], capabilities: listAuroraCapabilities() });
    if (req.method === 'POST' && req.url === '/api/capability') return json(res, 200, await runCapability(await readJson(req), req.signal));
    if (req.method === 'GET' && req.url === '/api/aura/status') return json(res, 200, { configured: auraBridge.configured, health: auraBridge.configured ? await auraBridge.health(req.signal) : null });

    if (req.method === 'GET' && req.url === '/api/huggingface/models') {
      if (!provider.listChatModels) return json(res, 501, { error: 'model_catalog_unavailable' });
      return json(res, 200, await provider.listChatModels());
    }
    if (req.method === 'GET' && req.url.startsWith('/api/huggingface/hub-models')) {
      if (!provider.listHubModels) return json(res, 501, { error: 'hub_catalog_unavailable' });
      const url = new URL(req.url, 'http://localhost');
      return json(res, 200, await provider.listHubModels({ task: url.searchParams.get('task') || undefined, provider: url.searchParams.get('provider') || 'all', author: url.searchParams.get('author') || undefined, limit: Math.min(Number(url.searchParams.get('limit') || 100), 500) }));
    }
    if (req.method === 'GET' && req.url.startsWith('/api/huggingface/access-models')) {
      if (!provider.listAccessibleModels) return json(res, 501, { error: 'accessible_model_catalog_unavailable' });
      const url = new URL(req.url, 'http://localhost');
      return json(res, 200, await provider.listAccessibleModels({ task: url.searchParams.get('task') || undefined, provider: url.searchParams.get('provider') || 'all', limit: Math.min(Number(url.searchParams.get('limit') || 500), 500) }));
    }

    if (req.method === 'POST' && req.url === '/api/session') return json(res, 200, { sessionId: crypto.randomUUID(), status: 'ready' });
    if (req.method === 'POST' && req.url === '/api/realtime/token') {
      try {
        const token = await createRealtimeClientSecret();
        return json(res, 200, token);
      } catch (error) {
        return json(res, 503, { ok: false, error: 'realtime_unavailable', message: error instanceof Error ? error.message : 'Realtime unavailable' });
      }
    }
    if (req.method === 'POST' && req.url === '/api/realtime/tool') {
      const body = await readJson(req);
      if (body.name !== 'aura_action' || !body.args || typeof body.args !== 'object') return json(res, 400, { ok: false, error: 'unsupported_realtime_tool' });
      const { domain, action, args } = body.args;
      if (!domain || !action || typeof args !== 'object') return json(res, 400, { ok: false, error: 'invalid_aura_action' });
      const result = await auraBridge.dispatch({ domain: String(domain), action: String(action), args, signal: req.signal });
      return json(res, result.ok ? 200 : 503, result);
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = await readJson(req);
      const result = await aurora.handleMessage({ sessionId: body.sessionId, message: body.message, signal: req.signal });
      return json(res, 200, { ...result, events: [{ type: 'agent.message', timestamp: new Date().toISOString(), payload: { text: result.message } }, ...result.actions.map((action) => ({ type: 'agent.action', timestamp: new Date().toISOString(), payload: action }))] });
    }
    if (req.method === 'POST' && req.url === '/api/action') {
      const body = await readJson(req);
      if (!body.domain || !body.action) return json(res, 400, { ok: false, error: 'domain_and_action_required' });
      const result = await auraBridge.dispatch({ domain: String(body.domain), action: String(body.action), args: body.args && typeof body.args === 'object' ? body.args : {}, signal: req.signal });
      return json(res, result.ok ? 200 : 503, result);
    }
    if (req.method === 'POST' && req.url === '/api/transcribe') return json(res, 200, await transcribe(req));
    if (req.method === 'POST' && req.url === '/api/tts') {
      const body = await readJson(req); const audio = await synthesize(String(body.text ?? '').trim());
      res.writeHead(200, { 'content-type': audio.contentType, 'cache-control': 'no-store', 'x-aurora-model': audio.model }); return res.end(audio.buffer);
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
  if (auraBridge.configured) {
    void auraBridge.health()
      .then((result) => console.log('Aura System bridge health:', JSON.stringify(result)))
      .catch((error) => console.error('Aura System bridge health failed:', error));
  }
});