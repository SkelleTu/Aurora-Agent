import WebSocket from 'ws';

const baseUrl = String(process.env.AURORA_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('AURORA_BASE_URL is required, e.g. https://your-service.onrender.com');

const httpUrl = `${baseUrl}/health`;
const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/live`;

function pcmSilence(ms = 400, sampleRate = 16000) {
  return Buffer.alloc(Math.round(sampleRate * ms / 1000) * 2);
}

async function main() {
  const report = { startedAt: new Date().toISOString(), baseUrl, checks: [] };

  const healthStarted = Date.now();
  const healthResponse = await fetch(httpUrl, { signal: AbortSignal.timeout(10000) });
  const health = await healthResponse.json();
  report.checks.push({ name: 'health', ok: healthResponse.ok && health?.ok === true, durationMs: Date.now() - healthStarted, details: { provider: health?.provider, live: health?.live, auraBridge: health?.auraBridge } });

  const wsStarted = Date.now();
  const ws = new WebSocket(wsUrl);
  const events = [];
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 15000);
    ws.once('open', resolve);
    ws.once('error', reject);
    ws.once('close', () => clearTimeout(timeout));
  });
  report.checks.push({ name: 'websocket_open', ok: true, durationMs: Date.now() - wsStarted });

  const received = [];
  const waitFor = (predicate, timeoutMs = 15000) => new Promise((resolve, reject) => {
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
      events.push({ type: event.type, timestamp: event.timestamp });
    } catch {}
  });

  ws.send(JSON.stringify({ type: 'session.configure', language: 'pt-BR' }));
  let configured = null;
  try { configured = await waitFor(e => e.type === 'session.updated', 15000); } catch {}
  report.checks.push({ name: 'session_configure', ok: Boolean(configured), details: configured ? { nativeAudio: configured.nativeAudio, transport: configured.transport, model: configured.model } : null });

  const audio = pcmSilence();
  ws.send(JSON.stringify({ type: 'input_audio_buffer.speech_started' }));
  for (let i = 0; i < 4; i++) {
    ws.send(audio);
    await new Promise(r => setTimeout(r, 100));
  }
  ws.send(JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }));

  let transcriptOrError = null;
  try {
    transcriptOrError = await waitFor(e => e.type?.includes('input_audio_transcription') || e.type === 'error', 10000);
  } catch {}
  report.checks.push({ name: 'audio_path_observable', ok: Boolean(transcriptOrError), details: transcriptOrError ? { type: transcriptOrError.type, textPresent: Boolean(transcriptOrError.text), error: transcriptOrError.error || null } : null });

  ws.send(JSON.stringify({ type: 'session.close' }));
  await new Promise(r => setTimeout(r, 250));
  report.events = events.slice(-80);
  report.finishedAt = new Date().toISOString();
  report.ok = report.checks.every(c => c.ok);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 2;
}

main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message }, null, 2)); process.exitCode = 1; });
