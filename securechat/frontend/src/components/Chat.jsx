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
const EMOJI_LIST = [
  '😀','😂','😍','🤔','😎','😢','😡','🥳','😴','🤯',
  '👍','👎','👋','🙏','🔥','❤️','💯','⚡','🎉','🎯',
  '🚀','💡','🔒','✅','❌','⚠️','💬','🌍','🎸','🦊',
];

export function Chat({ session, onLeave }) {
  const { roomId, code } = session;
  const keyPairRef = useRef(null);
  const myPubHexRef = useRef(null);
  const sharedKeyRef = useRef(null);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [sas, setSAS] = useState(null);
  const [sasVerified, setSasVerified] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [status, setStatus] = useState('waiting');
  const [blurred, setBlurred] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const inactivityTimerRef = useRef(null);
  const emojiRef = useRef(null);

  useEffect(() => {
    (async () => {
      const kp = await generateKeyPair();
      const pub = await exportPublicKey(kp.publicKey);
      keyPairRef.current = kp;
      myPubHexRef.current = pub;
    })();
  }, []);

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

  useEffect(() => {
    function handleClick(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerTyping]);

  const handleMessage = useCallback(async (msg) => {
    switch (msg.type) {
      case 'joined': send({ type: 'key_pub', pub: myPubHexRef.current }); break;
      case 'peer_arrived':
        setStatus('connected'); playConnect();
        send({ type: 'key_pub', pub: myPubHexRef.current }); break;
      case 'peer_left':
        setStatus('disconnected');
        sharedKeyRef.current = null; setCryptoReady(false); setSAS(null);
        addSystemMsg('Peer disconnected.'); break;
      case 'key_pub': {
        const theirPub = await importPublicKey(msg.pub);
        sharedKeyRef.current = await deriveSharedKey(keyPairRef.current.privateKey, theirPub);
        setSAS(await computeSAS(myPubHexRef.current, msg.pub));
        setCryptoReady(true);
        send({ type: 'key_ack' }); break;
      }
      case 'key_ack': setStatus('connected'); playConnect(); break;
      case 'chat': {
        if (!sharedKeyRef.current) break;
        try {
          const plain = await decrypt(sharedKeyRef.current, { nonce: msg.nonce, ct: msg.ct });
          addMessage({ from: 'peer', text: JSON.parse(plain).text, ts: Date.now() });
          playNotification();
          send({ type: 'read', id: msg.id });
        } catch { addSystemMsg('⚠️ Failed to decrypt message.'); }
        break;
      }
      case 'typing':
        setPeerTyping(true);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), TYPING_TIMEOUT_MS); break;
      case 'read':
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m)); break;
    }
  }, []);

  const { connect, send, close } = useWebSocket({
    onMessage: handleMessage,
    onClose: () => setStatus('disconnected'),
  });

  useEffect(() => { connect(roomId); return () => close(); }, [roomId]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !cryptoReady || !sharedKeyRef.current) return;
    const id = crypto.randomUUID();
    const { nonce, ct } = await encrypt(sharedKeyRef.current, JSON.stringify({ text }));
    send({ type: 'chat', id, nonce, ct });
    addMessage({ id, from: 'me', text, ts: Date.now(), read: false });
    setInput(''); setShowEmoji(false);
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    const now = Date.now();
    if (cryptoReady && now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
      send({ type: 'typing' });
      lastTypingSentRef.current = now;
    }
  }

  function insertEmoji(emoji) {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + emoji + input.slice(end);
    setInput(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function addMessage(msg) { setMessages(prev => [...prev, { id: crypto.randomUUID(), ...msg }]); }
  function addSystemMsg(text) { setMessages(prev => [...prev, { id: crypto.randomUUID(), from: 'system', text, ts: Date.now() }]); }

  const statusLabel = { waiting: '⏳ Waiting for peer…', connected: '🟢 Connected', disconnected: '🔴 Disconnected' }[status];

  return (
    <div className="chat-container" onClick={resetInactivity}>
      <header className="chat-header">
        <div className="chat-header-left">
          <button className="btn-ghost" onClick={onLeave}>← Leave</button>
          <div className="room-code-wrap">
            <div className="room-code-display" onClick={() => setShowQR(!showQR)} title="Show QR">🔑 {code}</div>
            <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={handleCopyCode} title="Copy code">{copied ? '✓' : '⧉'}</button>
          </div>
        </div>
        <div className="chat-header-center">
          <span className={`status-dot ${status}`}></span>
          <span className="status-label">{statusLabel}</span>
        </div>
        <div className="chat-header-right"><RoomTimer ttlMs={3600000} /></div>
      </header>

      {sas && <SASPanel sas={sas} verified={sasVerified} onVerify={() => setSasVerified(true)} />}

      {showQR && (
        <div className="qr-panel">
          <QRCode value={`${location.origin}?code=${encodeURIComponent(code)}`} />
          <p className="qr-hint">Scan to share this room code</p>
        </div>
      )}

      <div className={`messages ${blurred ? 'messages-blurred' : ''}`} onClick={() => setBlurred(false)}>
        {blurred && <div className="blur-overlay"><span>🔒 Screen locked</span><small>Click to reveal</small></div>}
        {messages.length === 0 && (
          <div className="empty-state">
            {status === 'waiting'
              ? <><span className="empty-icon">📡</span><p>Share the room code to start</p></>
              : <><span className="empty-icon">💬</span><p>Say something secure</p></>}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`message message-${msg.from}`}>
            {msg.from === 'system'
              ? <span className="system-msg">{msg.text}</span>
              : <>
                  <div className="message-bubble"><span className="message-text">{msg.text}</span></div>
                  <div className="message-meta">
                    <span className="message-time">{new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.from === 'me' && <span className="read-receipt">{msg.read ? '✓✓' : '✓'}</span>}
                  </div>
                </>}
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

      <form className="input-area" onSubmit={handleSend}>
        {!cryptoReady && <div className="crypto-pending">🔐 {status === 'waiting' ? 'Waiting for peer…' : 'Establishing encrypted channel…'}</div>}
        <div className="input-row" ref={emojiRef}>
          {showEmoji && (
            <div className="emoji-picker">
              {EMOJI_LIST.map(e => <button key={e} type="button" className="emoji-btn" onClick={() => insertEmoji(e)}>{e}</button>)}
            </div>
          )}
          <button type="button" className={`btn-emoji ${showEmoji ? 'active' : ''}`} onClick={() => setShowEmoji(v => !v)} disabled={!cryptoReady}>😊</button>
          <input ref={inputRef} className="message-input" value={input} onChange={handleInputChange}
            placeholder={cryptoReady ? 'Type a message…' : 'Waiting for encryption…'}
            disabled={!cryptoReady} autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn-send" disabled={!cryptoReady || !input.trim()}>➤</button>
        </div>
      </form>
    </div>
  );
}
