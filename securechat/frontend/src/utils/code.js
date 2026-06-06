/**
 * Crockford Base32 room codes: XXXX-XXXX-XXXX-XXXX
 * Human-friendly: no I/L/O/U to avoid confusion
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let chars = '';
  // Simple encoding: 5 bits per char from random bytes
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      chars += ALPHABET[(value >> bits) & 31];
    }
  }
  while (chars.length < 16) chars += ALPHABET[0];
  chars = chars.slice(0, 16).toUpperCase();

  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

export function normalizeCode(code) {
  return code.replace(/[-\s]/g, '').toUpperCase();
}

export function isValidCode(code) {
  const norm = normalizeCode(code);
  return norm.length === 16 && /^[0-9A-HJKMNPQRSTVWXYZ]{16}$/.test(norm);
}
