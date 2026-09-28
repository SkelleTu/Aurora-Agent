const baseUrl = String(process.env.AURORA_BASE_URL || 'https://aurora-agent-o9x5.onrender.com').replace(/\/$/, '');
const token = String(process.env.AURORA_CONTROL_TOKEN || '').trim();
const operation = String(process.argv[2] || 'health').trim();

if (!token) throw new Error('AURORA_CONTROL_TOKEN is required');

const allowed = new Set(['health', 'live.diagnostics', 'aura.health', 'aura.diagnostics', 'diagnostics.test', 'supreme.smoke']);
if (!allowed.has(operation)) throw new Error(`operation_not_allowed:${operation}`);

const response = await fetch(`${baseUrl}/api/control`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'user-agent': 'aurora-control/1.1',
  },
  body: JSON.stringify({ operation, args: { type: 'TELEMETRY', source: 'aurora-control' } }),
});

const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 4000) }; }

const result = { ok: response.ok && body?.ok !== false, status: response.status, operation, result: body };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
