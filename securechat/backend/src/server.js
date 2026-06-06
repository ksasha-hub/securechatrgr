import express from 'express';
import http from 'http';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { createHash, timingSafeEqual } from 'crypto';
import { RoomManager } from './rooms.js';
import { logger } from './logger.js';

const PORT = process.env.PORT || 3001;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const JOIN_RATE_WINDOW_MS = parseInt(process.env.JOIN_RATE_WINDOW_MS || '60000');
const JOIN_RATE_MAX = parseInt(process.env.JOIN_RATE_MAX || '10');
const MAX_WS_FRAME_BYTES = parseInt(process.env.MAX_WS_FRAME_BYTES || '65536');
const MAX_MSG_BYTES = parseInt(process.env.MAX_MSG_BYTES || '32768');
const ROOM_TTL_MS = parseInt(process.env.ROOM_TTL_MS || '3600000');
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS || '60000');

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
}));

app.use(express.json({ limit: '4kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const joinLimiter = rateLimit({
  windowMs: JOIN_RATE_WINDOW_MS,
  max: JOIN_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// ── Room manager ──────────────────────────────────────────────────────────────
const rooms = new RoomManager({ ttlMs: ROOM_TTL_MS, cleanupIntervalMs: CLEANUP_INTERVAL_MS });

// ── REST endpoints ────────────────────────────────────────────────────────────

// Health / liveness
app.get('/healthz/live', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// Readiness (includes room stats — no sensitive data)
app.get('/healthz/ready', (_req, res) => {
  const stats = rooms.stats();
  res.json({ status: 'ok', ...stats, ts: Date.now() });
});

// Create room: body = { roomId: hex-sha256 }
app.post('/api/rooms', joinLimiter, (req, res) => {
  const { roomId } = req.body;
  if (!isValidRoomId(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  // Artificial delay to prevent timing-based room enumeration
  setTimeout(() => {
    const result = rooms.create(roomId);
    if (!result.ok) {
      return res.status(409).json({ error: result.reason });
    }
    logger.info({ event: 'room_created', roomId: redact(roomId) });
    res.status(201).json({ ok: true });
  }, randomDelay(50, 150));
});

// Check room existence
app.get('/api/rooms/:roomId', joinLimiter, (req, res) => {
  const { roomId } = req.params;
  if (!isValidRoomId(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  setTimeout(() => {
    const exists = rooms.exists(roomId);
    // Always respond with same structure regardless of existence
    res.json({ exists });
  }, randomDelay(50, 150));
});

// ── HTTP server + WebSocket ───────────────────────────────────────────────────
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: MAX_WS_FRAME_BYTES,
});

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  let roomId = null;
  let joined = false;

  ws.on('message', (rawData, isBinary) => {
    if (isBinary) return ws.close(1003, 'Binary not supported');

    let msg;
    try {
      const text = rawData.toString('utf8');
      if (Buffer.byteLength(text) > MAX_MSG_BYTES) return ws.close(1009, 'Message too large');
      msg = JSON.parse(text);
    } catch {
      return ws.close(1007, 'Invalid JSON');
    }

    if (!joined) {
      // First message must be a join
      if (msg.type !== 'join' || !isValidRoomId(msg.roomId)) {
        return ws.close(1008, 'Must join first');
      }

      roomId = msg.roomId;
      const result = rooms.join(roomId, ws);

      if (!result.ok) {
        ws.send(JSON.stringify({ type: 'error', code: result.reason }));
        return ws.close(1008, result.reason);
      }

      joined = true;
      logger.info({ event: 'peer_joined', roomId: redact(roomId), ip: redact(ip) });

      ws.send(JSON.stringify({ type: 'joined', peerCount: result.peerCount }));

      // Notify other peer
      if (result.peerCount === 2) {
        rooms.broadcast(roomId, ws, JSON.stringify({ type: 'peer_arrived' }));
      }
      return;
    }

    // Relay message types
    const allowed = ['offer', 'answer', 'ice', 'chat', 'typing', 'key_ack', 'key_pub', 'read'];
    if (!allowed.includes(msg.type)) {
      return ws.send(JSON.stringify({ type: 'error', code: 'unknown_type' }));
    }

    const payload = JSON.stringify(msg);
    rooms.broadcast(roomId, ws, payload);
  });

  ws.on('close', () => {
    if (roomId && joined) {
      rooms.leave(roomId, ws);
      logger.info({ event: 'peer_left', roomId: redact(roomId) });
    }
  });

  ws.on('error', (err) => {
    logger.warn({ event: 'ws_error', err: err.message });
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info({ event: 'shutdown', signal });
  wss.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
  rooms.destroy();
  server.close(() => {
    logger.info({ event: 'shutdown_complete' });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  logger.info({ event: 'server_start', port: PORT });
});

export { server, wss, rooms };

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidRoomId(id) {
  return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id);
}

function randomDelay(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

function redact(str) {
  if (!str) return '';
  return str.slice(0, 8) + '…';
}
