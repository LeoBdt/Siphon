import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt rather than argon2 to keep the promise the rest of the project makes:
 * no native dependency, so the Docker image stays a plain Node image and the
 * build never has to compile anything.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Cost parameters. N is the expensive knob; 2^15 keeps a single hash around
// 100 ms on modest hardware, which is slow enough to hurt an attacker and fast
// enough that signing in feels instant.
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;

/**
 * scrypt needs 128 × N × r bytes, and Node refuses anything above `maxmem`,
 * which defaults to 32 MiB — exactly what these parameters ask for, so the
 * default rejects them. The ceiling is a guard against absurd parameters, not
 * a tuning knob: it has to be derived from the parameters actually in use, and
 * from the *stored* ones when verifying, so a hash written under any cost
 * still opens.
 */
function maxmemFor(N: number, r: number): number {
  return 128 * N * r * 2;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: maxmemFor(PARAMS.N, PARAMS.r),
  });
  // Parameters travel with the hash so they can be raised later without
  // invalidating passwords already stored.
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;

  const expected = Buffer.from(key, "base64");
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!params.N || !params.r || !params.p) return false;
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, "base64"),
    expected.length,
    { ...params, maxmem: maxmemFor(params.N, params.r) },
  );
  // Constant time: a plain === leaks how much of the hash matched through how
  // long the comparison took.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
