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
