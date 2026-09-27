import { Application, Color, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, GraphicsDevice } from '@playcanvas/engine';
import type { AgentEvent } from '../../../packages/protocol/src/agent-events';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <main class="shell">
    <section class="stage">
      <canvas id="canvas" aria-label="Aurora 3D stage"></canvas>
      <div class="overlay">
        <span class="badge">AURORA AGENT</span>
        <h1>Presence starts here.</h1>
        <p id="status">Engine initializing…</p>
      </div>
    </section>
    <aside class="panel">
      <h2>Aurora</h2>
      <p class="muted">Aura System agent core</p>
      <div class="state"><span>Connection</span><strong id="connection">Local</strong></div>
      <div class="state"><span>Agent protocol</span><strong>Ready</strong></div>
    </aside>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

const app = new Application(canvas, {
  graphicsDeviceOptions: { antialias: true, deviceTypes: [GraphicsDevice.WEBGL2] }
});
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
app.start();
app.scene.ambientLight = new Color(0.08, 0.1, 0.16);

status.textContent = '3D engine ready — avatar system is modular and ready for future assets.';

const demoEvent: AgentEvent = {
  type: 'agent.status',
  timestamp: new Date().toISOString(),
  payload: { state: 'ready' }
};
console.debug('[Aurora]', demoEvent);
