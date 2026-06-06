# SecureChat

> Production-ready end-to-end encrypted ephemeral chat. One-time rooms for two people. No logs, no history, no server-side keys.

[![CI](https://github.com/YOUR_USER/securechat/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USER/securechat/actions)

## How it works

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

See [SECURITY.md](./SECURITY.md) for the full threat model.

## Quick start

```bash
git clone https://github.com/YOUR_USER/securechat.git
cd securechat
cp .env.example .env
docker compose up -d --build
```

Open [http://localhost](http://localhost).

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend dev server: http://localhost:5173 (proxies API/WS to backend)

## Architecture

```
nginx (port 80)
  ├── /api/*   → backend:3001  (REST — room create/check)
  ├── /ws      → backend:3001  (WebSocket — relay)
  └── /        → frontend:80   (React SPA)
```

## Security features

- ECDH P-256 key exchange (keys never leave the browser)
- AES-256-GCM authenticated encryption
- SAS fingerprint for MITM detection (6-emoji SHA-256)
- Nonce uniqueness enforced client-side
- Helmet.js security headers (CSP, HSTS, X-Frame-Options…)
- Rate limiting on all endpoints
- Room code → SHA-256 hashing (server never sees the code)
- Timing-safe responses to prevent room enumeration
- Rooms blocked for TTL after destruction (no code reuse)
- Input validation + WS payload limits
- Inactivity screen blur (5 min)
- Room countdown timer
- Graceful shutdown
- Structured logs with data minimization
- Docker: read-only filesystem, no-new-privileges

## Environment variables

See [.env.example](.env.example) for all options.

## Health endpoints

```bash
curl http://localhost/healthz/live   # { status: "ok" }
curl http://localhost/healthz/ready  # { status: "ok", activeRooms: N, ... }
```

## VPS deployment with TLS

1. Point your domain to the server
2. Add Certbot + Let's Encrypt: `certbot --nginx -d your-domain.com`
3. Uncomment the HSTS line in `nginx/nginx.conf`
4. `docker compose up -d --build`
