import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const CONTROL_VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

const ALLOWED_OPERATIONS = new Set([
  'health',
  'live.diagnostics',
  'aura.health',
  'aura.diagnostics',
  'diagnostics.test',
  'smoke.live',
]);

function clampTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1000, Math.min(MAX_TIMEOUT_MS, Math.round(parsed)));
}

function runProcess(command, args, { timeoutMs = DEFAULT_TIMEOUT_MS, cwd = process.cwd(), env = {} } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, durationMs: Date.now() - startedAt });
    };
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', (error) => finish({ ok: false, code: null, signal: null, error: error.message, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
    child.on('close', (code, signal) => finish({ ok: code === 0, code, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      finish({ ok: false, code: null, signal: 'SIGTERM', error: `operation_timeout_${timeoutMs}ms`, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    }, timeoutMs);
  });
}

export function createAuroraControl({ auraBridge, getLiveDiagnostics, recordLiveTelemetry, getHealth }) {
  async function execute(operation, args = {}) {
    const traceId = String(args.traceId || randomUUID());
    const startedAt = Date.now();
    recordLiveTelemetry?.('CONTROL_START', traceId, { operation });
    try {
      let result;
      switch (operation) {
        case 'health':
          result = await getHealth();
          break;
        case 'live.diagnostics':
          result = getLiveDiagnostics(String(args.sessionId || ''));
          break;
        case 'aura.health':
          result = auraBridge.configured ? await auraBridge.health(args.signal) : { ok: false, configured: false };
          break;
        case 'aura.diagnostics':
          result = auraBridge.configured ? await auraBridge.diagnostics(args.traceId, args.signal) : { ok: false, configured: false };
          break;
        case 'diagnostics.test': {
          const type = String(args.type || 'TELEMETRY');
          result = type === 'AURA_HEALTH'
            ? (auraBridge.configured ? await auraBridge.health(args.signal) : { ok: false, configured: false })
            : type === 'AURA_DIAGNOSTICS'
              ? (auraBridge.configured ? await auraBridge.diagnostics(args.traceId, args.signal) : { ok: false, configured: false })
              : { ok: true, message: 'telemetry pipeline reachable' };
          break;
        }
        case 'smoke.live': {
          const baseUrl = String(args.baseUrl || '').replace(/\/$/, '');
          if (!baseUrl) throw new Error('baseUrl is required for smoke.live');
          const timeoutMs = clampTimeout(args.timeoutMs);
          result = await runProcess(process.execPath, ['scripts/aurora-live-smoke.mjs'], {
            timeoutMs,
            env: { AURORA_BASE_URL: baseUrl },
          });
          break;
        }
        default:
          throw new Error(`operation_not_allowed:${operation}`);
      }
      const ok = result?.ok !== false;
      recordLiveTelemetry('CONTROL_END', traceId, { operation, ok, durationMs: Date.now() - startedAt });
      return { ok, traceId, operation, durationMs: Date.now() - startedAt, result };
    } catch (error) {
      recordLiveTelemetry('CONTROL_ERROR', traceId, { operation, error: error?.message || String(error), durationMs: Date.now() - startedAt });
      return { ok: false, traceId, operation, durationMs: Date.now() - startedAt, error: error?.message || String(error) };
    }
  }

  return {
    version: CONTROL_VERSION,
    operations: [...ALLOWED_OPERATIONS],
    execute,
  };
}
