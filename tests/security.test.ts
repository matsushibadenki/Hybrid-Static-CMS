import { describe, expect, test } from "bun:test";
import {
  decryptAccountSecret,
  encryptAccountSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashPassword,
  hashRecoveryCode,
  normalizeRecoveryCode,
  totpEnrollmentUri,
  verifyPassword,
  verifyTotpCode,
} from "../src/core/security";

describe("security primitives", () => {
  test("rejects malformed password hashes without throwing", async () => {
    expect(await verifyPassword("password", "c2FsdA.ZGlnZXN0")).toBe(false);
  });

  test("verifies valid password hashes", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  test("encrypts account secrets and rejects modified ciphertext", async () => {
    const secret = generateTotpSecret();
    const encrypted = await encryptAccountSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(await decryptAccountSecret(encrypted)).toBe(secret);
    expect(await decryptAccountSecret(`${encrypted.slice(0, -1)}x`)).toBeNull();
  });

  test("generates valid TOTP enrollment data and codes", async () => {
    const secret = generateTotpSecret();
    const code = await generateTotpCode(secret);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyTotpCode(secret, code ?? "")).toBe(true);
    expect(totpEnrollmentUri(secret, "owner@example.test")).toContain("otpauth://totp/");
  });

  test("generates unique normalized recovery codes with stable hashes", async () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/.test(code))).toBe(true);
    expect(normalizeRecoveryCode(` ${codes[0].toLowerCase()} `)).toBe(codes[0].replaceAll("-", ""));
    expect(await hashRecoveryCode(codes[0])).toBe(await hashRecoveryCode(codes[0].toLowerCase()));
  });
});
