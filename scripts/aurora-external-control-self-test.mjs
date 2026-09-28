const baseUrl = String(process.env.RENDER_EXTERNAL_URL || process.env.AURORA_BASE_URL || `http://127.0.0.1:${process.env.PORT || 10000}`).replace(/\/$/, '');
const token = String(process.env.AURORA_CONTROL_TOKEN || '').trim();
const operation = String(process.env.AURORA_EXTERNAL_SELF_TEST_OPERATION || 'diagnostics.test').trim();
const timeoutMs = Math.max(1000, Math.min(120000, Number(process.env.AURORA_EXTERNAL_SELF_TEST_TIMEOUT_MS || 30000)));

if (!token) throw new Error('AURORA_CONTROL_TOKEN is required');
const allowed = new Set(['health', 'live.diagnostics', 'aura.health', 'aura.diagnostics', 'diagnostics.test']);
if (!allowed.has(operation)) throw new Error(`operation_not_allowed:${operation}`);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const health = await fetch(`${baseUrl}/health`, { signal: controller.signal });
  if (!health.ok) throw new Error(`health_failed:${health.status}`);
  const response = await fetch(`${baseUrl}/api/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'user-agent': 'aurora-external-control-self-test/1.0' },
    body: JSON.stringify({ operation, args: { type: 'TELEMETRY', source: 'render-external-self-test' } }),
    signal: controller.signal,
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 4000) }; }
  const result = { ok: response.ok && body?.ok !== false, status: response.status, operation, baseUrl, result: body };
  console.log(`[Aurora external control self-test] ${JSON.stringify(result)}`);
  if (!result.ok) process.exitCode = 1;
} finally { clearTimeout(timer); }
