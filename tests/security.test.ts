import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../src/core/security";

describe("security primitives", () => {
  test("rejects malformed password hashes without throwing", async () => {
    expect(await verifyPassword("password", "c2FsdA.ZGlnZXN0")).toBe(false);
  });

  test("verifies valid password hashes", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});
