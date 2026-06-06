import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateKeyPair, exportPublicKey, importPublicKey,
  deriveSharedKey, computeSAS, encrypt, decrypt,
} from '../crypto/e2e.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { playNotification, playConnect } from '../utils/audio.js';
import { QRCode } from './QRCode.jsx';
import { SASPanel } from './SASPanel.jsx';
import { RoomTimer } from './RoomTimer.jsx';

const TYPING_THROTTLE_MS = 1000;
const TYPING_TIMEOUT_MS = 3000;

export function Chat({ session, onLeave }) {
  const { roomId, code, isCreator } = session;

  // Crypto state
  const keyPairRef = useRef(null);
  const myPubHexRef = useRef(null);
  const sharedKeyRef = useRef(null);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [sas, setSAS] = useState(null);
  const [sasVerified, setSasVerified] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [status, setStatus] = useState('waiting'); // waiting | connected | disconnected
  const [blurred, setBlurred] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const inactivityTimerRef = useRef(null);

  // ── Init crypto ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const kp = await generateKeyPair();
      const pub = await exportPublicKey(kp.publicKey);
      keyPairRef.current = kp;
      myPubHexRef.current = pub;
    })();
  }, []);

  // ── Inactivity blur ─────────────────────────────────────────────────────────
  function resetInactivity() {
    setBlurred(false);
    clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => setBlurred(true), 5 * 60 * 1000);
  }

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetInactivity));
    resetInactivity();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivity));
      clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerTyping]);

  // ── WebSocket message handler ───────────────────────────────────────────────
  const handleMessage = useCallback(async (msg) => {
    switch (msg.type) {
      case 'joined':
        // Send our public key
        send({ type: 'key_pub', pub: myPubHexRef.current });
        break;

      case 'peer_arrived':
        setPeerOnline(true);
        setStatus('connected');
        playConnect();
        send({ type: 'key_pub', pub: myPubHexRef.current });
        break;

      case 'peer_left':
        setPeerOnline(false);
        setStatus('disconnected');
        sharedKeyRef.current = null;
        setCryptoReady(false);
        setSAS(null);
        addSystemMsg('Peer disconnected.');
        break;

      case 'key_pub': {
        const theirPub = await importPublicKey(msg.pub);
        const sharedKey = await deriveSharedKey(keyPairRef.current.privateKey, theirPub);
        sharedKeyRef.current = sharedKey;
        const fingerprint = await computeSAS(myPubHexRef.current, msg.pub);
        setSAS(fingerprint);
        setCryptoReady(true);
        send({ type: 'key_ack' });
        break;
      }

      case 'key_ack':
        setPeerOnline(true);
        setStatus('connected');
        playConnect();
        break;

      case 'chat': {
        if (!sharedKeyRef.current) break;
        try {
          const plain = await decrypt(sharedKeyRef.current, { nonce: msg.nonce, ct: msg.ct });
          const parsed = JSON.parse(plain);
          addMessage({ from: 'peer', text: parsed.text, ts: Date.now() });
          playNotification();
          send({ type: 'read', id: msg.id });
        } catch (e) {
          addSystemMsg('⚠️ Failed to decrypt message — possible tampering.');
        }
        break;
      }

      case 'typing':
        setPeerTyping(true);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), TYPING_TIMEOUT_MS);
        break;

      case 'read':
        setMessages(prev => prev.map(m =>
          m.id === msg.id ? { ...m, read: true } : m
        ));
        break;

      default:
        break;
    }
  }, []);

  const { connect, send, close } = useWebSocket({
    onMessage: handleMessage,
    onClose: () => {
      setStatus('disconnected');
      setPeerOnline(false);
    },
  });

  useEffect(() => {
    connect(roomId);
    return () => close();
  }, [roomId]);

  // ── Send message ────────────────────────────────────────────────────────────
  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !cryptoReady || !sharedKeyRef.current) return;

    const id = crypto.randomUUID();
    const payload = JSON.stringify({ text });
    const { nonce, ct } = await encrypt(sharedKeyRef.current, payload);

    send({ type: 'chat', id, nonce, ct });
    addMessage({ id, from: 'me', text, ts: Date.now(), read: false });
    setInput('');
  }

  // ── Typing indicator ────────────────────────────────────────────────────────
  function handleInputChange(e) {
    setInput(e.target.value);
    const now = Date.now();
    if (cryptoReady && now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
      send({ type: 'typing' });
      lastTypingSentRef.current = now;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function addMessage(msg) {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), ...msg }]);
  }

  function addSystemMsg(text) {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), from: 'system', text, ts: Date.now() }]);
  }

  const statusLabel = {
    waiting: '⏳ Waiting for peer…',
    connected: '🟢 Peer connected',
    disconnected: '🔴 Peer disconnected',
  }[status];

  return (
    <div className="chat-container" onClick={resetInactivity}>
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          <button className="btn-ghost" onClick={onLeave} title="Leave room">← Leave</button>
          <div className="room-code-display" onClick={() => setShowQR(!showQR)} title="Show QR">
            🔑 {code}
          </div>
        </div>
        <div className="chat-header-center">
          <span className={`status-dot ${status}`}></span>
          <span className="status-label">{statusLabel}</span>
        </div>
        <div className="chat-header-right">
          <RoomTimer ttlMs={3600000} />
        </div>
      </header>

      {/* SAS fingerprint banner */}
      {sas && (
        <SASPanel sas={sas} verified={sasVerified} onVerify={() => setSasVerified(true)} />
      )}

      {/* QR Panel */}
      {showQR && (
        <div className="qr-panel">
          <QRCode value={`${location.origin}?code=${encodeURIComponent(code)}`} />
          <p className="qr-hint">Scan to share this room code</p>
        </div>
      )}

      {/* Messages */}
      <div className={`messages ${blurred ? 'messages-blurred' : ''}`} onClick={() => setBlurred(false)}>
        {blurred && (
          <div className="blur-overlay">
            <span>🔒 Screen locked due to inactivity</span>
            <small>Click to reveal</small>
          </div>
        )}

        {messages.length === 0 && (
          <div className="empty-state">
            {status === 'waiting'
              ? <><span className="empty-icon">📡</span><p>Share the room code to start</p></>
              : <><span className="empty-icon">💬</span><p>Say something secure</p></>
            }
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`message message-${msg.from}`}>
            {msg.from === 'system'
              ? <span className="system-msg">{msg.text}</span>
              : <>
                  <div className="message-bubble">
                    <span className="message-text">{msg.text}</span>
                  </div>
                  <div className="message-meta">
                    <span className="message-time">
                      {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.from === 'me' && (
                      <span className="read-receipt" title={msg.read ? 'Read' : 'Delivered'}>
                        {msg.read ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </>
            }
          </div>
        ))}

        {peerTyping && (
          <div className="message message-peer">
            <div className="message-bubble typing-bubble">
              <span className="dot"></span><span className="dot"></span><span className="dot"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="input-area" onSubmit={handleSend}>
        {!cryptoReady && (
          <div className="crypto-pending">
            🔐 {status === 'waiting' ? 'Waiting for peer to establish keys…' : 'Establishing encrypted channel…'}
          </div>
        )}
        <div className="input-row">
          <input
            className="message-input"
            value={input}
            onChange={handleInputChange}
            placeholder={cryptoReady ? 'Type a message…' : 'Waiting for encryption…'}
            disabled={!cryptoReady}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="btn-send"
            disabled={!cryptoReady || !input.trim()}
          >
            ➤
          </button>
        </div>
        {sasVerified
          ? <div className="crypto-badge verified">🛡️ E2E Encrypted · Keys verified</div>
          : <div className="crypto-badge">{cryptoReady ? '🔒 E2E Encrypted · Verify fingerprint above' : '🔑 Setting up encryption…'}</div>
        }
      </form>
    </div>
  );
}
