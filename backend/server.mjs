import http from 'node:http';
import { createAIProvider } from './providers/index.mjs';
import { createAuroraCore } from './agent/core.mjs';

const port = Number(process.env.AURORA_PORT || 8787);
const provider = createAIProvider();
const aurora = createAuroraCore({ provider });

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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
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
        version: '0.2.0',
        provider: provider.name,
        model: provider.model,
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
  console.log(`Aurora backend listening on http://localhost:${port}`);
});
