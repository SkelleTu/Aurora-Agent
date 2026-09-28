const operation = String(process.argv[2] || '').trim();
const baseUrl = String(process.env.AURORA_BASE_URL || '').replace(/\/$/, '');

if (!operation) {
  console.error(JSON.stringify({ ok: false, error: 'operation_required', operations: ['health', 'live.diagnostics', 'aura.health', 'aura.diagnostics', 'diagnostics.test', 'smoke.live'] }, null, 2));
  process.exit(2);
}

const operations = {
  health: async () => fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10000) }),
  'live.diagnostics': async () => fetch(`${baseUrl}/api/live/diagnostics`, { signal: AbortSignal.timeout(10000) }),
  'aura.health': async () => fetch(`${baseUrl}/api/aura/status`, { signal: AbortSignal.timeout(10000) }),
  'aura.diagnostics': async () => fetch(`${baseUrl}/api/aura/diagnostics`, { signal: AbortSignal.timeout(15000) }),
  'diagnostics.test': async () => fetch(`${baseUrl}/api/diagnostics/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'TELEMETRY' }), signal: AbortSignal.timeout(15000) }),
  'smoke.live': async () => {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/aurora-live-smoke.mjs'], { env: { ...process.env, AURORA_BASE_URL: baseUrl }, stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', code => resolve({ ok: code === 0, status: code }));
    });
  },
};

if (!baseUrl) throw new Error('AURORA_BASE_URL is required');
if (!operations[operation]) throw new Error(`operation_not_allowed:${operation}`);

const result = await operations[operation]();
if (result && typeof result.json === 'function') {
  const body = await result.json();
  console.log(JSON.stringify({ ok: result.ok, status: result.status, operation, result: body }, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} else {
  console.log(JSON.stringify({ operation, ...result }, null, 2));
  process.exitCode = result?.ok === false ? 1 : 0;
}
