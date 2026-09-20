import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentCode,
  generateSecret,
  otpauthUri,
  verifyCode,
} from "./totp.js";

test("generateSecret produces a usable base32 secret", () => {
  const secret = generateSecret();
  assert.equal(secret.length, 32);
  assert.match(secret, /^[A-Z2-7]+$/);
});

test("the code produced now is the code accepted now", () => {
  const secret = generateSecret();
  const code = currentCode(secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyCode(secret, code), true);
});

test("a code from another secret is refused", () => {
  // Guards against a verifier that says yes to anything well-formed.
  assert.equal(verifyCode(generateSecret(), currentCode(generateSecret())), false);
});

test("verifyCode rejects malformed input", () => {
  const secret = generateSecret();
  assert.equal(verifyCode(secret, ""), false);
  assert.equal(verifyCode(secret, "12345"), false);
  assert.equal(verifyCode(secret, "abcdef"), false);
});

test("otpauthUri carries the secret and the issuer", () => {
  const uri = otpauthUri("JBSWY3DPEHPK3PXP", "alice");
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=Siphon/);
  assert.match(uri, /alice/);
});
