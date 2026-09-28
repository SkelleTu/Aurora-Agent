const DEFAULT_TIMEOUT_MS = 30000;

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

export function createAuraBridge(config = {}) {
  const baseUrl = config.baseUrl ?? process.env.AURA_SYSTEM_URL ?? '';
  const token = config.token ?? process.env.AURA_SYSTEM_TOKEN ?? '';
  const timeoutMs = Number(config.timeoutMs ?? process.env.AURA_SYSTEM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  return {
    configured: Boolean(baseUrl),
    async health(signal) {
      if (!baseUrl) return { ok: false, configured: false, reason: 'AURA_SYSTEM_URL is not configured.' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(joinUrl(baseUrl, '/health'), {
          method: 'GET',
          headers: token ? { authorization: `Bearer ${token}` } : {},
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        });
        return { ok: response.ok, status: response.status, configured: true };
      } finally {
        clearTimeout(timer);
      }
    },
    async dispatch({ domain, action, args = {}, signal } = {}) {
      if (!baseUrl) return { ok: false, dispatched: false, configured: false, reason: 'AURA_SYSTEM_URL is not configured.' };
      if (!domain || !action) return { ok: false, dispatched: false, reason: 'domain and action are required.' };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(joinUrl(baseUrl, '/api/agent/action'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ domain, action, args }),
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        });
        const text = await response.text();
        let result;
        try { result = text ? JSON.parse(text) : null; } catch { result = { raw: text }; }
        if (!response.ok) return { ok: false, dispatched: false, status: response.status, result };
        return { ok: true, dispatched: true, status: response.status, result };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
