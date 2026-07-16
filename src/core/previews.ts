import { config } from "./config";

type PreviewType = "post" | "page";
type PreviewPayload = { type: PreviewType; slug: string; exp: number };
const encoder = new TextEncoder();

function encode(value: Uint8Array | string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(config.sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function createPreviewToken(type: PreviewType, slug: string, ttlSeconds = 3600) {
  const payload = encode(JSON.stringify({ type, slug, exp: Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds) } satisfies PreviewPayload));
  return `${payload}.${await sign(payload)}`;
}

export async function verifyPreviewToken(token: string, type: PreviewType, slug: string) {
  const [payloadValue, signature] = token.split(".");
  if (!payloadValue || !signature || signature !== await sign(payloadValue)) return false;
  try {
    const payload = JSON.parse(decode(payloadValue)) as PreviewPayload;
    return payload.type === type && payload.slug === slug && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
