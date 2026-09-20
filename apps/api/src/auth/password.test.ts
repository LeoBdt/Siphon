import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.js";

/**
 * The round trip, which is the whole contract.
 *
 * It is here because its absence let a build ship in which `hashPassword`
 * threw on every call: scrypt's default memory ceiling is 32 MiB and the cost
 * parameters asked for exactly that, so creating the first account failed with
 * ERR_CRYPTO_INVALID_SCRYPT_PARAMS on any machine. Nothing else exercised this
 * function, so nothing caught it.
 */
test("a password verifies against its own hash", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
});

test("a wrong password does not verify", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery stapl", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("two hashes of the same password differ", async () => {
  // Salted, so a stolen database cannot be attacked once for every account.
  const a = await hashPassword("hunter22");
  const b = await hashPassword("hunter22");
  assert.notEqual(a, b);
});

test("the hash carries its own cost parameters", async () => {
  // They travel with the hash so the cost can be raised later without
  // invalidating passwords already stored — and so verification derives its
  // memory ceiling from them rather than from today's constants.
  const [scheme, n, r, p] = (await hashPassword("hunter22")).split("$");
  assert.equal(scheme, "scrypt");
  assert.ok(Number(n) >= 16384);
  assert.ok(Number(r) >= 8);
  assert.ok(Number(p) >= 1);
});

test("a malformed stored hash is rejected rather than thrown on", async () => {
  // A truncated or hand-edited row must fail closed, not crash the request.
  for (const bad of ["", "scrypt$", "scrypt$0$0$0$c2FsdA==$a2V5", "bcrypt$1$2$3$x$y"]) {
    assert.equal(await verifyPassword("hunter22", bad), false);
  }
});
