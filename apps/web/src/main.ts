import { Application, Color, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, GraphicsDevice } from 'playcanvas';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <main class="shell">
    <section class="stage">
      <canvas id="canvas" aria-label="Aurora 3D stage"></canvas>
      <div class="overlay"><span class="badge">AURORA AGENT</span><h1>Aurora System</h1><p id="status">Inicializando…</p></div>
    </section>
    <aside class="panel">
      <h2>Aurora</h2><p class="muted">Agente operacional</p>
      <div class="state"><span>Conexão</span><strong id="connection">Verificando…</strong></div>
      <div class="state"><span>Raciocínio</span><strong id="reasoning">—</strong></div>
      <div class="state"><span>Voz</span><strong id="voice">—</strong></div>
      <div class="chat" id="chat"></div>
      <form id="chatForm"><input id="message" autocomplete="off" placeholder="Fale com a Aurora…"/><button>Enviar</button></form>
      <button id="mic" type="button">🎙️ Falar</button>
    </aside>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const connection = document.querySelector<HTMLElement>('#connection')!;
const reasoning = document.querySelector<HTMLElement>('#reasoning')!;
const voice = document.querySelector<HTMLElement>('#voice')!;
const chat = document.querySelector<HTMLDivElement>('#chat')!;
const form = document.querySelector<HTMLFormElement>('#chatForm')!;
const input = document.querySelector<HTMLInputElement>('#message')!;
const mic = document.querySelector<HTMLButtonElement>('#mic')!;

const app = new Application(canvas, { graphicsDeviceOptions: { antialias: true, deviceTypes: [GraphicsDevice.WEBGL2] } });
app.setCanvasFillMode(FILLMODE_FILL_WINDOW); app.setCanvasResolution(RESOLUTION_AUTO); app.start();
app.scene.ambientLight = new Color(0.08, 0.1, 0.16);
status.textContent = '3D engine pronto. Conectando ao agente…';

let sessionId = crypto.randomUUID();
function addMessage(who: string, text: string) { const el = document.createElement('div'); el.className = `msg ${who}`; el.textContent = `${who === 'user' ? 'Você' : 'Aurora'}: ${text}`; chat.append(el); chat.scrollTop = chat.scrollHeight; }

async function health() {
  try {
    const r = await fetch('/health'); const data = await r.json();
    connection.textContent = data.ok ? 'Online' : 'Indisponível'; reasoning.textContent = data.provider === 'huggingface' ? 'Hugging Face' : data.provider; voice.textContent = data.voice ? 'OpenAI' : 'Não configurada';
    status.textContent = data.ok ? 'Aurora System operacional.' : 'Backend indisponível.';
  } catch { connection.textContent = 'Offline'; status.textContent = 'Não foi possível conectar ao backend.'; }
}

async function sendMessage(text: string) {
  if (!text.trim()) return; addMessage('user', text);
  const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: text }) });
  const data = await r.json(); sessionId = data.sessionId ?? sessionId;
  if (!r.ok) throw new Error(data.message || 'Falha no agente'); addMessage('assistant', data.message || '');
  if (data.message) { try { const t = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: data.message }) }); if (t.ok) new Audio(URL.createObjectURL(await t.blob())).play(); } catch {} }
}

form.addEventListener('submit', async (event) => { event.preventDefault(); const text = input.value; input.value = ''; try { await sendMessage(text); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } });

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
if (SpeechRecognition) {
  mic.addEventListener('click', () => { const recognition = new SpeechRecognition(); recognition.lang = 'pt-BR'; recognition.interimResults = false; recognition.onstart = () => mic.textContent = '🎙️ Ouvindo…'; recognition.onend = () => mic.textContent = '🎙️ Falar'; recognition.onerror = () => mic.textContent = '🎙️ Falar'; recognition.onresult = async (event: any) => { const text = event.results[0][0].transcript; try { await sendMessage(text); } catch (e) { addMessage('assistant', e instanceof Error ? e.message : 'Erro de comunicação.'); } }; recognition.start(); });
} else { mic.disabled = true; mic.textContent = '🎙️ Voz indisponível neste navegador'; }

health();
