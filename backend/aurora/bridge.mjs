const DEFAULT_TIMEOUT_MS = 50000;

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

function id(value) {
  const text = String(value ?? '').trim();
  return text || crypto.randomUUID();
}

export function createAuraBridge(config = {}) {
  const baseUrl = config.baseUrl ?? process.env.AURA_SYSTEM_URL ?? '';
  const token = config.token ?? process.env.AURA_SYSTEM_TOKEN ?? '';
  const timeoutMs = Number(config.timeoutMs ?? process.env.AURA_SYSTEM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  async function request(path, { method = 'GET', body, signal, traceId, requestId } = {}) {
    if (!baseUrl) return { ok: false, configured: false, reason: 'AURA_SYSTEM_URL is not configured.', traceId, requestId };
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
      };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(joinUrl(baseUrl, path), {
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
        reason: error instanceof Error ? error.message : 'Aura System request failed',
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    configured: Boolean(baseUrl),
    async health(signal) {
      const result = await request('/api/healthz', { signal });
      return { ok: result.ok, status: result.status, configured: result.configured, latencyMs: result.latencyMs, traceId: result.traceId, requestId: result.requestId, result: result.result, reason: result.reason };
    },
    async capabilities(signal) {
      return request('/api/capabilities', { signal });
    },
    async diagnostics(traceId, signal) {
      const path = traceId ? `/api/diagnostics/aurora/${encodeURIComponent(traceId)}` : '/api/diagnostics/aurora';
      return request(path, { signal, traceId });
    },
    async recordDiagnostic(event, signal) {
      return request('/api/diagnostics/aurora/event', { method: 'POST', body: event, signal, traceId: event?.traceId, requestId: event?.requestId });
    },
    async dispatch({ domain, action, args = {}, traceId, requestId, signal } = {}) {
      if (!domain || !action) return { ok: false, dispatched: false, reason: 'domain and action are required.' };
      const resolvedTraceId = id(traceId);
      const resolvedRequestId = id(requestId);
      const result = await request('/api/agent/action', { method: 'POST', body: { domain, action, args, traceId: resolvedTraceId, requestId: resolvedRequestId }, traceId: resolvedTraceId, requestId: resolvedRequestId, signal });
      return {
        ok: result.ok,
        dispatched: result.ok,
        status: result.status,
        latencyMs: result.latencyMs,
        timedOut: result.timedOut,
        traceId: result.traceId,
        requestId: result.requestId,
        reason: result.reason,
        result: result.result,
      };
    },
  };
}
