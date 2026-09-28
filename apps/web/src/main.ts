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
  peer: null as RTCPeerConnection | null,
  events: null as RTCDataChannel | null,
  microphone: null as MediaStream | null,
  audio: null as HTMLAudioElement | null,
  sessionId: '',
  assistantTranscript: '',
  toolCalls: new Set<string>(),
};

function setLiveVoiceState(label: string) {
  voiceLiveState.textContent = label;
  mic.textContent = liveState.enabled ? '■  Encerrar conversa ao vivo' : '◉  Iniciar conversa ao vivo';
}

function sendRealtimeEvent(event: Record<string, unknown>) {
  if (liveState.events?.readyState === 'open') liveState.events.send(JSON.stringify(event));
}

async function executeRealtimeTool(call: any) {
  const callId = String(call?.call_id || '');
  if (!callId || liveState.toolCalls.has(callId)) return;
  liveState.toolCalls.add(callId);
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(String(call.arguments || '{}')); } catch { args = {}; }
  try {
    const r = await fetch('/api/realtime/tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: call.name, args }),
    });
    const result = await r.json().catch(() => ({ ok: false, error: 'invalid_tool_response' }));
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    sendRealtimeEvent({ type: 'response.create' });
  } catch (error) {
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Tool execution failed' }),
      },
    });
    sendRealtimeEvent({ type: 'response.create' });
  }
}

function handleRealtimeEvent(event: any) {
  switch (event?.type) {
    case 'session.created':
    case 'session.updated':
      liveState.connecting = false;
      setLiveVoiceState('● Ouvindo em tempo real…');
      status.textContent = 'Aurora Live conectada.';
      break;
    case 'input_audio_buffer.speech_started':
      setLiveVoiceState('● Você está falando…');
      status.textContent = 'Aurora ouvindo você.';
      break;
    case 'input_audio_buffer.speech_stopped':
      setLiveVoiceState('◌ Aurora pensando…');
      break;
    case 'response.created':
      setLiveVoiceState('◌ Aurora falando…');
      break;
    case 'response.output_audio_transcript.delta':
      liveState.assistantTranscript += String(event.delta || '');
      break;
    case 'response.output_audio_transcript.done':
      if (liveState.assistantTranscript.trim()) {
        addMessage('assistant', liveState.assistantTranscript.trim());
        liveState.assistantTranscript = '';
      }
      break;
    case 'response.output_item.done':
      if (event.item?.type === 'function_call') void executeRealtimeTool(event.item);
      break;
    case 'response.done':
      if (event.response?.status === 'failed') {
        const detail = event.response?.status_details?.error?.message || 'A resposta Live falhou.';
        status.textContent = detail;
      } else if (liveState.enabled) {
        setLiveVoiceState('● Ouvindo em tempo real…');
      }
      break;
    case 'error':
      status.textContent = event.error?.message || 'Erro na sessão Aurora Live.';
      break;
  }
}

async function stopLiveVoice() {
  if (!liveState.enabled && !liveState.peer) return;
  liveState.enabled = false;
  setLiveVoiceState('Encerrando conversa ao vivo…');
  if (liveState.events?.readyState === 'open') sendRealtimeEvent({ type: 'session.close' });
  const peer = liveState.peer;
  const microphone = liveState.microphone;
  window.setTimeout(() => {
    try { peer?.close(); } catch {}
    microphone?.getTracks().forEach((track) => track.stop());
    if (liveState.audio) {
      liveState.audio.pause();
      liveState.audio.srcObject = null;
    }
    liveState.peer = null;
    liveState.events = null;
    liveState.microphone = null;
    liveState.audio = null;
    liveState.sessionId = '';
    liveState.assistantTranscript = '';
    liveState.toolCalls.clear();
    setLiveVoiceState('Conversa ao vivo desligada');
    status.textContent = 'Aurora Live encerrada.';
  }, 500);
}

async function startLiveVoice() {
  if (liveState.enabled || liveState.connecting) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    setLiveVoiceState('WebRTC de voz não disponível neste navegador');
    return;
  }
  liveState.enabled = true;
  liveState.connecting = true;
  setLiveVoiceState('● Conectando Aurora Live…');
  try {
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (!liveState.enabled) {
      microphone.getTracks().forEach((track) => track.stop());
      return;
    }
    liveState.microphone = microphone;

    const tokenResponse = await fetch('/api/realtime/token', { method: 'POST', cache: 'no-store' });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.value) throw new Error(tokenData.message || 'Aurora Live não está configurada no servidor.');

    const peer = new RTCPeerConnection();
    liveState.peer = peer;
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    liveState.audio = audio;
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      audio.srcObject = stream;
      void audio.play().catch(() => {});
    };
    microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));

    const events = peer.createDataChannel('oai-events');
    liveState.events = events;
    events.onmessage = (message) => {
      try { handleRealtimeEvent(JSON.parse(message.data)); } catch {}
    };
    events.onopen = () => {
      setLiveVoiceState('● Ouvindo em tempo real…');
      status.textContent = 'Aurora Live pronta.';
    };
    events.onerror = () => { status.textContent = 'Canal de eventos Aurora Live apresentou um erro.'; };
    events.onclose = () => {
      if (liveState.enabled) {
        status.textContent = 'Conexão Aurora Live encerrada.';
        liveState.enabled = false;
        setLiveVoiceState('Conversa ao vivo desligada');
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') {
        liveState.connecting = false;
        setLiveVoiceState('● Ouvindo em tempo real…');
      } else if (state === 'failed' || state === 'closed') {
        if (liveState.enabled) void stopLiveVoice();
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + tokenData.value, 'content-type': 'application/sdp' },
      body: offer.sdp,
    });
    const answerSdp = await sdpResponse.text();
    if (!sdpResponse.ok) throw new Error(answerSdp || 'Falha ao conectar ao OpenAI Realtime.');
    await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    liveState.sessionId = sdpResponse.headers.get('Location') || '';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao iniciar Aurora Live.';
    status.textContent = message;
    liveState.enabled = false;
    liveState.connecting = false;
    try { liveState.peer?.close(); } catch {}
    liveState.microphone?.getTracks().forEach((track) => track.stop());
    liveState.peer = null;
    liveState.events = null;
    liveState.microphone = null;
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
