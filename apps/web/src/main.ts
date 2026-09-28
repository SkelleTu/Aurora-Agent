import { Application, Color, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, GraphicsDevice } from 'playcanvas';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <main class="aurora-shell">
    <section class="stage">
      <canvas id="canvas" aria-label="Aurora 3D stage"></canvas>
      <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
      <header class="topbar glass">
        <div class="brand"><span class="brand-mark">✦</span><div><strong>AURORA</strong><span>AGENT SYSTEM</span></div></div>
        <div class="top-status"><span class="pulse"></span><span id="topConnection">Conectando</span><button id="refreshTop" class="ghost" aria-label="Atualizar estado">↻</button></div>
      </header>
      <div class="hero">
        <span class="eyebrow">AURA SYSTEM · AGENT LAYER</span>
        <h1>Seu agente.<br><em>Seu espaço.</em></h1>
        <p id="status">Inicializando o núcleo Aurora…</p>
      </div>
      <div class="quickbar glass" aria-label="Ações rápidas">
        <button data-action="look"><span>◉</span> Olhar</button><button data-action="gesture"><span>✦</span> Gesto</button><button data-action="speak"><span>◖</span> Falar</button><button data-action="sit"><span>▰</span> Sentar</button>
      </div>
    </section>

    <aside class="control-panel" id="panel">
      <header class="panel-head">
        <div><span class="section-kicker">CONTROL CENTER</span><h2>Aurora</h2><p>Agente operacional</p></div>
        <button id="menu" class="icon-button" aria-label="Expandir controles">☰</button>
      </header>
      <nav class="tabs" aria-label="Controles Aurora">
        <button class="tab active" data-tab="chat">Conversa</button><button class="tab" data-tab="avatar">Avatar</button><button class="tab" data-tab="voice">Voz</button><button class="tab" data-tab="ai">IA</button><button class="tab" data-tab="system">Sistema</button>
      </nav>

      <section class="tab-panel active" data-panel="chat">
        <div class="metrics"><div><span>CONEXÃO</span><strong id="connection">…</strong></div><div><span>MODELO</span><strong id="modelCompact">…</strong></div></div>
        <div class="chat" id="chat" aria-live="polite"><div class="empty-chat"><span>✦</span><strong>Conversa com Aurora</strong><small>Digite uma mensagem ou use o microfone para começar.</small></div></div>
        <form id="chatForm" class="composer"><input id="message" autocomplete="off" placeholder="Fale com a Aurora…"/><button class="send" aria-label="Enviar mensagem">↑</button></form>
        <button id="mic" class="wide secondary" type="button">◉ &nbsp; Iniciar conversa ao vivo</button>
      </section>

      <section class="tab-panel" data-panel="avatar">
        <div class="panel-title"><div><span class="section-kicker">PRESENCE</span><h3>Presença 3D</h3></div><span class="live-dot">● LIVE</span></div>
        <div class="control-grid"><button data-action="look"><b>◉</b><span>Olhar</span></button><button data-action="walk"><b>↗</b><span>Caminhar</span></button><button data-action="sit"><b>▰</b><span>Sentar</span></button><button data-action="gesture"><b>✦</b><span>Gesto</span></button><button data-action="speak"><b>◖</b><span>Falar</span></button></div>
        <label>Expressão<select id="expression"><option value="neutral">Neutra</option><option value="happy">Feliz</option><option value="sad">Triste</option><option value="surprised">Surpresa</option></select></label>
        <label>Roupa<select id="outfit"><option value="default">Padrão</option><option value="casual">Casual</option><option value="formal">Formal</option><option value="sport">Esporte</option></select></label>
        <div class="capability-note"><span>✦</span><div><strong>Camada de controle</strong><small>Ações são despachadas pelo bridge autorizado do Aura System.</small></div></div>
      </section>

      <section class="tab-panel" data-panel="voice">
        <div class="panel-title"><div><span class="section-kicker">AUDIO</span><h3>Voz & Escuta</h3></div></div>
        <div class="voice-card"><div class="voice-orb">◖</div><div><strong id="voice">Verificando…</strong><small id="voiceModel">Modelo de voz não informado</small></div></div>
        <label class="switch"><input id="autoSpeak" type="checkbox" checked/><span>Falar respostas automaticamente</span></label>
        <label>Idioma<select id="language"><option value="pt-BR">Português (Brasil)</option><option value="en-US">English</option><option value="es-ES">Español</option></select></label>
        <button id="testVoice" class="wide primary" type="button">▶ &nbsp; Testar voz</button>
      </section>

      <section class="tab-panel" data-panel="ai">
        <div class="panel-title"><div><span class="section-kicker">AI FABRIC</span><h3>Capacidades</h3></div></div>
        <div class="system-list" id="capabilityList"><div><span>Catálogo</span><strong>Carregando…</strong></div></div>
        <div class="architecture"><span>HUGGING FACE</span><p id="capabilitySummary">Descobrindo adapters…</p><small>Reasoning, visão, áudio, classificação, geração e vídeo ficam disponíveis pela mesma camada de adapters.</small></div>
      </section>

      <section class="tab-panel" data-panel="system">
        <div class="panel-title"><div><span class="section-kicker">RUNTIME</span><h3>Estado do sistema</h3></div></div>
        <div class="system-list"><div><span>Backend</span><strong id="backendState">—</strong></div><div><span>Provedor</span><strong id="provider">—</strong></div><div><span>Modelo</span><strong id="model">—</strong></div><div><span>Web build</span><strong id="webState">—</strong></div><div><span>Aura bridge</span><strong id="auraBridge">—</strong></div></div>
        <button id="refresh" class="wide secondary" type="button">↻ &nbsp; Atualizar diagnóstico</button>
        <div class="architecture"><span>ARQUITETURA</span><p>Reasoning · Voice · Tools · Aura Bridge</p><small>Adapters mantêm os provedores substituíveis e as ações passam pelo protocolo autorizado.</small></div>
      </section>

      <footer class="panel-footer"><span>v0.8.0 · Aurora Agent</span><span>● SECURE TOOLING</span></footer>
    </aside>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const connection = document.querySelector<HTMLElement>('#connection')!;
