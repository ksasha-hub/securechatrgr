import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';

describe('RoomManager', () => {
  let rooms;

  before(() => { rooms = new RoomManager({ ttlMs: 500, cleanupIntervalMs: 100 }); });
  after(() => rooms.destroy());

  const id = 'a'.repeat(64);
  const id2 = 'b'.repeat(64);

  it('creates a room', () => {
    const r = rooms.create(id);
    assert.equal(r.ok, true);
  });

  it('rejects duplicate room', () => {
    const r = rooms.create(id);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'room_exists');
  });

  it('reports existence', () => {
    assert.equal(rooms.exists(id), true);
    assert.equal(rooms.exists(id2), false);
  });

  it('joins a room', () => {
    const fakeWs = { readyState: 1, send: () => {} };
    const r = rooms.join(id, fakeWs);
    assert.equal(r.ok, true);
    assert.equal(r.peerCount, 1);
  });

  it('rejects join on non-existent room', () => {
    const r = rooms.join(id2, {});
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'room_not_found');
  });

  it('limits to 2 peers', () => {
    const ws1 = { readyState: 1, send: () => {} };
    const ws2 = { readyState: 1, send: () => {} };
    const ws3 = { readyState: 1, send: () => {} };
    rooms.create(id2);
    rooms.join(id2, ws1);
    rooms.join(id2, ws2);
    const r = rooms.join(id2, ws3);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'room_full');
  });

  it('blocks reuse within TTL after destroy', async () => {
    const id3 = 'c'.repeat(64);
    rooms.create(id3);
    const ws = { readyState: 1, send: () => {} };
    rooms.join(id3, ws);
    rooms.leave(id3, ws);
    const r = rooms.create(id3);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'room_blocked');
  });

  it('stats returns correct counts', () => {
    const s = rooms.stats();
    assert.ok(typeof s.activeRooms === 'number');
    assert.ok(typeof s.activeConnections === 'number');
  });
});
