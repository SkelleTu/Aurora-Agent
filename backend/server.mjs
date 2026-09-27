import http from 'node:http';

const port = Number(process.env.AURORA_PORT || 8787);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, agent: 'aurora', version: '0.1.0' }));
  }

  if (req.method === 'POST' && req.url === '/api/session') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ sessionId: crypto.randomUUID(), status: 'ready' }));
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Aurora backend listening on http://localhost:${port}`);
});