const topConnection = document.querySelector<HTMLElement>('#topConnection')!;
const reasoning = document.querySelector<HTMLElement>('#provider')!;
const voice = document.querySelector<HTMLElement>('#voice')!;
const voiceModel = document.querySelector<HTMLElement>('#voiceModel')!;
const backendState = document.querySelector<HTMLElement>('#backendState')!;
const model = document.querySelector<HTMLElement>('#model')!;
const modelCompact = document.querySelector<HTMLElement>('#modelCompact')!;
const webState = document.querySelector<HTMLElement>('#webState')!;
const auraBridge = document.querySelector<HTMLElement>('#auraBridge')!;
const capabilityList = document.querySelector<HTMLElement>('#capabilityList')!;
const capabilitySummary = document.querySelector<HTMLElement>('#capabilitySummary')!;
const chat = document.querySelector<HTMLDivElement>('#chat')!;
const form = document.querySelector<HTMLFormElement>('#chatForm')!;
const input = document.querySelector<HTMLInputElement>('#message')!;
const mic = document.querySelector<HTMLButtonElement>('#mic')!;
const autoSpeak = document.querySelector<HTMLInputElement>('#autoSpeak')!;
const voiceLiveState = document.createElement('div');
voiceLiveState.className = 'voice-live-state';
voiceLiveState.textContent = 'Conversa ao vivo desligada';
document.querySelector('[data-panel="voice"]')?.appendChild(voiceLiveState);
let liveRecognition: any = null;
let liveVoiceEnabled = false;
let liveVoiceProcessing = false;
let liveTurnId = 0;
let liveMicStream: MediaStream | null = null;
let currentAudio: HTMLAudioElement | null = null;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const runtimeDomains = ['avatar', 'scene', 'animation', 'voice', 'interface'] as const;
const runtimeSeen = new Map<string, string>();

