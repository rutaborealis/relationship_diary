import crypto from 'crypto';

/**
 * Cryptographically secure helpers for one-time codes (password reset).
 * Unlike register/verify-email (which still use Math.random — out of scope here),
 * these use Node's crypto for unguessable codes and timing-safe comparison.
 */

/** Numeric one-time code, zero-padded to `len` digits, from a CSPRNG. */
export function generateNumericCode(len = 6): string {
  const max = 10 ** len;
  return crypto.randomInt(0, max).toString().padStart(len, '0');
}

/** SHA-256 of a string → lowercase hex. Used to store a code's hash, not the code. */
export function sha256(str: string): string {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex strings. Returns false (without leaking
 * via timing) when lengths differ — Buffers must be equal length for timingSafeEqual.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
