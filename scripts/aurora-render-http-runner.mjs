const baseUrl = String(process.env.AURORA_BASE_URL || 'https://aurora-agent-o9x5.onrender.com').replace(/\/$/, '');
const token = String(process.env.AURORA_CONTROL_TOKEN || '').trim();
const operation = String(process.env.AURORA_REMOTE_OPERATION || 'diagnostics.test').trim();
const timeoutMs = Math.max(1000, Math.min(120000, Number(process.env.AURORA_REMOTE_TIMEOUT_MS || 30000)));

if (!token) throw new Error('AURORA_CONTROL_TOKEN is required');

const allowed = new Set(['health', 'live.diagnostics', 'aura.health', 'aura.diagnostics', 'diagnostics.test', 'supreme.smoke']);
if (!allowed.has(operation)) throw new Error(`operation_not_allowed:${operation}`);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(`${baseUrl}/api/control`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'aurora-render-http-runner/1.1',
    },
    body: JSON.stringify({ operation, args: { type: 'TELEMETRY', source: 'render-http-runner' } }),
    signal: controller.signal,
  });

  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 4000) }; }

  const result = { ok: response.ok && body?.ok !== false, status: response.status, operation, target: `${baseUrl}/api/control`, result: body };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} finally {
  clearTimeout(timer);
}
