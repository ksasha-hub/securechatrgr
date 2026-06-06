import { logger } from './logger.js';

/**
 * In-memory room manager.
 * Rooms hold at most 2 WebSocket peers.
 * Destroyed room IDs are blocked for TTL to prevent code reuse.
 */
export class RoomManager {
  /** @type {Map<string, { peers: Set<WebSocket>, createdAt: number, destroyedAt?: number }>} */
  #rooms = new Map();
  #ttlMs;
  #cleanupTimer;

  constructor({ ttlMs = 3_600_000, cleanupIntervalMs = 60_000 } = {}) {
    this.#ttlMs = ttlMs;
    this.#cleanupTimer = setInterval(() => this.#cleanup(), cleanupIntervalMs);
    this.#cleanupTimer.unref?.();
  }

  /** Create a new room. Returns { ok, reason? } */
  create(roomId) {
    const existing = this.#rooms.get(roomId);
    if (existing) {
      if (existing.destroyedAt) {
        // Blocked: same code cannot be reused within TTL
        const age = Date.now() - existing.destroyedAt;
        if (age < this.#ttlMs) return { ok: false, reason: 'room_blocked' };
        // TTL passed — allow recreation
        this.#rooms.delete(roomId);
      } else {
        return { ok: false, reason: 'room_exists' };
      }
    }
    this.#rooms.set(roomId, { peers: new Set(), createdAt: Date.now() });
    return { ok: true };
  }

  /** Check if room exists and is active */
  exists(roomId) {
    const room = this.#rooms.get(roomId);
    return !!(room && !room.destroyedAt);
  }

  /** Join a room. Returns { ok, peerCount?, reason? } */
  join(roomId, ws) {
    const room = this.#rooms.get(roomId);
    if (!room || room.destroyedAt) return { ok: false, reason: 'room_not_found' };
    if (room.peers.size >= 2) return { ok: false, reason: 'room_full' };

    room.peers.add(ws);
    return { ok: true, peerCount: room.peers.size };
  }

  /** Leave a room. Destroys room if empty. */
  leave(roomId, ws) {
    const room = this.#rooms.get(roomId);
    if (!room) return;

    room.peers.delete(ws);

    // Notify remaining peer
    room.peers.forEach(peer => {
      if (peer.readyState === 1 /* OPEN */) {
        peer.send(JSON.stringify({ type: 'peer_left' }));
      }
    });

    if (room.peers.size === 0) {
      room.destroyedAt = Date.now();
      logger.info({ event: 'room_destroyed', roomId: roomId.slice(0, 8) + '…' });
    }
  }

  /** Broadcast to all peers except sender */
  broadcast(roomId, sender, payload) {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    room.peers.forEach(peer => {
      if (peer !== sender && peer.readyState === 1) {
        peer.send(payload);
      }
    });
  }

  /** Stats for health endpoint — no sensitive data */
  stats() {
    let activeRooms = 0;
    let activeConnections = 0;
    let blockedRooms = 0;

    for (const room of this.#rooms.values()) {
      if (room.destroyedAt) {
        blockedRooms++;
      } else {
        activeRooms++;
        activeConnections += room.peers.size;
      }
    }
    return { activeRooms, activeConnections, blockedRooms };
  }

  destroy() {
    clearInterval(this.#cleanupTimer);
    this.#rooms.clear();
  }

  #cleanup() {
    const now = Date.now();
    for (const [id, room] of this.#rooms.entries()) {
      const age = now - (room.destroyedAt ?? room.createdAt);
      if (age > this.#ttlMs) {
        // Close any lingering connections
        room.peers.forEach(ws => {
          if (ws.readyState === 1) ws.close(1001, 'Room expired');
        });
        this.#rooms.delete(id);
      }
    }
  }
}
