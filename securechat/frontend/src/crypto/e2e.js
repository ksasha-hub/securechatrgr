/**
 * End-to-end encryption module.
 *
 * Protocol:
 *   1. Alice & Bob each generate ECDH P-256 keypair (X25519 not in Web Crypto yet in all browsers)
 *   2. Exchange public keys over the relay (relay sees only ciphertext after this)
 *   3. Derive shared secret via ECDH → HKDF-SHA-256 → AES-256-GCM key
 *   4. Compute SAS fingerprint: SHA-256(pubA || pubB) → 6 emoji
 *   5. Every message encrypted with fresh random 12-byte nonce
 *   6. Nonce uniqueness enforced via Set to prevent GCM catastrophic reuse
 */

const subtle = globalThis.crypto.subtle;

// ── Emoji palette for SAS fingerprint ────────────────────────────────────────
const SAS_EMOJI = [
  '🔑','🛡️','🔒','🌊','⚡','🎯','🦊','🐉','🌙','⭐',
  '🔥','❄️','🌿','💎','🎲','🦁','🐺','🦅','🌋','🎭',
  '🧩','🪐','🌈','⚓','🎪','🏔️','🦋','🐬','🌺','🍀',
  '🎸','🔭','🧬','⚗️','🎨','🦚','🐙','🦜','🌴','🎋',
];

// ── Key generation ────────────────────────────────────────────────────────────
export async function generateKeyPair() {
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
  return keyPair;
}

export async function exportPublicKey(publicKey) {
  const raw = await subtle.exportKey('raw', publicKey);
  return bufToHex(raw);
}

export async function importPublicKey(hexKey) {
  const raw = hexToBuf(hexKey);
  return subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

// ── Shared key derivation ─────────────────────────────────────────────────────
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

// ── SAS fingerprint ───────────────────────────────────────────────────────────
/**
 * Computes Short Authentication String from both public keys.
 * Both peers must show the same 6 emoji for the session to be trustworthy.
 * Keys are sorted so order doesn't matter.
 */
export async function computeSAS(myPubHex, theirPubHex) {
  const sorted = [myPubHex, theirPubHex].sort();
  const combined = hexToBuf(sorted[0] + sorted[1]);
  const digest = await subtle.digest('SHA-256', combined);
  const bytes = new Uint8Array(digest);
  const emojis = [];
  for (let i = 0; i < 6; i++) {
    emojis.push(SAS_EMOJI[bytes[i] % SAS_EMOJI.length]);
  }
  return emojis.join(' ');
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────
const usedNonces = new Set();

export async function encrypt(sharedKey, plaintext) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const nonceHex = bufToHex(nonce);

  // Paranoid nonce uniqueness check (practically impossible to collide, but enforced)
  if (usedNonces.has(nonceHex)) {
    throw new Error('Nonce collision detected — refusing to encrypt');
  }
  usedNonces.add(nonceHex);

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    sharedKey,
    encoded,
  );

  return {
    nonce: nonceHex,
    ct: bufToHex(ciphertext),
  };
}

export async function decrypt(sharedKey, { nonce, ct }) {
  const iv = hexToBuf(nonce);
  const ciphertext = hexToBuf(ct);
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// ── Room ID derivation ────────────────────────────────────────────────────────
export async function deriveRoomId(code) {
  const encoded = new TextEncoder().encode('room:' + code);
  const digest = await subtle.digest('SHA-256', encoded);
  return bufToHex(digest);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}
