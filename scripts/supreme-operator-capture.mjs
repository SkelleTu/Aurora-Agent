const baseUrl = String(process.env.SUPREME_BASE_URL || 'https://universal-server1.onrender.com').replace(/\/$/, '');
const token = String(process.env.AURA_AGENT_TOKEN || '').trim();
const operatorMode = String(process.env.AURORA_OPERATOR_MODE || 'supreme').trim();
const timeoutMs = Math.max(1000, Math.min(120000, Number(process.env.SUPREME_SMOKE_TIMEOUT_MS || 30000)));
const traceId = `supreme-capture-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const headers = {
  'content-type': 'application/json',
  'x-aurora-operator-mode': operatorMode,
  'x-trace-id': traceId,
  'x-request-id': requestId,
  'user-agent': 'aurora-supreme-capture/1.0',
};
if (token) headers.authorization = `Bearer ${token}`;

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: controller.signal,
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { raw: text.slice(0, 4000) }; }
  return { ok: response.ok && result?.ok !== false, status: response.status, result };
}

try {
  const capabilities = await request('GET', '/api/supreme/tool');
  const health = await request('POST', '/api/supreme/tool', {
    target: 'universal',
    action: { domain: 'system', action: 'health', args: {} },
    traceId,
    requestId,
    operatorMode,
  });
  const diagnostics = await request('POST', '/api/supreme/tool', {
    target: 'universal',
    action: { domain: 'system', action: 'diagnostics', args: {} },
    traceId,
    requestId,
    operatorMode,
  });

  const capture = {
    ok: capabilities.ok && health.ok && diagnostics.ok,
    endpoint: `${baseUrl}/api/supreme/tool`,
    operatorMode,
    traceId,
    requestId,
    checks: { capabilities, health, diagnostics },
  };
  console.log(JSON.stringify(capture, null, 2));
  process.exitCode = capture.ok ? 0 : 1;
} finally {
  clearTimeout(timer);
}
