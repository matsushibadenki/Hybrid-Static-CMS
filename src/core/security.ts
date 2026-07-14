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