const app = new Application(canvas, { graphicsDeviceOptions: { antialias: true, deviceTypes: [GraphicsDevice.WEBGL2] } });
app.setCanvasFillMode(FILLMODE_FILL_WINDOW); app.setCanvasResolution(RESOLUTION_AUTO); app.start();
app.scene.ambientLight = new Color(0.08, 0.1, 0.16);
status.textContent = '3D engine pronto. Conectando ao agente…';

const scenePresets: Record<string, Color> = {
  default: new Color(0.08, 0.1, 0.16),
  day: new Color(0.22, 0.24, 0.28),
  night: new Color(0.025, 0.035, 0.07),
  dramatic: new Color(0.12, 0.06, 0.16),
};



let sessionId = '';

async function ensureSession() {
  if (sessionId) return sessionId;
  const r = await fetch('/api/session', { method: 'POST', cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.sessionId) throw new Error(data.message || 'Não foi possível iniciar a sessão Aurora.');
  sessionId = data.sessionId;
  return sessionId;
}
function clearEmpty() { chat.querySelector('.empty-chat')?.remove(); }
function addMessage(who: 'user' | 'assistant', text: string) { clearEmpty(); const el = document.createElement('div'); el.className = `msg ${who}`; el.innerHTML = `<span>${who === 'user' ? 'VOCÊ' : 'AURORA'}</span><p></p>`; el.querySelector('p')!.textContent = text; chat.append(el); chat.scrollTop = chat.scrollHeight; }

async function health() {
  try {
    const r = await fetch('/health', { cache: 'no-store' }); const data = await r.json();
    const online = Boolean(data.ok);
    connection.textContent = online ? 'Online' : 'Indisponível'; topConnection.textContent = online ? 'Sistema online' : 'Sistema offline';
    backendState.textContent = online ? 'Operacional' : 'Indisponível'; reasoning.textContent = data.provider || '—'; model.textContent = data.model || '—'; modelCompact.textContent = data.model || '—';
    voice.textContent = data.voice ? 'Configurada' : 'Não configurada'; voiceModel.textContent = data.voiceModels ? `${data.voiceModels.stt} · ${data.voiceModels.tts}` : 'Modelo de voz não informado'; webState.textContent = data.web ? 'Disponível' : 'Ausente';
    auraBridge.textContent = data.auraBridge?.configured ? 'Configurada' : 'Não configurada';
    status.textContent = online ? 'Aurora System operacional.' : 'Backend indisponível.';
  } catch { connection.textContent = 'Offline'; topConnection.textContent = 'Sistema offline'; backendState.textContent = 'Offline'; auraBridge.textContent = 'Indisponível'; status.textContent = 'Não foi possível conectar ao backend.'; }
}

async function loadCapabilities() {
  try {
    const r = await fetch('/api/capabilities', { cache: 'no-store' });
    const data = await r.json();
    const capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
    capabilityList.innerHTML = capabilities.map((item: any) => `<div><span>${item.task}</span><strong>${item.model || 'dinâmico'}</strong></div>`).join('');
    capabilitySummary.textContent = `${capabilities.length} adapters ativos · ${data.groups?.length || 0} grupos`;
  } catch {
    capabilityList.innerHTML = '<div><span>Catálogo</span><strong>Indisponível</strong></div>';
    capabilitySummary.textContent = 'Falha ao consultar adapters.';
  }
}

function stopCurrentAudio(interrupted = false) {
  const audio = currentAudio;
  if (!audio) return;
  if (interrupted) (audio as any).__auroraInterrupted = true;
  audio.pause();
  audio.currentTime = 0;
  if (currentAudio === audio) currentAudio = null;
}

async function speak(text: string, force = false) {
  if ((!force && !autoSpeak.checked) || !text.trim()) return;
  try {
    stopCurrentAudio();
    const t = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!t.ok) return;
    const audio = new Audio(URL.createObjectURL(await t.blob()));
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
    await new Promise<void>((resolve) => {
      if (audio.ended) return resolve();
      audio.addEventListener('ended', () => resolve(), { once: true });
      audio.addEventListener('error', () => resolve(), { once: true });
      audio.addEventListener('pause', () => {
        if ((audio as any).__auroraInterrupted) resolve();
      }, { once: true });
    });
    URL.revokeObjectURL(audio.src);
  } catch {}
}

