import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../dist');

const chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: 'a@g.us',
  type: 'group',
  subject: 'Q3 Brief',
  lastMessageAt: '2026-05-14T13:02:00.000Z',
  lastMessagePreview: 'Hello',
  archived: false,
  mutedUntil: null,
  pinned: true,
  workspace: 'work',
  memberCount: 7,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
};

const triageChat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000010',
  userId: chat.userId,
  jid: 'b@g.us',
  type: 'group',
  subject: 'Triage Test Chat',
  lastMessageAt: '2026-05-15T10:00:00.000Z',
  lastMessagePreview: 'hello triage',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 2,
  unreadCount: 1,
  lastReadMessageId: null,
  lastReadTs: null,
};

const message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: chat.userId,
  chatId: chat.id,
  waMessageId: 'ABC',
  senderJid: '4477@s.whatsapp.net',
  ts: '2026-05-14T13:01:00.000Z',
  kind: 'text',
  text: 'Hello smoke',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (url.pathname === '/api/chats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([chat, triageChat]));
    return;
  }
  if (
    url.pathname.startsWith('/api/chats/') &&
    url.pathname.endsWith('/messages') &&
    req.method === 'GET'
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: [message], nextCursor: null }));
    return;
  }
  if (
    url.pathname.startsWith('/api/chats/') &&
    url.pathname.endsWith('/messages') &&
    req.method === 'POST'
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ...message,
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000051',
        text: 'sent from test',
        status: 'pending',
      }),
    );
    return;
  }
  if (
    url.pathname.startsWith('/api/chats/') &&
    url.pathname.endsWith('/members') &&
    req.method === 'GET'
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([]));
    return;
  }
  if (url.pathname.match(/^\/api\/chats\/[^/]+$/) && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(chat));
    return;
  }
  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // Keep the stream open without sending events.
    return;
  }

  if (
    url.pathname.match(/^\/api\/chats\/[^/]+\/assignment$/) &&
    req.method === 'POST'
  ) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/media/breaker-state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ state: 'closed', retryAt: null }));
    return;
  }

  // Static file fallback to dist/
  const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const buf = await readFile(path.join(DIST, reqPath));
    const ext = path.extname(reqPath);
    const type =
      ext === '.html'
        ? 'text/html'
        : ext === '.js'
          ? 'application/javascript'
          : ext === '.css'
            ? 'text/css'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.woff2'
                ? 'font/woff2'
                : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  } catch {
    // SPA fallback
    const buf = await readFile(path.join(DIST, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(buf);
  }
});

server.listen(5174, () => {
  console.log('fixtures server up on http://localhost:5174');
});
