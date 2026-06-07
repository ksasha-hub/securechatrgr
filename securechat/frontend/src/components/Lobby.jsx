import { useState } from 'react';
import { generateRoomCode, isValidCode, normalizeCode } from '../utils/code.js';

export function Lobby({ onJoin }) {
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const newCode = generateRoomCode();
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizeCode(newCode) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create room');
      }
      const data = await res.json();
      onJoin({ roomId: data.roomId, code: newCode, isCreator: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setError('');
    const trimmed = code.trim();
    if (!isValidCode(trimmed)) {
      setError('Invalid room code. Format: XXXX-XXXX-XXXX-XXXX');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/by-code/${normalizeCode(trimmed)}`);
      const data = await res.json();
      if (!data.exists) throw new Error('Room not found or already expired');
      onJoin({ roomId: data.roomId, code: trimmed, isCreator: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function formatCode(val) {
    const clean = val.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 16);
    return (clean.match(/.{1,4}/g) || []).join('-');
  }

  return (
    <div className="lobby">
      <header className="lobby-header">
        <div className="logo">
          <span className="logo-icon">🔒</span>
          <span className="logo-text">SecureChat</span>
        </div>
        <p className="lobby-subtitle">End-to-end encrypted · One-time rooms · No logs</p>
      </header>

      <div className="lobby-cards">
        <div className={`lobby-card ${mode === 'create' ? 'active' : ''}`}>
          <div className="card-icon">✨</div>
          <h2>Create Room</h2>
          <p>Generate a one-time code and share it with your contact</p>
          {mode !== 'create'
            ? <button className="btn btn-primary" onClick={() => setMode('create')}>Create New Room</button>
            : <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                {loading ? 'Creating…' : 'Generate Room Code'}
              </button>
          }
        </div>
        <div className={`lobby-card ${mode === 'join' ? 'active' : ''}`}>
          <div className="card-icon">🚪</div>
          <h2>Join Room</h2>
          <p>Enter the code your contact shared with you</p>
          {mode !== 'join'
            ? <button className="btn btn-secondary" onClick={() => setMode('join')}>Enter Code</button>
            : <form onSubmit={handleJoin} className="join-form">
                <input
                  className="code-input"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={e => setCode(formatCode(e.target.value))}
                  autoFocus spellCheck={false} autoComplete="off"
                />
                <button type="submit" className="btn btn-secondary" disabled={loading}>
                  {loading ? 'Connecting…' : 'Join Room'}
                </button>
              </form>
          }
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}
    </div>
  );
}
