/**
 * Password hashing utilities using Node.js built-in crypto (scrypt).
 * No external dependencies. Timing-safe comparison to prevent timing attacks.
 *
 * Hash format: "salt:hash" where both are hex-encoded.
 */

import crypto from 'node:crypto';

function scryptHashAsync(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString('hex'));
    });
  });
}

/**
 * Verifies a plaintext password against a stored "salt:hash" string.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const colonIdx = storedHash.indexOf(':');
  if (colonIdx < 0) return false;
  const salt = storedHash.substring(0, colonIdx);
  const expected = storedHash.substring(colonIdx + 1);
  try {
    const actual = await scryptHashAsync(password, salt);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Hashes a plaintext password. Returns "salt:hash".
 */
export async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = await scryptHashAsync(password, salt);
  return `${salt}:${hash}`;
}
