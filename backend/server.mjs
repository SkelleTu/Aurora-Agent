import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAIProvider } from './providers/index.mjs';
import { createAuroraCore } from './agent/core.mjs';

const port = Number(process.env.PORT || process.env.AURORA_PORT || 8787);
const webRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const provider = createAIProvider();
const aurora = createAuroraCore({ provider });

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function serveWeb(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(join(webRoot, relative));
  const candidate = safePath.startsWith(webRoot) ? safePath : join(webRoot, 'index.html');
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(webRoot, 'index.html');

  if (!existsSync(file)) return json(res, 503, { error: 'web_build_missing' });

  res.writeHead(200, {
    'content-type': contentTypes[extname(file)] || 'application/octet-stream',
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, {
        ok: true,
        agent: 'aurora',
        version: '0.3.0',
        provider: provider.name,
        model: provider.model,
        web: existsSync(join(webRoot, 'index.html')),
      });
    }

    if (req.method === 'POST' && req.url === '/api/session') {
      return json(res, 200, { sessionId: crypto.randomUUID(), status: 'ready' });
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = await readJson(req);
      const result = await aurora.handleMessage({
        sessionId: body.sessionId,
        message: body.message,
        signal: req.signal,
      });

      return json(res, 200, {
        ...result,
        events: [
          {
            type: 'agent.message',
            timestamp: new Date().toISOString(),
            payload: { text: result.message },
          },
          ...result.actions.map((action) => ({
            type: 'agent.action',
            timestamp: new Date().toISOString(),
            payload: action,
          })),
        ],
      });
    }

    if (req.method === 'GET') return serveWeb(req, res);
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[Aurora]', error);
    return json(res, 500, {
      error: 'aurora_request_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Aurora backend listening on port ${port}`);
});
