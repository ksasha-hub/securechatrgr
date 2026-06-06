import { useState } from 'react';
import { generateRoomCode, isValidCode, normalizeCode } from '../utils/code.js';
import { deriveRoomId } from '../crypto/e2e.js';

export function Lobby({ onJoin }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const newCode = generateRoomCode();
      const roomId = await deriveRoomId(normalizeCode(newCode));
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create room');
      }
      onJoin({ roomId, code: newCode, isCreator: true });
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
      const roomId = await deriveRoomId(normalizeCode(trimmed));
      const res = await fetch(`/api/rooms/${roomId}`);
      const data = await res.json();
      if (!data.exists) {
        throw new Error('Room not found or already expired');
      }
      onJoin({ roomId, code: trimmed, isCreator: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function formatCode(val) {
    const clean = val.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 16);
    const parts = clean.match(/.{1,4}/g) || [];
    return parts.join('-');
  }

  return (
    <div className="lobby">
      <header className="lobby-header">
        <div className="logo">
          <span className="logo-icon">🔒</span>
          <span className="logo-text">SecureChat</span>
        </div>
        <p className="lobby-subtitle">
          End-to-end encrypted · One-time rooms · No logs
        </p>
      </header>

      <div className="lobby-cards">
        {/* Create */}
        <div className={`lobby-card ${mode === 'create' ? 'active' : ''}`}>
          <div className="card-icon">✨</div>
          <h2>Create Room</h2>
          <p>Generate a one-time code and share it with your contact</p>
          {mode !== 'create'
            ? <button className="btn btn-primary" onClick={() => setMode('create')}>
                Create New Room
              </button>
            : <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? 'Creating…' : 'Generate Room Code'}
              </button>
          }
        </div>

        {/* Join */}
        <div className={`lobby-card ${mode === 'join' ? 'active' : ''}`}>
          <div className="card-icon">🚪</div>
          <h2>Join Room</h2>
          <p>Enter the code your contact shared with you</p>
          {mode !== 'join'
            ? <button className="btn btn-secondary" onClick={() => setMode('join')}>
                Enter Code
              </button>
            : <form onSubmit={handleJoin} className="join-form">
                <input
                  className="code-input"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={e => setCode(formatCode(e.target.value))}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  {loading ? 'Connecting…' : 'Join Room'}
                </button>
              </form>
          }
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <footer className="lobby-footer">
        <div className="tech-pills">
          <span>ECDH P-256</span>
          <span>AES-256-GCM</span>
          <span>HKDF-SHA-256</span>
          <span>Zero persistence</span>
        </div>
        <p className="footer-note">
          The server only sees encrypted bytes. Keys never leave your browser.
        </p>
      </footer>
    </div>
  );
}
