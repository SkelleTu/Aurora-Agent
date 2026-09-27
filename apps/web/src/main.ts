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
        <button class="tab active" data-tab="chat">Conversa</button><button class="tab" data-tab="avatar">Avatar</button><button class="tab" data-tab="voice">Voz</button><button class="tab" data-tab="system">Sistema</button>
      </nav>

      <section class="tab-panel active" data-panel="chat">
        <div class="metrics"><div><span>CONEXÃO</span><strong id="connection">…</strong></div><div><span>MODELO</span><strong id="modelCompact">…</strong></div></div>
        <div class="chat" id="chat" aria-live="polite"><div class="empty-chat"><span>✦</span><strong>Conversa com Aurora</strong><small>Digite uma mensagem ou use o microfone para começar.</small></div></div>
        <form id="chatForm" class="composer"><input id="message" autocomplete="off" placeholder="Fale com a Aurora…"/><button class="send" aria-label="Enviar mensagem">↑</button></form>
        <button id="mic" class="wide secondary" type="button">◉ &nbsp; Falar</button>
      </section>

      <section class="tab-panel" data-panel="avatar">
        <div class="panel-title"><div><span class="section-kicker">PRESENCE</span><h3>Presença 3D</h3></div><span class="live-dot">● LIVE</span></div>
        <div class="control-grid"><button data-action="look"><b>◉</b><span>Olhar</span></button><button data-action="walk"><b>↗</b><span>Caminhar</span></button><button data-action="sit"><b>▰</b><span>Sentar</span></button><button data-action="gesture"><b>✦</b><span>Gesto</span></button><button data-action="speak"><b>◖</b><span>Falar</span></button></div>
        <label>Expressão<select id="expression"><option value="neutral">Neutra</option><option value="happy">Feliz</option><option value="sad">Triste</option><option value="surprised">Surpresa</option></select></label>
        <label>Roupa<select id="outfit"><option value="default">Padrão</option><option value="casual">Casual</option><option value="formal">Formal</option><option value="sport">Esporte</option></select></label>
        <div class="capability-note"><span>✦</span><div><strong>Camada de controle</strong><small>Ações são enviadas ao protocolo do agente quando suportadas pelo backend.</small></div></div>
      </section>

      <section class="tab-panel" data-panel="voice">
        <div class="panel-title"><div><span class="section-kicker">AUDIO</span><h3>Voz & Escuta</h3></div></div>
        <div class="voice-card"><div class="voice-orb">◖</div><div><strong id="voice">Verificando…</strong><small id="voiceModel">Modelo de voz não informado</small></div></div>
        <label class="switch"><input id="autoSpeak" type="checkbox" checked/><span>Falar respostas automaticamente</span></label>
        <label>Idioma<select id="language"><option value="pt-BR">Português (Brasil)</option><option value="en-US">English</option><option value="es-ES">Español</option></select></label>
        <button id="testVoice" class="wide primary" type="button">▶ &nbsp; Testar voz</button>
      </section>

      <section class="tab-panel" data-panel="system">
        <div class="panel-title"><div><span class="section-kicker">RUNTIME</span><h3>Estado do sistema</h3></div></div>
        <div class="system-list"><div><span>Backend</span><strong id="backendState">—</strong></div><div><span>Provedor</span><strong id="provider">—</strong></div><div><span>Modelo</span><strong id="model">—</strong></div><div><span>Web build</span><strong id="webState">—</strong></div></div>
        <button id="refresh" class="wide secondary" type="button">↻ &nbsp; Atualizar diagnóstico</button>
        <div class="architecture"><span>ARQUITETURA</span><p>Reasoning · Voice · Tools</p><small>Adapters mantêm os provedores substituíveis e as ações passam pelo protocolo autorizado.</small></div>
      </section>

      <footer class="panel-footer"><span>v0.1.0 · Aurora Agent</span><span>● SECURE TOOLING</span></footer>
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
const chat = document.querySelector<HTMLDivElement>('#chat')!;
const form = document.querySelector<HTMLFormElement>('#chatForm')!;
const input = document.querySelector<HTMLInputElement>('#message')!;
const mic = document.querySelector<HTMLButtonElement>('#mic')!;
const autoSpeak = document.querySelector<HTMLInputElement>('#autoSpeak')!;
const language = document.querySelector<HTMLSelectElement>('#language')!;

const app = new Application(canvas, { graphicsDeviceOptions: { antialias: true, deviceTypes: [GraphicsDevice.WEBGL2] } });
app.setCanvasFillMode(FILLMODE_FILL_WINDOW); app.setCanvasResolution(RESOLUTION_AUTO); app.start();
app.scene.ambientLight = new Color(0.08, 0.1, 0.16);
status.textContent = '3D engine pronto. Conectando ao agente…';

