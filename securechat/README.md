```
Alice                    Server                    Bob
  |                        |                        |
  |── ECDH pubkey ────────►|──── ECDH pubkey ──────►|
  |◄─────────────── ECDH pubkey ───────────────────|
  |                        |                        |
  | Both derive shared AES-256-GCM key (server never sees it)
  |                        |                        |
  |── AES-GCM ciphertext ─►|── AES-GCM ciphertext ►|
```

The server only relays encrypted bytes. Keys live in the browser only.

## Cryptography

| Layer | Primitive |
|---|---|
| Key exchange | ECDH P-256 |
| Key derivation | HKDF-SHA-256 |
| Encryption | AES-256-GCM (256-bit key, 96-bit nonce) |
| Room ID | SHA-256("room:" + code) |
| Fingerprint | SHA-256(sorted public keys) → 6 emoji |

```bash
git clone https://github.com/ksasha-hub/securechat.git
cd securechat
cp .env.example .env
docker compose up -d --build
```

## Development

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

```bash
curl http://localhost/healthz/live   # { status: "ok" }
curl http://localhost/healthz/ready  # { status: "ok", activeRooms: N, ... }
```

