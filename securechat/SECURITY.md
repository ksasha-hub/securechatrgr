# Security Model

## What SecureChat protects against

### ✅ Passive server compromise
The server stores **nothing**: no messages, no keys, no room codes.
It only relays opaque ciphertext between two WebSocket connections.
If the server database is dumped, there is nothing to read.

### ✅ Active server compromise (honest relay)
Keys are generated in the browser and exchanged over the relay.
The server forwards public keys but cannot derive the shared AES-256-GCM key.
All message content is encrypted before it reaches the server.

### ✅ Message replay
Every message uses a fresh cryptographically-random 12-byte nonce (IV).
The sender's JavaScript enforces nonce uniqueness via an in-memory Set.
A replayed ciphertext with a different nonce will fail AES-GCM authentication.

### ✅ Message tampering
AES-256-GCM provides authenticated encryption. Any modification to the
ciphertext or nonce causes decryption to throw, and the receiver shows a
tamper warning instead of displaying the message.

### ✅ Room enumeration
The browser sends `SHA-256("room:" + code)` — the server never sees the
human-readable code. All join/create endpoints add a random 50–150 ms delay
to prevent timing-based probing. Rate limiting applies per IP.

### ✅ Room code reuse
After a room is destroyed, its hashed ID is blocked for the full TTL window.
The same code cannot be used to create a new room immediately.

### ✅ Inactivity exposure
The chat screen auto-blurs after 5 minutes of inactivity, hiding messages
from physical observers (shoulder surfing).

---

## What SecureChat does NOT protect against

### ❌ MITM without fingerprint verification (key substitution)
If an attacker controls the network, they can substitute their own public
key during the ECDH exchange. The session will appear encrypted but the
attacker holds the real key.

**Mitigation**: The SAS fingerprint (6-emoji SHA-256 of both public keys)
must be compared out-of-band (voice/video call). Both peers must confirm
the emoji sequence matches before sending sensitive information.

### ❌ Compromised browser / endpoint
If the user's browser is compromised (malicious extension, XSS, malware),
an attacker can read plaintext before encryption or after decryption.
E2E encryption does not protect against endpoint compromise.

### ❌ Screenshots and physical observation
The application cannot prevent screenshots or physical observation of the screen.
The inactivity blur is a convenience feature, not a security control.

### ❌ Traffic analysis
An observer can see that two IPs connected to the server and how many
messages were exchanged (sizes are padded by AES-GCM overhead but timing
and frequency are visible).

### ❌ No TLS (default config)
The default Docker Compose deployment runs on HTTP.
Without TLS, the ECDH key exchange is visible on the wire, enabling MITM.
**For production**: terminate TLS in Nginx and add HSTS. See `deploy/` for instructions.

---

## Cryptographic primitives

| Purpose | Primitive | Why |
|---|---|---|
| Key exchange | ECDH P-256 | Web Crypto API standard; widely audited |
| Key derivation | HKDF-SHA-256 | RFC 5869; derives AES key from ECDH output |
| Encryption | AES-256-GCM | Authenticated encryption; Web Crypto native |
| Room ID | SHA-256 | Server never sees the human code |
| Fingerprint | SHA-256(pubA \|\| pubB) | Sorted, so order-independent |

All cryptography uses the browser's native `window.crypto.subtle` API.
No third-party crypto libraries are used.

---

## Data minimization

The server logs the following — never message content:
- Room created / destroyed (hashed ID prefix only)
- Peer joined / left (hashed room ID, redacted IP prefix)
- WebSocket errors

Logs contain no message content, no full room IDs, and no full IPs.