function applyAction(action: string, args: Record<string, unknown> = {}) {
  const labels: Record<string, string> = { look: 'Aurora olhando', walk: 'Aurora caminhando', sit: 'Aurora sentando', gesture: 'Aurora fazendo um gesto', speak: 'Aurora falando' };
  if (action === 'setExpression') status.textContent = `Expressão: ${args.expression ?? 'neutral'}`;
  else if (action === 'setOutfit') status.textContent = `Roupa: ${args.outfit ?? 'default'}`;
  else status.textContent = labels[action] || `Ação: ${action}`;
}

async function dispatchAction(domain: string, action: string, args: Record<string, unknown> = {}) {
  const r = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain, action, args }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.reason || data.error || `Falha ao executar ${action}`);
  return data;
}

async function sendMessage(text: string) {
  if (!text.trim()) return; addMessage('user', text); input.disabled = true;
  status.textContent = 'Aurora processando…';
  try {
    await ensureSession();
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: text }) });
    const data = await r.json().catch(() => ({}));
    sessionId = data.sessionId ?? sessionId;
    if (!r.ok) throw new Error(data.message || data.error || `Falha no agente (${r.status})`);
    addMessage('assistant', data.message || '');
    for (const action of data.actions ?? []) applyAction(action.action, action.args);
    status.textContent = data.tools ? `Aurora respondeu · ${data.tools} ferramenta(s)` : 'Aurora respondeu.';
    await speak(data.message || '');
  } catch (error) {
    status.textContent = 'Falha no fluxo Aurora.';
    throw error;
  } finally { input.disabled = false; input.focus(); }
}

async function syncRuntime() {
  try {
    const states = await Promise.all(runtimeDomains.map(async (domain) => {
      const result = await dispatchAction(domain, 'state');
      return { domain, state: result.result?.state ?? {} };
    }));

    for (const { domain, state } of states) {
      const lastCommand = state?.lastCommand;
      const commandId = typeof lastCommand?.id === 'string' ? lastCommand.id : '';
      if (commandId && runtimeSeen.get(domain) !== commandId) {
        runtimeSeen.set(domain, commandId);
        const action = String(lastCommand.action ?? '');
        const args = lastCommand.args && typeof lastCommand.args === 'object' ? lastCommand.args as Record<string, unknown> : {};
        if (domain === 'voice' && action === 'speak') {
          await speak(String(args.text ?? state.text ?? ''), true);
          await dispatchAction('voice', 'stop');
        } else if (domain === 'interface') {
          if (action === 'notify') addMessage('assistant', '[Aura] ' + String(state.notification ?? ''));
          if (action === 'setPanel') {
            const panel = String(state.panel ?? 'chat');
            document.querySelector<HTMLButtonElement>('.tab[data-tab="' + panel + '"]')?.click();
          }
          if (action === 'setStatus') status.textContent = String(state.status ?? '');
        }
      }

      if (domain === 'avatar') {
        const pose = String(state.pose ?? '');
        const expression = String(state.expression ?? '');
        const outfit = String(state.outfit ?? '');
        if (pose) status.textContent = 'Avatar: ' + pose + (expression ? ' · ' + expression : '') + (outfit ? ' · ' + outfit : '');
        document.documentElement.dataset.avatarPose = pose;
      } else if (domain === 'scene') {
        const preset = String(state.preset ?? 'default');
        app.scene.ambientLight = scenePresets[preset] ?? scenePresets.default;
        document.documentElement.dataset.scene = preset;
      } else if (domain === 'animation') {
        const name = String(state.name ?? '');
        if (name) status.textContent = state.playing ? 'Animação: ' + name : 'Animação parada: ' + name;
        document.documentElement.dataset.animation = name;
      }
    }
  } catch {}
}

