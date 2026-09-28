import WebSocket from 'ws';

const baseUrl = String(process.env.AURORA_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('AURORA_BASE_URL is required, e.g. https://your-service.onrender.com');

const healthUrl = `${baseUrl}/health`;
const ttsUrl = `${baseUrl}/api/tts`;
const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/live`;
const GEMINI_SAMPLE_URL = 'https://storage.googleapis.com/generativeai-downloads/data/hello_are_you_there.pcm';

function wavToPcm(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer;
  const dataMarker = Buffer.from('data', 'ascii');
  const dataOffset = buffer.indexOf(dataMarker, 12);
  if (dataOffset < 0 || dataOffset + 8 > buffer.length) return buffer;
  const dataStart = dataOffset + 8;
  const dataSize = buffer.readUInt32LE(dataOffset + 4);
  return buffer.subarray(dataStart, Math.min(buffer.length, dataStart + dataSize));
}

async function fetchAudioPhrase() {
  const response = await fetch(ttsUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Teste de comunicação ao vivo.' }),
    signal: AbortSignal.timeout(20000),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !buffer.length) throw new Error(`TTS probe failed: HTTP ${response.status}`);
  return buffer;
}

async function fetchGeminiSample() {
  const response = await fetch(GEMINI_SAMPLE_URL, { signal: AbortSignal.timeout(15000) });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !buffer.length) throw new Error(`Gemini sample failed: HTTP ${response.status}`);
  return buffer;
}

async function main() {
  const report = { startedAt: new Date().toISOString(), baseUrl, checks: [] };

  const healthStarted = Date.now();
  const healthResponse = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
  const health = await healthResponse.json();
  const live = health?.live || {};
  const nativeGemini = live.provider === 'gemini' && live.nativeAudio === true;
  report.checks.push({ name: 'health', ok: healthResponse.ok && health?.ok === true && live?.configured === true, durationMs: Date.now() - healthStarted, details: { provider: live.provider, transport: live.transport, nativeAudio: live.nativeAudio, model: live.model, language: live.language } });

  const ttsStarted = Date.now();
  let audio = null;
  if (nativeGemini) {
    report.checks.push({ name: 'tts_probe', ok: true, skipped: true, durationMs: Date.now() - ttsStarted, details: { reason: 'native Gemini Live supplies response audio directly; Hugging Face TTS is not part of the Live path' } });
    try { audio = await fetchGeminiSample(); } catch (error) { report.checks.push({ name: 'live_input_fixture', ok: false, durationMs: Date.now() - ttsStarted, details: { error: error?.message || String(error) } }); }
  } else {
    try { audio = await fetchAudioPhrase(); } catch (error) {}
    report.checks.push({ name: 'tts_probe', ok: Boolean(audio?.length), durationMs: Date.now() - ttsStarted, details: { bytes: audio?.length || 0 } });
  }

  const wsStarted = Date.now();
  const ws = new WebSocket(wsUrl);
  const events = [];
  const received = [];
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 15000);
    ws.once('open', () => { clearTimeout(timeout); resolve(); });
    ws.once('error', (error) => { clearTimeout(timeout); reject(error); });
  });
  report.checks.push({ name: 'websocket_open', ok: true, durationMs: Date.now() - wsStarted });

  const waitFor = (predicate, timeoutMs = 45000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const found = received.find(predicate);
      if (found) { clearInterval(timer); resolve(found); }
      else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('Timed out waiting for event')); }
    }, 50);
  });
  ws.on('message', raw => {
    try {
      const event = JSON.parse(String(raw));
      received.push(event);
      events.push({ type: event.type, timestamp: event.timestamp, text: event.text || event.delta || null });
    } catch {}
  });

  ws.send(JSON.stringify({ type: 'session.configure', language: 'pt-BR' }));
  let configured = null;
  try { configured = await waitFor(e => e.type === 'session.updated', 15000); } catch {}
  report.checks.push({ name: 'session_configure', ok: Boolean(configured), details: configured ? { nativeAudio: configured.nativeAudio, transport: configured.transport, model: configured.model } : null });

  if (audio) {
    ws.send(JSON.stringify({ type: 'input_audio_buffer.speech_started' }));
    const payload = nativeGemini ? audio : (live.provider === 'gemini' ? wavToPcm(audio) : audio);
    const chunkSize = 32000;
    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      ws.send(payload.subarray(offset, Math.min(payload.length, offset + chunkSize)));
      await new Promise(r => setTimeout(r, 60));
    }
    ws.send(JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }));
  }

  let transcript = null;
  try { transcript = await waitFor(e => e.type === 'conversation.item.input_audio_transcription.completed', 45000); } catch {}
  report.checks.push({ name: 'input_transcript', ok: Boolean(transcript?.text), details: transcript ? { textPresent: true, textLength: String(transcript.text).length } : null });

  let responseText = null;
  try {
    responseText = await waitFor(e => e.type === 'response.text.completed' || e.type === 'response.audio.transcript.delta', 45000);
  } catch {}
  report.checks.push({ name: 'response_text', ok: Boolean(responseText?.text || responseText?.delta), details: responseText ? { textPresent: true, sourceEvent: responseText.type, textLength: String(responseText.text || responseText.delta || '').length } : null });

  let responseAudio = null;
  try { responseAudio = await waitFor(e => e.type === 'response.audio.segment.done' || e.type === 'response.audio.done', 45000); } catch {}
  report.checks.push({ name: 'response_audio', ok: Boolean(responseAudio), details: responseAudio ? { type: responseAudio.type } : null });

  try { await waitFor(e => e.type === 'response.done', 45000); } catch {}
  ws.send(JSON.stringify({ type: 'session.close' }));
  await new Promise(r => setTimeout(r, 250));

  report.events = events.slice(-100);
  report.finishedAt = new Date().toISOString();
  report.ok = report.checks.every(c => c.ok);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 2;
}

main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message }, null, 2)); process.exitCode = 1; });
