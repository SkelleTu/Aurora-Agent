import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InferenceClient } from '@huggingface/inference';
import { WebSocketServer } from 'ws';
import { AuroraLiveSession } from './live/engine.mjs';
import { GeminiLiveAdapter } from './live/gemini-live.mjs';
import { OpenAILiveAdapter } from './live/openai-live.mjs';
import { getLiveDiagnostics, recordLiveTelemetry, markLiveSessionInactive } from './live/telemetry.mjs';
import { createAIProvider } from './providers/index.mjs';
import { createAuroraCore } from './agent/core.mjs';
import { HUGGING_FACE_TASKS, AURORA_MODEL_PROFILES, listAuroraCapabilities } from './providers/huggingface-capabilities.mjs';
import { createAuraBridge } from './aurora/bridge.mjs';
import { handleAuroraMcp } from './aurora/mcp.mjs';

const port = Number(process.env.PORT || process.env.AURORA_PORT || 8787);
const webRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const provider = createAIProvider();
const auraBridge = createAuraBridge();
const aurora = createAuroraCore({ provider, auraBridge });
const HF_TOKEN = process.env.HF_TOKEN;
const hf = HF_TOKEN ? new InferenceClient(HF_TOKEN) : null;
const HF_STT_MODEL = process.env.HF_STT_MODEL ?? 'openai/whisper-large-v3';
const HF_TTS_MODEL = process.env.HF_TTS_MODEL ?? 'facebook/mms-tts-por';
const HF_TTS_FALLBACK_MODEL = process.env.HF_TTS_FALLBACK_MODEL || 'facebook/mms-tts-por';
const HF_TTS_PROVIDER = process.env.HF_TTS_PROVIDER || undefined;
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE || 'pt-BR';
const LIVE_LANGUAGE = process.env.AURORA_LIVE_LANGUAGE || 'pt-BR';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_LIVE_MODEL = process.env.OPENAI_LIVE_MODEL || 'gpt-realtime-2.1';
const OPENAI_LIVE_VOICE = process.env.OPENAI_LIVE_VOICE || 'cedar';
const LIVE_PROVIDER = String(process.env.AURORA_LIVE_PROVIDER || (OPENAI_API_KEY ? 'openai' : GOOGLE_API_KEY ? 'gemini' : 'huggingface')).toLowerCase();
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