async function runAvatarAction(action: string, args: Record<string, unknown> = {}) {
  applyAction(action, args);
  const label = action === 'setExpression' ? `Expressão: ${args.expression}` : action === 'setOutfit' ? `Roupa: ${args.outfit}` : `[${action}]`;
  addMessage('user', label);
  try {
    const result = await dispatchAction('avatar', action, args);
    if (result.dispatched) status.textContent = `Aura: ${action} executado.`;
    else status.textContent = `Aurora: ${action} preparado, mas o bridge do Aura System ainda não está configurado.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Falha ao despachar ação.';
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => runAvatarAction(button.dataset.action!)));
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active')); button.classList.add('active'); document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active'); }));
document.querySelector<HTMLSelectElement>('#expression')!.addEventListener('change', (e) => runAvatarAction('setExpression', { expression: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLSelectElement>('#outfit')!.addEventListener('change', (e) => runAvatarAction('setOutfit', { outfit: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLButtonElement>('#menu')!.addEventListener('click', () => document.querySelector('.control-panel')!.classList.toggle('expanded'));
document.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', health); document.querySelector<HTMLButtonElement>('#refreshTop')!.addEventListener('click', health);
document.querySelector<HTMLButtonElement>('#testVoice')!.addEventListener('click', () => speak('Olá! Eu sou a Aurora. A voz está pronta para teste.'));
autoSpeak.addEventListener('change', () => { status.textContent = autoSpeak.checked ? 'Voz automática ativada.' : 'Voz automática desativada.'; });
language.addEventListener('change', () => { status.textContent = `Idioma: ${language.value}`; if (liveVoiceEnabled && liveRecognition) { liveRecognition.lang = language.value; } });
form.addEventListener('submit', async (event) => { event.preventDefault(); const text = input.value; input.value = ''; try { await sendMessage(text); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } });

const liveState = {
  enabled: false,
  connecting: false,
  socket: null as WebSocket | null,
  microphone: null as MediaStream | null,
  audioContext: null as AudioContext | null,
  source: null as MediaStreamAudioSourceNode | null,
  worklet: null as AudioWorkletNode | null,
  playback: [] as { id:string; audio:HTMLAudioElement; durationMs:number }[],
  currentPlayback: null as { id:string; audio:HTMLAudioElement; durationMs:number } | null,
  playbackTimer: 0 as number | undefined,
  speaking: false,
  silenceSince: 0,
  noiseFloor: 0.008,
  noiseSamples: 0,
  model: '',
};

function setLiveVoiceState(label: string) {
  voiceLiveState.textContent = label;
  mic.textContent = liveState.enabled ? '■  Encerrar conversa ao vivo' : '◉  Iniciar conversa ao vivo';
}

function liveSend(event: Record<string, unknown>) {
  if (liveState.socket?.readyState === WebSocket.OPEN) liveState.socket.send(JSON.stringify(event));
}

function stopLivePlayback() {
  if (liveState.playbackTimer) window.clearInterval(liveState.playbackTimer);
  liveState.playbackTimer = undefined;
  if (liveState.currentPlayback) {
    const item = liveState.currentPlayback;
    item.audio.pause();
    URL.revokeObjectURL(item.audio.src);
    liveState.currentPlayback = null;
  }
  for (const item of liveState.playback) {
    item.audio.pause();
    URL.revokeObjectURL(item.audio.src);
  }
  liveState.playback = [];
  currentAudio = null;
}

function playNextLiveAudio() {
  if (!liveState.enabled || liveState.currentPlayback || !liveState.playback.length) return;
  const item = liveState.playback.shift()!;
  liveState.currentPlayback = item;
  currentAudio = item.audio;
  item.audio.onended = () => {
    if (liveState.currentPlayback?.id !== item.id) return;
    liveSend({ type:'playback.progress', ms:item.durationMs || Math.round(item.audio.currentTime * 1000) });
    liveState.currentPlayback = null;
    currentAudio = null;
    URL.revokeObjectURL(item.audio.src);
    playNextLiveAudio();
  };
  item.audio.onerror = () => {
    liveState.currentPlayback = null;
    currentAudio = null;
    URL.revokeObjectURL(item.audio.src);
    playNextLiveAudio();
  };
  void item.audio.play().catch(() => {});
  liveState.playbackTimer = window.setInterval(() => {
    if (liveState.currentPlayback === item) liveSend({ type:'playback.progress', ms:Math.round(item.audio.currentTime * 1000) });
  }, 100);
}

function interruptLiveOutput() {
  const currentMs = liveState.currentPlayback ? Math.round(liveState.currentPlayback.audio.currentTime * 1000) : 0;
  liveSend({ type:'playback.progress', ms:currentMs });
  liveSend({ type:'response.cancel' });
  stopLivePlayback();
}

function handleLiveEvent(event: any) {
  switch (event?.type) {
    case 'session.updated':
      liveState.connecting = false;
      liveState.model = String(event.model || liveState.model || '');
      modelCompact.textContent = liveState.model || modelCompact.textContent;
      setLiveVoiceState('● Ouvindo em tempo real…');
      status.textContent = 'Aurora Live conectada.';
      break;
    case 'input_audio_buffer.speech_started':
      if (!liveState.speaking) {
        liveState.speaking = true;
        interruptLiveOutput();
      }
      setLiveVoiceState('● Você está falando…');
      break;
    case 'input_audio_buffer.speech_stopped':
      liveState.speaking = false;
      setLiveVoiceState('◌ Aurora processando…');
      break;
    case 'conversation.item.input_audio_transcription.completed':
      addMessage('user', String(event.text || ''));
      break;
    case 'response.created':
      setLiveVoiceState('◌ Aurora preparando resposta…');
      break;
    case 'response.text.completed':
      if (String(event.text || '').trim()) addMessage('assistant', String(event.text).trim());
      break;
    case 'response.audio.segment':
      try {
        const bytes = Uint8Array.from(atob(String(event.data || '')), ch => ch.charCodeAt(0));
        const blob = new Blob([bytes], { type:String(event.contentType || 'audio/wav') });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.setAttribute('playsinline', 'true');
        liveState.playback.push({ id:String(event.segmentId), audio, durationMs:Number(event.durationMs || 0) });
        setLiveVoiceState('◌ Aurora falando…');
        playNextLiveAudio();
      } catch {}
      break;
    case 'response.audio.cleared':
    case 'response.cancelled':
    case 'conversation.item.truncated':
      stopLivePlayback();
      break;
    case 'tool.completed':
      status.textContent = 'Aurora executou uma ação no Aura System.';
      break;
    case 'response.done':
      if (liveState.enabled) setLiveVoiceState('● Ouvindo em tempo real…');
      break;
    case 'error':
      status.textContent = String(event.error || 'Erro na sessão Aurora Live.');
      break;
  }
}

function captureWorkletSource() {
  return `class AuroraCaptureProcessor extends AudioWorkletProcessor {
    process(inputs) {
      const input = inputs[0], channel = input && input[0];
      if (!channel || !channel.length) return true;
      let sum = 0;
      for (let i=0;i<channel.length;i++) sum += channel[i]*channel[i];
      const rms = Math.sqrt(sum/channel.length);
      const ratio = sampleRate/16000;
      const n = Math.max(1, Math.floor(channel.length/ratio));
      const pcm = new Int16Array(n);
      for (let i=0;i<n;i++) {
        const s=Math.floor(i*ratio), e=Math.min(channel.length,Math.max(s+1,Math.floor((i+1)*ratio)));
        let v=0; for(let j=s;j<e;j++) v+=channel[j]; v/=Math.max(1,e-s);
        pcm[i]=Math.max(-32768,Math.min(32767,Math.round(v*32767)));
      }
      this.port.postMessage({pcm:pcm.buffer,rms},[pcm.buffer]);
      return true;
    }
  }
  registerProcessor('aurora-live-capture', AuroraCaptureProcessor);`;
}

async function stopLiveVoice() {
  if (!liveState.enabled && !liveState.socket) return;
  liveState.enabled = false;
  setLiveVoiceState('Encerrando conversa ao vivo…');
  liveSend({ type:'session.close' });
  stopLivePlayback();
  try { liveState.worklet?.disconnect(); } catch {}
  try { liveState.source?.disconnect(); } catch {}
  liveState.microphone?.getTracks().forEach(track => track.stop());
  try { await liveState.audioContext?.close(); } catch {}
  try { liveState.socket?.close(); } catch {}
  liveState.socket = null;
  liveState.microphone = null;
  liveState.audioContext = null;
  liveState.source = null;
  liveState.worklet = null;
  liveState.speaking = false;
  setLiveVoiceState('Conversa ao vivo desligada');
  status.textContent = 'Aurora Live encerrada.';
}

async function startLiveVoice() {
  if (liveState.enabled || liveState.connecting) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.WebSocket) {
    setLiveVoiceState('Áudio Live não disponível neste navegador');
    return;
  }
  liveState.enabled = true;
  liveState.connecting = true;
  setLiveVoiceState('● Conectando Aurora Live…');
  try {
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 },
    });
    liveState.microphone = microphone;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(protocol + '//' + location.host + '/api/live');
    socket.binaryType = 'arraybuffer';
    liveState.socket = socket;
    await new Promise<void>((resolve,reject) => {
      const timer = window.setTimeout(() => reject(new Error('Tempo esgotado ao conectar Aurora Live.')),10000);
      socket.onopen=()=>{window.clearTimeout(timer);resolve();};
      socket.onerror=()=>{window.clearTimeout(timer);reject(new Error('Não foi possível abrir o canal Aurora Live.'));};
    });
    socket.onmessage = message => {
      if (typeof message.data !== 'string') return;
      try { handleLiveEvent(JSON.parse(message.data)); } catch {}
    };
    socket.onclose = () => { if (liveState.enabled) void stopLiveVoice(); };

    const ctx = new AudioContext({ sampleRate:48000 });
    liveState.audioContext = ctx;
    await ctx.resume();
    const source = ctx.createMediaStreamSource(microphone);
    liveState.source = source;
    const workletUrl = URL.createObjectURL(new Blob([captureWorkletSource()], { type:'application/javascript' }));
    await ctx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);
    const worklet = new AudioWorkletNode(ctx,'aurora-live-capture');
    liveState.worklet = worklet;
    source.connect(worklet);
    worklet.port.onmessage = event => {
      if (!liveState.enabled || liveState.socket?.readyState !== WebSocket.OPEN) return;
      const rms = Number(event.data?.rms || 0);
      if (liveState.noiseSamples < 25) {
        liveState.noiseFloor=(liveState.noiseFloor*liveState.noiseSamples+rms)/(liveState.noiseSamples+1);
        liveState.noiseSamples += 1;
      }
      const threshold=Math.max(0.014,liveState.noiseFloor*2.8);
      if (rms >= threshold) {
        liveState.silenceSince=0;
        if (!liveState.speaking) {
          liveState.speaking=true;
          liveSend({type:'input_audio_buffer.speech_started'});
        }
      } else if (liveState.speaking) {
        if (!liveState.silenceSince) liveState.silenceSince=performance.now();
        if (performance.now()-liveState.silenceSince>420) {
          liveState.speaking=false;
          liveSend({type:'input_audio_buffer.speech_stopped'});
          liveState.silenceSince=0;
        }
      }
      liveState.socket.send(event.data.pcm);
    };
    liveState.model = '';
    liveSend({ type:'session.configure', model:liveState.model || undefined, language:language.value });
    liveState.connecting=false;
    setLiveVoiceState('● Ouvindo em tempo real…');
    status.textContent='Aurora Live pronta.';
  } catch(error) {
    status.textContent=error instanceof Error?error.message:'Falha ao iniciar Aurora Live.';
    liveState.enabled=false;
    liveState.connecting=false;
    liveState.microphone?.getTracks().forEach(track=>track.stop());
    try { await liveState.audioContext?.close(); } catch {}
    try { liveState.socket?.close(); } catch {}
    liveState.socket=null;
    setLiveVoiceState('Falha ao iniciar conversa ao vivo');
  }
}

mic.addEventListener('click', () => {
  if (liveState.enabled || liveState.connecting) void stopLiveVoice();
  else void startLiveVoice();
});

health();
loadCapabilities();
void syncRuntime();
window.setInterval(() => { void syncRuntime(); }, 800);
