import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(root, 'backend/server.mjs');
let source = await readFile(serverPath, 'utf8');

const importMarker = "import { createAuroraControl } from './control/index.mjs';";
if (!source.includes(importMarker)) {
  const anchor = "import { createAuraBridge } from './aurora/bridge.mjs';";
  if (!source.includes(anchor)) throw new Error('aurora_start_patch_anchor_missing:aurora_bridge_import');
  source = source.replace(anchor, `${anchor}\n${importMarker}`);
}

const instanceMarker = 'const auroraControl = createAuroraControl({';
if (!source.includes(instanceMarker)) {
  const anchor = 'const aurora = createAuroraCore({ provider, auraBridge });';
  if (!source.includes(anchor)) throw new Error('aurora_start_patch_anchor_missing:aurora_core');
  const block = `${anchor}\nconst auroraControl = createAuroraControl({\n  auraBridge,\n  getLiveDiagnostics,\n  recordLiveTelemetry,\n  getHealth: async () => ({\n    ok: true,\n    agent: 'aurora',\n    version: '0.9.0',\n    provider: provider.name,\n    model: provider.model,\n    configured: provider.configured ?? true,\n    voice: Boolean(HF_TOKEN),\n    web: existsSync(join(webRoot, 'index.html')),\n    auraBridge: { configured: auraBridge.configured },\n    live: {\n      configured: LIVE_PROVIDER === 'gemini' ? Boolean(GOOGLE_API_KEY) : Boolean(HF_TOKEN),\n      provider: LIVE_PROVIDER,\n      transport: 'websocket',\n      model: LIVE_PROVIDER === 'gemini' ? GEMINI_LIVE_MODEL : provider.model,\n      language: LIVE_LANGUAGE,\n    },\n  }),\n});`;
  source = source.replace(anchor, block);
}

const routeMarker = "requestUrl.pathname === '/api/control'";
if (!source.includes(routeMarker)) {
  const anchor = "if (req.method === 'GET' && requestUrl.pathname === '/api/aura/diagnostics') return json(res, 200, await auraBridge.diagnostics(requestUrl.searchParams.get('traceId'), req.signal));";
  if (!source.includes(anchor)) throw new Error('aurora_start_patch_anchor_missing:diagnostics_route');
  const block = `${anchor}\n    if (requestUrl.pathname === '/api/control') {\n      if (req.method === 'GET') return json(res, 200, { version: auroraControl.version, operations: auroraControl.operations, enabled: Boolean(process.env.AURORA_CONTROL_TOKEN) });\n      if (req.method === 'POST') {\n        const configuredToken = process.env.AURORA_CONTROL_TOKEN;\n        if (!configuredToken) return json(res, 503, { ok: false, error: 'control_not_configured' });\n        const authorization = String(req.headers.authorization || '');\n        const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';\n        if (!suppliedToken || suppliedToken !== configuredToken) return json(res, 401, { ok: false, error: 'control_unauthorized' });\n        const body = await readJson(req);\n        const operation = String(body.operation || '');\n        const args = body.args && typeof body.args === 'object' ? { ...body.args } : {};\n        const result = await auroraControl.execute(operation, args);\n        return json(res, result.ok ? 200 : 503, result);\n      }\n    }`;
  source = source.replace(anchor, block);
}

await writeFile(serverPath, source, 'utf8');
await import(pathToFileURL(serverPath).href + `?auroraControl=${Date.now()}`);

if (process.env.AURORA_SELF_TEST === 'true') {
  setTimeout(async () => {
    try {
      const { spawn } = await import('node:child_process');
      const child = spawn(process.execPath, ['scripts/aurora-render-self-test.mjs'], {
        cwd: root,
        env: { ...process.env },
        stdio: 'inherit',
      });
      child.on('error', (error) => console.error(`Aurora Render self-test error: ${error.message}`));
      child.on('close', (code) => console.log(`Aurora Render self-test exit=${code}`));
    } catch (error) {
      console.error(`Aurora Render self-test launch failed: ${error?.message || String(error)}`);
    }
  }, 3000);
}
