const DEFAULT_TIMEOUT_MS = 50000;

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

function id(value) {
  const text = String(value ?? '').trim();
  return text || crypto.randomUUID();
}

function operatorMode(value) {
  const mode = String(value ?? process.env.AURORA_OPERATOR_MODE ?? 'supreme').trim().toLowerCase();
  return mode || 'supreme';
}

export function createAuraBridge(config = {}) {
  const baseUrl = config.baseUrl ?? process.env.AURA_SYSTEM_URL ?? '';
  const gatewayUrl = config.gatewayUrl ?? process.env.UNIVERSAL_SERVER_URL ?? '';
  const token = config.token ?? process.env.AURA_SYSTEM_TOKEN ?? process.env.AURA_AGENT_TOKEN ?? '';
  const timeoutMs = Number(config.timeoutMs ?? process.env.AURA_SYSTEM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const mode = operatorMode(config.operatorMode);

  async function request(path, { method = 'GET', body, signal, traceId, requestId, base = baseUrl } = {}) {
    if (!base) return { ok: false, configured: false, reason: 'Remote service URL is not configured.', traceId, requestId };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const resolvedTraceId = id(traceId);
    const resolvedRequestId = id(requestId);
    try {
      const headers = {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-trace-id': resolvedTraceId,
        'x-request-id': resolvedRequestId,
        'x-aurora-operator-mode': mode,
      };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(joinUrl(base, path), {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : null; } catch { result = { raw: text }; }
      return {
        ok: response.ok,
        status: response.status,
        configured: true,
        latencyMs: Date.now() - startedAt,
        traceId: response.headers.get('x-trace-id') ?? resolvedTraceId,
        requestId: response.headers.get('x-request-id') ?? resolvedRequestId,
        result,
      };
    } catch (error) {
      return {
        ok: false,
        configured: true,
        latencyMs: Date.now() - startedAt,
        timedOut: error instanceof Error && error.name === 'AbortError',
        traceId: resolvedTraceId,
        requestId: resolvedRequestId,
        reason: error instanceof Error ? error.message : 'Remote request failed',
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function dispatch({ domain, action, args = {}, traceId, requestId, signal, target = 'gateway' } = {}) {
    if (!domain || !action) return { ok: false, dispatched: false, reason: 'domain and action are required.' };
    const resolvedTraceId = id(traceId);
    const resolvedRequestId = id(requestId);
    const supremeRequest = {
      domain,
      action,
      args,
      operatorMode: mode,
      traceId: resolvedTraceId,
      requestId: resolvedRequestId,
    };
    const useGateway = target !== 'aura' && Boolean(gatewayUrl);
    const result = await request('/api/agent/action', {
      method: 'POST',
      body: supremeRequest,
      traceId: resolvedTraceId,
      requestId: resolvedRequestId,
      signal,
      base: useGateway ? gatewayUrl : baseUrl,
    });
    return {
      ok: result.ok,
      dispatched: result.ok,
      status: result.status,
      latencyMs: result.latencyMs,
      timedOut: result.timedOut,
      traceId: result.traceId,
      requestId: result.requestId,
      operatorMode: mode,
      target: useGateway ? 'universal' : 'aura',
      reason: result.reason,
      result: result.result,
    };
  }

  async function tooling(signal) {
    const result = await request('/api/agent/tooling', { signal, base: gatewayUrl || baseUrl });
    return { ...result, operatorMode: mode };
  }

  async function executeTooling({ steps = [], dryRun = false, stopOnError = true, maxSteps = 32, traceId, requestId, signal } = {}) {
    const resolvedTraceId = id(traceId);
    const resolvedRequestId = id(requestId);
    const result = await request('/api/agent/tooling/execute', {
      method: 'POST',
      body: { steps, dryRun, stopOnError, maxSteps },
      traceId: resolvedTraceId,
      requestId: resolvedRequestId,
      signal,
      base: gatewayUrl || baseUrl,
    });
    return {
      ...result,
      traceId: result.traceId ?? resolvedTraceId,
      requestId: result.requestId ?? resolvedRequestId,
      operatorMode: mode,
    };
  }

  return {
    configured: Boolean(baseUrl || gatewayUrl),
    gatewayConfigured: Boolean(gatewayUrl),
    operatorMode: mode,
    async health(signal) {
      const result = await request('/api/healthz', { signal, base: gatewayUrl || baseUrl });
      return { ok: result.ok, status: result.status, configured: result.configured, latencyMs: result.latencyMs, traceId: result.traceId, requestId: result.requestId, result: result.result, reason: result.reason };
    },
    async capabilities(signal) {
      const result = await request('/api/agent/capabilities', { signal, base: gatewayUrl || baseUrl });
      return { ...result, operatorMode: mode };
    },
    tooling,
    executeTooling,
    async diagnostics(traceId, signal) {
      const path = traceId ? `/api/diagnostics/aurora/${encodeURIComponent(traceId)}` : '/api/diagnostics/aurora';
      return request(path, { signal, traceId, base: baseUrl || gatewayUrl });
    },
    async recordDiagnostic(event, signal) {
      return request('/api/diagnostics/aurora/event', { method: 'POST', body: event, signal, traceId: event?.traceId, requestId: event?.requestId, base: baseUrl || gatewayUrl });
    },
    dispatch,
  };
}
