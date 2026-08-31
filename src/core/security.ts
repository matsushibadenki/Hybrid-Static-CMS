import { timingSafeEqual } from "node:crypto";
import { config } from "./config";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string) {
  return Uint8Array.from(Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
}

function isCanonicalBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  return toBase64Url(fromBase64Url(value)) === value;
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

  const actual = Buffer.from(bits);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(size = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(size = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += base32Alphabet[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) output += base32Alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

async function accountEncryptionKey() {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(config.accountEncryptionKey));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptAccountSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await accountEncryptionKey(), encoder.encode(secret));
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptAccountSecret(value: string) {
  const [version, ivValue, encryptedValue] = value.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !encryptedValue ||
    !isCanonicalBase64Url(ivValue) ||
    !isCanonicalBase64Url(encryptedValue)
  ) {
    return null;
  }
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivValue) },
      await accountEncryptionKey(),
      fromBase64Url(encryptedValue),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const raw = [...bytes].map((byte) => recoveryAlphabet[byte % recoveryAlphabet.length]).join("");
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export async function hashRecoveryCode(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(config.accountEncryptionKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(normalizeRecoveryCode(value)));
  return toBase64Url(new Uint8Array(digest));
}

export function totpEnrollmentUri(secret: string, email: string) {
  const issuer = config.appName;
  const label = `${issuer}:${email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

async function totpCode(secret: string, counter: number) {
  const keyBytes = decodeBase32(secret);
  if (!keyBytes) return null;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const message = new ArrayBuffer(8);
  new DataView(message).setBigUint64(0, BigInt(counter));
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function generateTotpCode(secret: string, at = Date.now()) {
  return totpCode(secret, Math.floor(at / 30_000));
}

export async function verifyTotpCode(secret: string, submittedCode: string) {
  if (!/^\d{6}$/.test(submittedCode.trim())) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const offset of [-1, 0, 1]) {
    if ((await totpCode(secret, counter + offset)) === submittedCode.trim()) return true;
  }
  return false;
}

type RecaptchaVerificationResult = {
  ok: boolean;
  score: number | null;
  reasons: string[];
};

export function isRecaptchaEnabled() {
  return Boolean(config.recaptchaSiteKey && config.recaptchaSecretKey);
}

export async function verifyRecaptchaToken(token: string, action: string, remoteIp?: string | null): Promise<RecaptchaVerificationResult> {
  if (!isRecaptchaEnabled()) {
    return { ok: true, score: null, reasons: [] };
  }

  if (!token.trim()) {
    return { ok: false, score: null, reasons: ["missing-input-response"] };
  }

  const body = new URLSearchParams({
    secret: config.recaptchaSecretKey ?? "",
    response: token,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return { ok: false, score: null, reasons: [`http-${response.status}`] };
    }

    const payload = (await response.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      hostname?: string;
      ["error-codes"]?: string[];
    };

    const score = typeof payload.score === "number" ? payload.score : null;
    const reasons = payload["error-codes"] ?? [];
    const actionMatches = payload.action === action;
    const scorePasses = score === null ? false : score >= config.recaptchaMinScore;

    return {
      ok: Boolean(payload.success) && actionMatches && scorePasses,
      score,
      reasons: actionMatches ? reasons : [...reasons, "action-mismatch"],
    };
  } catch {
    return { ok: false, score: null, reasons: ["verification-request-failed"] };
  }
}
