import { Application, Color, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, GraphicsDevice } from 'playcanvas';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <main class="shell">
    <section class="stage">
      <canvas id="canvas" aria-label="Aurora 3D stage"></canvas>
      <div class="overlay"><span class="badge">AURORA AGENT</span><h1>Aurora System</h1><p id="status">Inicializando…</p></div>
      <div class="quickbar" aria-label="Ações rápidas">
        <button data-action="look">👁️ Olhar</button><button data-action="gesture">👋 Gesto</button><button data-action="speak">🔊 Falar</button><button data-action="sit">🪑 Sentar</button>
      </div>
    </section>
    <aside class="panel">
      <header class="panel-head"><div><h2>Aurora</h2><p class="muted">Agente operacional</p></div><button id="menu" class="icon" aria-label="Abrir controles">☰</button></header>
      <nav class="tabs" aria-label="Controles Aurora"><button class="tab active" data-tab="chat">Conversa</button><button class="tab" data-tab="avatar">Avatar</button><button class="tab" data-tab="voice">Voz</button><button class="tab" data-tab="system">Sistema</button></nav>
      <section class="tab-panel active" data-panel="chat">
        <div class="state"><span>Conexão</span><strong id="connection">Verificando…</strong></div><div class="state"><span>Raciocínio</span><strong id="reasoning">—</strong></div>
        <div class="chat" id="chat" aria-live="polite"></div>
        <form id="chatForm" class="composer"><input id="message" autocomplete="off" placeholder="Fale com a Aurora…"/><button>Enviar</button></form>
        <button id="mic" class="wide" type="button">🎙️ Falar</button>
      </section>
      <section class="tab-panel" data-panel="avatar">
        <div class="control-grid"><button data-action="look">👁️ Olhar</button><button data-action="walk">🚶 Caminhar</button><button data-action="sit">🪑 Sentar</button><button data-action="gesture">👋 Gesto</button><button data-action="speak">🔊 Falar</button></div>
        <label>Expressão<select id="expression"><option>neutral</option><option>happy</option><option>sad</option><option>surprised</option></select></label>
        <label>Roupa<select id="outfit"><option>default</option><option>casual</option><option>formal</option><option>sport</option></select></label>
      </section>
      <section class="tab-panel" data-panel="voice">
        <div class="state"><span>Voz</span><strong id="voice">Verificando…</strong></div>
        <label class="switch"><input id="autoSpeak" type="checkbox" checked/><span>Falar respostas automaticamente</span></label>
        <label>Idioma<select id="language"><option value="pt-BR">Português (Brasil)</option><option value="en-US">English</option><option value="es-ES">Español</option></select></label>
        <button id="testVoice" class="wide" type="button">▶ Testar voz</button>
      </section>
      <section class="tab-panel" data-panel="system">
        <div class="state"><span>Backend</span><strong id="backendState">—</strong></div><div class="state"><span>Modelo</span><strong id="model">—</strong></div>
        <button id="refresh" class="wide" type="button">↻ Atualizar estado</button>
        <p class="hint">Todos os controles desta interface são operáveis por toque ou teclado.</p>
      </section>
    </aside>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const connection = document.querySelector<HTMLElement>('#connection')!;
const reasoning = document.querySelector<HTMLElement>('#reasoning')!;
const voice = document.querySelector<HTMLElement>('#voice')!;
const backendState = document.querySelector<HTMLElement>('#backendState')!;
const model = document.querySelector<HTMLElement>('#model')!;
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
function addMessage(who: string, text: string) { const el = document.createElement('div'); el.className = `msg ${who}`; el.textContent = `${who === 'user' ? 'Você' : 'Aurora'}: ${text}`; chat.append(el); chat.scrollTop = chat.scrollHeight; }

async function health() {
  try { const r = await fetch('/health'); const data = await r.json(); connection.textContent = data.ok ? 'Online' : 'Indisponível'; backendState.textContent = data.ok ? 'Operacional' : 'Indisponível'; reasoning.textContent = data.provider === 'huggingface' ? 'Hugging Face' : data.provider; model.textContent = data.model || '—'; voice.textContent = data.voice ? 'Configurada' : 'Não configurada'; status.textContent = data.ok ? 'Aurora System operacional.' : 'Backend indisponível.'; }
  catch { connection.textContent = 'Offline'; backendState.textContent = 'Offline'; status.textContent = 'Não foi possível conectar ao backend.'; }
}

async function speak(text: string) { if (!autoSpeak.checked || !text.trim()) return; try { const t = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); if (t.ok) new Audio(URL.createObjectURL(await t.blob())).play(); } catch {} }

function applyAction(action: string, args: Record<string, unknown> = {}) { status.textContent = `Ação: ${action}`; if (action === 'setExpression') status.textContent = `Expressão: ${args.expression ?? 'neutral'}`; if (action === 'setOutfit') status.textContent = `Roupa: ${args.outfit ?? 'default'}`; }

async function sendMessage(text: string) {
  if (!text.trim()) return; addMessage('user', text);
  const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: text }) });
  const data = await r.json(); sessionId = data.sessionId ?? sessionId;
  if (!r.ok) throw new Error(data.message || 'Falha no agente'); addMessage('assistant', data.message || '');
  for (const action of data.actions ?? []) applyAction(action.action, action.args); await speak(data.message || '');
}

async function runAvatarAction(action: string, args: Record<string, unknown> = {}) { applyAction(action, args); addMessage('user', `[${action}]`); }

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => runAvatarAction(button.dataset.action!)));
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active')); button.classList.add('active'); document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active'); }));

document.querySelector<HTMLSelectElement>('#expression')!.addEventListener('change', (e) => runAvatarAction('setExpression', { expression: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLSelectElement>('#outfit')!.addEventListener('change', (e) => runAvatarAction('setOutfit', { outfit: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLButtonElement>('#menu')!.addEventListener('click', () => document.querySelector('.panel')!.classList.toggle('expanded'));
document.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', health);
document.querySelector<HTMLButtonElement>('#testVoice')!.addEventListener('click', () => speak('Olá! Eu sou a Aurora. A voz está pronta para teste.'));

autoSpeak.addEventListener('change', () => { status.textContent = autoSpeak.checked ? 'Voz automática ativada.' : 'Voz automática desativada.'; });
language.addEventListener('change', () => { status.textContent = `Idioma: ${language.value}`; });
form.addEventListener('submit', async (event) => { event.preventDefault(); const text = input.value; input.value = ''; try { await sendMessage(text); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } });

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
if (SpeechRecognition) { mic.addEventListener('click', () => { const recognition = new SpeechRecognition(); recognition.lang = language.value; recognition.interimResults = false; recognition.onstart = () => mic.textContent = '🎙️ Ouvindo…'; recognition.onend = () => mic.textContent = '🎙️ Falar'; recognition.onerror = () => mic.textContent = '🎙️ Falar'; recognition.onresult = async (event: any) => { try { await sendMessage(event.results[0][0].transcript); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } }; recognition.start(); }); }
else { mic.disabled = true; mic.textContent = '🎙️ Voz indisponível neste navegador'; }

health();
