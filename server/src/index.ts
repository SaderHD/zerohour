import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, HEARTBEAT_MS, MAX_MSG_BYTES } from '@zh/shared';
import { Connection } from './connection';
import { Lobby } from './lobby';

const here = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIST = resolve(process.env.CLIENT_DIST ?? join(here, '../../client/dist'));
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(url.pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = join(CLIENT_DIST, rel);
  if (file !== CLIENT_DIST && !file.startsWith(CLIENT_DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const hashed = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

const http = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  void serveStatic(req, res);
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MSG_BYTES });
const lobby = new Lobby({ debug: process.env.ZH_DEBUG === '1' });
setInterval(() => lobby.sweep(), 5000).unref();
const connections = new Set<Connection>();
wss.on('connection', (socket) => {
  const c = new Connection(socket, lobby);
  connections.add(c);
  socket.on('close', () => connections.delete(c));
});
setInterval(() => {
  for (const c of connections) c.heartbeat();
}, HEARTBEAT_MS).unref();
// Whatever goes wrong in one room must not take the others down with it.
process.on('uncaughtException', (err) => console.error('[zerohour] uncaught', err));
process.on('unhandledRejection', (err) => console.error('[zerohour] unhandled rejection', err));

http.listen(PORT, () => {
  console.log(`[zerohour] listening on http://localhost:${PORT} (client: ${CLIENT_DIST})`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    for (const c of wss.clients) c.close(1001);
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
