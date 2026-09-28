const baseUrl = String(process.env.AURORA_SELF_TEST_BASE_URL || 'http://127.0.0.1:10000').replace(/\/$/, '');
const token = String(process.env.AURORA_CONTROL_TOKEN || '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
  let body = null;
  try { body = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, body };
}

const checks = [];

checks.push({ name: 'health', result: await request('/health') });
checks.push({ name: 'control-discovery', result: await request('/api/control') });

if (token) {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  checks.push({
    name: 'control-health',
    result: await request('/api/control', {
      method: 'POST', headers,
      body: JSON.stringify({ operation: 'health' }),
    }),
  });
  checks.push({
    name: 'control-telemetry',
    result: await request('/api/control', {
      method: 'POST', headers,
      body: JSON.stringify({ operation: 'diagnostics.test', args: { type: 'TELEMETRY' } }),
    }),
  });
  checks.push({
    name: 'control-aura-health',
    result: await request('/api/control', {
      method: 'POST', headers,
      body: JSON.stringify({ operation: 'aura.health' }),
    }),
  });
} else {
  checks.push({ name: 'control-token', result: { ok: false, status: 0, body: { error: 'AURORA_CONTROL_TOKEN_not_configured' } } });
}

const failed = checks.filter((check) => !check.result.ok);
for (const check of checks) {
  console.log(JSON.stringify({ selfTest: check.name, ok: check.result.ok, status: check.result.status, body: check.result.body?.ok === undefined ? check.result.body : { ok: check.result.body.ok, operation: check.result.body.operation, configured: check.result.body.configured, status: check.result.body.status } }));
}

if (failed.length) {
  console.error(`Aurora Render self-test failed: ${failed.map((item) => item.name).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ selfTest: 'complete', ok: true, checks: checks.length }));
}