let sessionId = crypto.randomUUID();
function clearEmpty() { chat.querySelector('.empty-chat')?.remove(); }
function addMessage(who: 'user' | 'assistant', text: string) { clearEmpty(); const el = document.createElement('div'); el.className = `msg ${who}`; el.innerHTML = `<span>${who === 'user' ? 'VOCÊ' : 'AURORA'}</span><p></p>`; el.querySelector('p')!.textContent = text; chat.append(el); chat.scrollTop = chat.scrollHeight; }

async function health() {
  try {
    const r = await fetch('/health', { cache: 'no-store' }); const data = await r.json();
    const online = Boolean(data.ok);
    connection.textContent = online ? 'Online' : 'Indisponível'; topConnection.textContent = online ? 'Sistema online' : 'Sistema offline';
    backendState.textContent = online ? 'Operacional' : 'Indisponível'; reasoning.textContent = data.provider || '—'; model.textContent = data.model || '—'; modelCompact.textContent = data.model || '—';
    voice.textContent = data.voice ? 'Configurada' : 'Não configurada'; voiceModel.textContent = data.voiceModels ? `${data.voiceModels.stt} · ${data.voiceModels.tts}` : 'Modelo de voz não informado'; webState.textContent = data.web ? 'Disponível' : 'Ausente';
    status.textContent = online ? 'Aurora System operacional.' : 'Backend indisponível.';
  } catch { connection.textContent = 'Offline'; topConnection.textContent = 'Sistema offline'; backendState.textContent = 'Offline'; status.textContent = 'Não foi possível conectar ao backend.'; }
}

async function speak(text: string) { if (!autoSpeak.checked || !text.trim()) return; try { const t = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); if (t.ok) new Audio(URL.createObjectURL(await t.blob())).play(); } catch {} }

function applyAction(action: string, args: Record<string, unknown> = {}) {
  const labels: Record<string, string> = { look: 'Aurora olhando', walk: 'Aurora caminhando', sit: 'Aurora sentando', gesture: 'Aurora fazendo um gesto', speak: 'Aurora falando' };
  if (action === 'setExpression') status.textContent = `Expressão: ${args.expression ?? 'neutral'}`;
  else if (action === 'setOutfit') status.textContent = `Roupa: ${args.outfit ?? 'default'}`;
  else status.textContent = labels[action] || `Ação: ${action}`;
}

async function sendMessage(text: string) {
  if (!text.trim()) return; addMessage('user', text); input.disabled = true;
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: text }) });
    const data = await r.json(); sessionId = data.sessionId ?? sessionId;
    if (!r.ok) throw new Error(data.message || 'Falha no agente'); addMessage('assistant', data.message || '');
    for (const action of data.actions ?? []) applyAction(action.action, action.args); await speak(data.message || '');
  } finally { input.disabled = false; input.focus(); }
}

async function runAvatarAction(action: string, args: Record<string, unknown> = {}) {
  applyAction(action, args);
  const label = action === 'setExpression' ? `Expressão: ${args.expression}` : action === 'setOutfit' ? `Roupa: ${args.outfit}` : `[${action}]`;
  addMessage('user', label);
}

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => runAvatarAction(button.dataset.action!)));
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active')); button.classList.add('active'); document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active'); }));
document.querySelector<HTMLSelectElement>('#expression')!.addEventListener('change', (e) => runAvatarAction('setExpression', { expression: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLSelectElement>('#outfit')!.addEventListener('change', (e) => runAvatarAction('setOutfit', { outfit: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLButtonElement>('#menu')!.addEventListener('click', () => document.querySelector('.control-panel')!.classList.toggle('expanded'));
document.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', health); document.querySelector<HTMLButtonElement>('#refreshTop')!.addEventListener('click', health);
document.querySelector<HTMLButtonElement>('#testVoice')!.addEventListener('click', () => speak('Olá! Eu sou a Aurora. A voz está pronta para teste.'));
autoSpeak.addEventListener('change', () => { status.textContent = autoSpeak.checked ? 'Voz automática ativada.' : 'Voz automática desativada.'; });
language.addEventListener('change', () => { status.textContent = `Idioma: ${language.value}`; });
form.addEventListener('submit', async (event) => { event.preventDefault(); const text = input.value; input.value = ''; try { await sendMessage(text); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } });

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
if (SpeechRecognition) { mic.addEventListener('click', () => { const recognition = new SpeechRecognition(); recognition.lang = language.value; recognition.interimResults = false; recognition.onstart = () => mic.textContent = '◉  Ouvindo…'; recognition.onend = () => mic.textContent = '◉  Falar'; recognition.onerror = () => mic.textContent = '◉  Falar'; recognition.onresult = async (event: any) => { try { await sendMessage(event.results[0][0].transcript); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } }; recognition.start(); }); }
else { mic.disabled = true; mic.textContent = '◉  Voz indisponível neste navegador'; }

health();
