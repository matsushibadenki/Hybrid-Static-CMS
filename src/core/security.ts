import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120_000,
    },
    material,
    256,
  );

  return `${toBase64Url(salt)}.${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [saltValue, digestValue] = stored.split(".");
  if (!saltValue || !digestValue) {
    return false;
  }

  const salt = Uint8Array.from(Buffer.from(saltValue.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
  const expected = Buffer.from(digestValue.replaceAll("-", "+").replaceAll("_", "/"), "base64");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120_000,
    },
    material,
    256,
  );

  return timingSafeEqual(Buffer.from(bits), expected);
}

export function randomToken(size = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}