function wavDurationMs(buffer) {
  try {
    if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return 0;
    const byteRate = buffer.readUInt32LE(28);
    return byteRate ? Math.round(((buffer.length - 44) / byteRate) * 1000) : 0;
  } catch { return 0; }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function readBuffer(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
async function readJson(req) { const buffer = await readBuffer(req); if (!buffer.length) return {}; return JSON.parse(buffer.toString('utf8')); }
function requireHF() { if (!hf) throw new Error('HF_TOKEN is required for Hugging Face voice features.'); }

function audioBlob(buffer) {
  const value = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const contentType = value.length >= 4 && value.toString('ascii', 0, 4) === 'RIFF' ? 'audio/wav' : 'audio/mpeg';
  return new Blob([value], { type: contentType });
}

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
  const result = await hf.automaticSpeechRecognition({ model: HF_STT_MODEL, data: audioBlob(data) });
  return { text: result.text ?? '', model: HF_STT_MODEL };
}

async function googleTranslateTts(text, signal) {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    client: 'tw-ob',
    tl: GOOGLE_TTS_VOICE,
    q: String(text),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(`https://translate.google.com/translate_tts?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`Google TTS HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('Google TTS returned empty audio');
    return { buffer, contentType: response.headers.get('content-type') || 'audio/mpeg', model: 'google-translate-tts', durationMs: 0, engine: 'google-translate' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function synthesize(text, signal) {
  const value = String(text || '').trim();
  if (!value) throw new Error('TTS text is empty');
  let lastError = null;
  if (hf) {
    const models = [...new Set([HF_TTS_MODEL, HF_TTS_FALLBACK_MODEL].filter(Boolean))];
    for (const model of models) {
      try {
        if (signal?.aborted) throw new Error('TTS request aborted');
        const options = HF_TTS_PROVIDER ? { provider: HF_TTS_PROVIDER, signal } : { signal };
        const audio = await hf.textToSpeech({ model, inputs: value }, options);
        const buffer = Buffer.from(await audio.arrayBuffer());
        if (!buffer.length) throw new Error('TTS returned empty audio');
        return { buffer, contentType: audio.type || 'audio/wav', model, durationMs: wavDurationMs(buffer), engine: 'huggingface' };
      } catch (error) { lastError = error; }
    }
  }
  try {
    if (signal?.aborted) throw new Error('TTS request aborted');
    return await googleTranslateTts(value, signal);
  } catch (error) {
    lastError = error;
  }
  throw new Error(`TTS unavailable: ${lastError?.message || 'all configured engines failed'}`);
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
    const requestUrl = new URL(req.url, 'http://localhost');
    if (requestUrl.pathname === '/mcp' || requestUrl.pathname === '/.well-known/oauth-protected-resource') {
      const handled = await handleAuroraMcp(req, res);
      if (handled) return;
    }
    if (req.method === 'GET' && requestUrl.pathname === '/health') return json(res, 200, {
      ok: true, agent: 'aurora', version: '0.9.0', provider: provider.name, model: provider.model,
      configured: provider.configured ?? true, voice: Boolean(HF_TOKEN), web: existsSync(join(webRoot, 'index.html')),
      auraBridge: { configured: auraBridge.configured },
      live: { availableVoices: ['cedar', 'marin'], configured: LIVE_PROVIDER === 'openai' ? Boolean(OPENAI_API_KEY) : LIVE_PROVIDER === 'gemini' ? Boolean(GOOGLE_API_KEY) : Boolean(HF_TOKEN), provider: LIVE_PROVIDER, transport: 'websocket', vad: LIVE_PROVIDER === 'openai' || LIVE_PROVIDER === 'gemini' ? 'provider_realtime' : 'client_energy', model: LIVE_PROVIDER === 'openai' ? OPENAI_LIVE_MODEL : LIVE_PROVIDER === 'gemini' ? GEMINI_LIVE_MODEL : provider.model, nativeAudio: LIVE_PROVIDER === 'openai' || LIVE_PROVIDER === 'gemini', language: LIVE_LANGUAGE, voice: LIVE_PROVIDER === 'openai' ? OPENAI_LIVE_VOICE : null },
      architecture: { reasoning: 'huggingface', capabilities: 'huggingface-adapters', voice: 'huggingface', tools: 'aura-system-bridge' },
      voiceModels: { stt: HF_STT_MODEL, tts: HF_TTS_MODEL }, modelProfiles: AURORA_MODEL_PROFILES, capabilities: Object.keys(HUGGING_FACE_TASKS),
    });
    if (req.method === 'GET' && requestUrl.pathname === '/api/live/diagnostics') return json(res, 200, getLiveDiagnostics(requestUrl.searchParams.get('sessionId')));
    if (req.method === 'GET' && requestUrl.pathname === '/api/aura/diagnostics') return json(res, 200, await auraBridge.diagnostics(requestUrl.searchParams.get('traceId'), req.signal));
    if (req.method === 'GET' && requestUrl.pathname === '/api/capabilities') return json(res, 200, { groups: ['cognition', 'audio', 'vision', 'creation'], capabilities: listAuroraCapabilities() });
    if (req.method === 'POST' && requestUrl.pathname === '/api/capability') return json(res, 200, await runCapability(await readJson(req), req.signal));
    if (req.method === 'GET' && requestUrl.pathname === '/api/aura/status') return json(res, 200, { configured: auraBridge.configured, health: auraBridge.configured ? await auraBridge.health(req.signal) : null });
    if (req.method === 'POST' && requestUrl.pathname === '/api/diagnostics/test') {
      const body = await readJson(req);
      const sessionId = String(body.sessionId || crypto.randomUUID());
      const type = String(body.type || 'DIAGNOSTIC_TEST');
      recordLiveTelemetry('TEST_START', sessionId, { type });
      const result = type === 'AURA_HEALTH' ? await auraBridge.health(req.signal) : type === 'AURA_DIAGNOSTICS' ? await auraBridge.diagnostics(body.traceId, req.signal) : { ok: true, message: 'telemetry pipeline reachable' };
      recordLiveTelemetry('TEST_END', sessionId, { type, ok: result?.ok !== false });
      return json(res, result?.ok === false ? 503 : 200, { sessionId, type, result, diagnostics: getLiveDiagnostics(sessionId) });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/huggingface/models') {
      if (!provider.listChatModels) return json(res, 501, { error: 'model_catalog_unavailable' });
      return json(res, 200, await provider.listChatModels());
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/huggingface/hub-models') {
      if (!provider.listHubModels) return json(res, 501, { error: 'hub_catalog_unavailable' });
      return json(res, 200, await provider.listHubModels({ task: requestUrl.searchParams.get('task') || undefined, provider: requestUrl.searchParams.get('provider') || 'all', author: requestUrl.searchParams.get('author') || undefined, limit: Math.min(Number(requestUrl.searchParams.get('limit') || 100), 500) }));
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/huggingface/access-models') {
      if (!provider.listAccessibleModels) return json(res, 501, { error: 'accessible_model_catalog_unavailable' });
      return json(res, 200, await provider.listAccessibleModels({ task: requestUrl.searchParams.get('task') || undefined, provider: requestUrl.searchParams.get('provider') || 'all', limit: Math.min(Number(requestUrl.searchParams.get('limit') || 500), 500) }));
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/session') return json(res, 200, { sessionId: crypto.randomUUID(), status: 'ready' });
    if (req.method === 'POST' && requestUrl.pathname === '/api/chat') {
      const body = await readJson(req); const result = await aurora.handleMessage({ sessionId: body.sessionId, message: body.message, signal: req.signal });
      return json(res, 200, { ...result, events: [{ type: 'agent.message', timestamp: new Date().toISOString(), payload: { text: result.message } }, ...result.actions.map((action) => ({ type: 'agent.action', timestamp: new Date().toISOString(), payload: action }))] });
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/action') {
      const body = await readJson(req); if (!body.domain || !body.action) return json(res, 400, { ok: false, error: 'domain_and_action_required' });
      const result = await auraBridge.dispatch({ domain: String(body.domain), action: String(body.action), args: body.args && typeof body.args === 'object' ? body.args : {}, signal: req.signal });
      return json(res, result.ok ? 200 : 503, result);
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/transcribe') return json(res, 200, await transcribe(req));
    if (req.method === 'POST' && requestUrl.pathname === '/api/tts') {
      const body = await readJson(req); const audio = await synthesize(String(body.text ?? '').trim(), req.signal);
      res.writeHead(200, { 'content-type': audio.contentType, 'cache-control': 'no-store', 'x-aurora-model': audio.model }); return res.end(audio.buffer);
    }
    if (req.method === 'GET') return serveWeb(req, res);
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[Aurora]', error); return json(res, 500, { error: 'aurora_request_failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const liveWss = new WebSocketServer({ server, path: '/api/live' });
liveWss.on('connection', (socket) => {
  const sessionId = crypto.randomUUID();
  recordLiveTelemetry('LIVE_CONNECT', sessionId, { provider: LIVE_PROVIDER, model: LIVE_PROVIDER === 'openai' ? OPENAI_LIVE_MODEL : LIVE_PROVIDER === 'gemini' ? GEMINI_LIVE_MODEL : provider.model });
  const liveAdapterFactory = LIVE_PROVIDER === 'openai'
    ? ({ model, language, voice }) => new OpenAILiveAdapter({ apiKey: OPENAI_API_KEY, model: model || OPENAI_LIVE_MODEL, language, voice: voice || OPENAI_LIVE_VOICE, auraBridge, sessionId })
    : LIVE_PROVIDER === 'gemini'
      ? ({ model, language }) => new GeminiLiveAdapter({ apiKey: GOOGLE_API_KEY, model: model || GEMINI_LIVE_MODEL, language, auraBridge, sessionId })
      : null;
  const live = new AuroraLiveSession({
    provider, realtimeAdapterFactory: liveAdapterFactory, auraBridge, sessionId,
    model: LIVE_PROVIDER === 'openai' ? OPENAI_LIVE_MODEL : LIVE_PROVIDER === 'gemini' ? GEMINI_LIVE_MODEL : provider.model,
    transcribe: async (pcm, signal) => { requireHF(); const result = await hf.automaticSpeechRecognition({ model: HF_STT_MODEL, data: audioBlob(pcm) }, { signal }); return { text: result.text ?? '', model: HF_STT_MODEL }; },
    synthesize: async (text, signal) => synthesize(text, signal),
    send: (event) => { recordLiveTelemetry(event.type, sessionId, event); if (socket.readyState === 1) socket.send(JSON.stringify(event)); },
  });
  socket.on('message', (raw, isBinary) => {
    try {
      if (isBinary) { recordLiveTelemetry('AUDIO_RECEIVED', sessionId, { bytes: raw.length }); return live.audio(Buffer.from(raw)); }
      const event = JSON.parse(String(raw)); recordLiveTelemetry(event.type || 'CLIENT_EVENT', sessionId, { keys: Object.keys(event) });
      switch (event.type) {
        case 'session.configure': void live.configure(event).catch((error) => { recordLiveTelemetry('SESSION_CONFIG_ERROR', sessionId, { error: error?.message || String(error) }); if (socket.readyState === 1) socket.send(JSON.stringify({ type:'error', error:error instanceof Error ? error.message : String(error) })); }); break;
        case 'input_audio_buffer.append': recordLiveTelemetry('AUDIO_RECEIVED', sessionId, { bytes: Buffer.byteLength(String(event.data || ''), 'base64') }); live.audio(Buffer.from(String(event.data || ''), 'base64')); break;
        case 'input_audio_buffer.speech_started': live.speechStarted(); break;
        case 'input_audio_buffer.speech_stopped':
        case 'input_audio_buffer.commit': live.speechStopped(); break;
        case 'response.cancel': live.interrupt('client_cancel'); break;
        case 'output_audio_buffer.clear': live.interrupt('client_clear'); break;
        case 'playback.progress': live.playbackProgress(event.ms); break;
        case 'session.close': live.close(); socket.close(); break;
      }
    } catch (error) {
      recordLiveTelemetry('WS_HANDLER_ERROR', sessionId, { error: error?.message || String(error) });
      if (socket.readyState === 1) socket.send(JSON.stringify({ type:'error', error:error instanceof Error ? error.message : String(error) }));
    }
  });
  socket.on('close', () => { markLiveSessionInactive(sessionId, 'socket_closed'); recordLiveTelemetry('LIVE_CLOSE', sessionId, { reason: 'socket_closed' }); live.close(); });
  socket.on('error', (error) => recordLiveTelemetry('WS_ERROR', sessionId, { error: error?.message || String(error) }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Aurora backend listening on port ${port}`);
  if (auraBridge.configured) void auraBridge.health().then((result) => console.log('Aura System bridge health:', JSON.stringify(result))).catch((error) => console.error('Aura System bridge health failed:', error));
});