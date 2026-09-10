import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';

const PUBLIC_DIR = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const MAX_BODY = 64 * 1024;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** Routes are [method, pattern, handler]. Patterns use :param segments. */
function buildRoutes(store) {
  return [
    ['GET', '/api/health', () => ({ ok: true, horses: store.listHorses().length })],
    ['GET', '/api/horses', () => store.listHorses()],
    ['POST', '/api/horses', ({ body }) => [201, store.createHorse(body)]],
    ['GET', '/api/horses/:id', ({ params }) => store.getHorse(params.id)],
    ['PATCH', '/api/horses/:id', ({ params, body }) => store.updateHorse(params.id, body)],
    ['GET', '/api/horses/:id/deck', ({ params }) => store.deck(params.id)],
    ['GET', '/api/horses/:id/matches', ({ params }) => store.matchesFor(params.id)],
    ['GET', '/api/horses/:id/stats', ({ params }) => store.stats(params.id)],
    [
      'POST',
      '/api/horses/:id/swipe',
      ({ params, body }) => store.swipe(params.id, String(body.targetId ?? ''), String(body.direction ?? '')),
    ],
    [
      'GET',
      '/api/matches/:id/messages',
      ({ params, query }) => store.messages(params.id, query.get('as') || undefined),
    ],
    [
      'POST',
      '/api/matches/:id/messages',
      ({ params, body }) => [201, store.sendMessage(params.id, String(body.fromId ?? ''), body.text)],
    ],
    [
      'DELETE',
      '/api/matches/:id',
      ({ params, query }) => {
        store.unmatch(params.id, query.get('as') || '');
        return { ok: true };
      },
    ],
  ].map(([method, pattern, handler]) => {
    const keys = [];
    const regex = new RegExp(
      `^${pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      })}/?$`,
    );
    return { method, regex, keys, handler };
  });
}

async function serveStatic(pathname, res) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(PUBLIC_DIR, safe === '/' ? 'index.html' : safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // Unknown paths fall through to the SPA shell.
    filePath = join(PUBLIC_DIR, 'index.html');
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

/**
 * Create the HTTP server. Exported separately from listen() so tests can spin it up on port 0.
 * @param {{ store?: Store }} [opts]
 */
export function createApp(opts = {}) {
  const store = opts.store || new Store();
  const routes = buildRoutes(store);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      await serveStatic(pathname, res);
      return;
    }

    try {
      let matched = false;
      for (const route of routes) {
        const m = route.regex.exec(pathname);
        if (!m) continue;
        matched = true;
        if (route.method !== req.method) continue;
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
        const result = await route.handler({ params, body, query: url.searchParams });
        if (Array.isArray(result) && typeof result[0] === 'number') {
          sendJson(res, result[0], result[1]);
        } else {
          sendJson(res, 200, result);
        }
        return;
      }
      sendJson(res, matched ? 405 : 404, { error: matched ? 'Method not allowed' : 'Not found' });
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Internal server error' : err.message });
    }
  });

  server.store = store;
  return server;
}
