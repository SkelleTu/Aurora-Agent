const DEFAULT_TIMEOUT_MS = 30000;

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

export function createAuraBridge(config = {}) {
  const baseUrl = config.baseUrl ?? process.env.AURA_SYSTEM_URL ?? '';
  const token = config.token ?? process.env.AURA_SYSTEM_TOKEN ?? '';
  const timeoutMs = Number(config.timeoutMs ?? process.env.AURA_SYSTEM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  async function request(path, { method = 'GET', body, signal } = {}) {
    if (!baseUrl) return { ok: false, configured: false, reason: 'AURA_SYSTEM_URL is not configured.' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(joinUrl(baseUrl, path), {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : null; } catch { result = { raw: text }; }
      return { ok: response.ok, status: response.status, configured: true, result };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    configured: Boolean(baseUrl),
    async health(signal) {
      const result = await request('/api/healthz', { signal });
      return { ok: result.ok, status: result.status, configured: result.configured, result: result.result };
    },
    async capabilities(signal) {
      return request('/api/capabilities', { signal });
    },
    async diagnostics(traceId, signal) {
      const path = traceId ? `/api/diagnostics/aurora/${encodeURIComponent(traceId)}` : '/api/diagnostics/aurora';
      return request(path, { signal });
    },
    async recordDiagnostic(event, signal) {
      return request('/api/diagnostics/aurora/event', { method: 'POST', body: event, signal });
    },
    async dispatch({ domain, action, args = {}, signal } = {}) {
      if (!domain || !action) return { ok: false, dispatched: false, reason: 'domain and action are required.' };
      const result = await request('/api/agent/action', { method: 'POST', body: { domain, action, args }, signal });
      return { ok: result.ok, dispatched: result.ok, status: result.status, result: result.result };
    },
  };
}
