import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238), the six-digit codes any
 * authenticator app produces.
 *
 * Implemented here rather than pulled in: the whole algorithm is an HMAC and a
 * truncation, and `node:crypto` already provides the hard part. A dependency
 * for forty lines would be one more thing to keep current.
 */

const DIGITS = 6;
const PERIOD = 30; // seconds
/** Accept the neighbouring steps, for clocks that disagree by a few seconds. */
const DRIFT_STEPS = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(): string {
  // 20 bytes is the length RFC 4226 recommends for HMAC-SHA1.
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function decodeSecret(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeSecret(secret)).update(counter).digest();

  // Dynamic truncation: the last nibble picks where to read the code from.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The code valid right now. Exported so the round trip can be tested. */
export function currentCode(secret: string): string {
  return codeAt(secret, Math.floor(Date.now() / 1000 / PERIOD));
}

export function verifyCode(secret: string, code: string): boolean {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== DIGITS) return false;
  const now = Math.floor(Date.now() / 1000 / PERIOD);

  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
    const expected = Buffer.from(codeAt(secret, now + drift));
    const actual = Buffer.from(cleaned);
    // Constant time, same as for passwords: the comparison must not leak how
    // many leading digits were right.
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      return true;
    }
  }
  return false;
}

/** The URI an authenticator app reads, by QR code or pasted by hand. */
export function otpauthUri(secret: string, username: string): string {
  const label = encodeURIComponent(`Siphon:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Siphon&digits=${DIGITS}&period=${PERIOD}`;
}
