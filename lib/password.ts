import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing, deliberately free of any Next.js or `server-only` import so
 * that scripts outside the app (the seed, the end-to-end checks) can use the
 * exact same implementation the app uses, rather than a copy that could drift.
 *
 * scrypt from node:crypto rather than bcrypt: memory-hard, ships with Node (no
 * native build step on Render or Vercel), and the parameters are explicit.
 * Stored as scrypt$N$r$p$salt$hash, so the cost can be raised later without
 * invalidating existing hashes.
 */

// promisify() resolves to scrypt's 3-argument overload, which drops the cost
// parameters. Declare the signature we actually use.
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const derived = await scrypt(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  // Constant-time: a length mismatch alone must not short-circuit early.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
