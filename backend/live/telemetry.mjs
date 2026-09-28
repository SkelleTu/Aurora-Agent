const MAX_EVENTS = 2000;
const MAX_SESSIONS = 100;

const events = [];
const sessions = new Map();

function iso() { return new Date().toISOString(); }
function clean(value) {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (['data', 'audio', 'buffer', 'token', 'authorization', 'apiKey', 'content'].includes(key)) continue;
      if (typeof item === 'string' && item.length > 240) out[key] = `${item.slice(0, 240)}…`;
      else if (typeof item !== 'function') out[key] = item;
    }
    return out;
  }
  return value;
}

function ensureSession(sessionId) {
  const id = String(sessionId || 'unknown');
  let session = sessions.get(id);
  if (!session) {
    session = { sessionId: id, startedAt: iso(), lastAt: iso(), counts: {}, lastEvents: [] };
    sessions.set(id, session);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  }
  return session;
}

export function recordLiveTelemetry(type, sessionId, details = {}) {
  const timestamp = iso();
  const session = ensureSession(sessionId);
  session.lastAt = timestamp;
  session.counts[type] = (session.counts[type] || 0) + 1;
  const event = { timestamp, sessionId: session.sessionId, type, ...clean(details) };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  session.lastEvents.push(event);
  if (session.lastEvents.length > 80) session.lastEvents.splice(0, session.lastEvents.length - 80);
  console.log(`[AURORA_TELEMETRY] ${JSON.stringify(event)}`);
  return event;
}

export function closeLiveTelemetry(sessionId, reason = 'closed') {
  const session = ensureSession(sessionId);
  recordLiveTelemetry('LIVE_CLOSE', sessionId, { reason, durationMs: Math.max(0, Date.now() - Date.parse(session.startedAt)) });
}

export function getLiveDiagnostics(sessionId = null) {
  if (sessionId) {
    const session = sessions.get(String(sessionId));
    return session ? { ...session, active: true } : null;
  }
  return {
    generatedAt: iso(),
    activeSessions: [...sessions.values()].map((session) => ({ ...session, active: true })),
    recentEvents: events.slice(-200),
  };
}

export function markLiveSessionInactive(sessionId, reason = 'closed') {
  const session = sessions.get(String(sessionId));
  if (session) {
    session.active = false;
    session.closedAt = iso();
    session.closeReason = reason;
  }
}
