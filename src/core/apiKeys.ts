import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { config } from "./config";
import { sql } from "./db";
import type { Permission } from "./permissions";
import type { SessionUser, UserRole } from "./types";

const keyPrefix = "hsc";
const keyPattern = /^hsc_([A-Za-z0-9]{12})_([A-Za-z0-9_-]{40,128})$/;

export const apiKeyScopeOptions: Array<{ permission: Permission; label: string }> = [
  { permission: "posts.read", label: "Read posts" },
  { permission: "posts.write", label: "Write posts" },
  { permission: "posts.publish", label: "Publish posts" },
  { permission: "posts.delete", label: "Delete posts" },
  { permission: "pages.read", label: "Read pages" },
  { permission: "pages.write", label: "Write pages" },
  { permission: "pages.publish", label: "Publish pages" },
  { permission: "pages.delete", label: "Delete pages" },
  { permission: "forms.read", label: "Read forms" },
  { permission: "forms.write", label: "Write forms" },
  { permission: "forms.delete", label: "Delete forms" },
  { permission: "media.read", label: "Read media" },
  { permission: "media.write", label: "Upload media" },
  { permission: "media.delete", label: "Delete media" },
  { permission: "maps.read", label: "Read maps" },
  { permission: "maps.write", label: "Write maps" },
  { permission: "maps.delete", label: "Delete maps" },
  { permission: "ai.propose", label: "Create AI proposals" },
];

const permittedScopes = new Set(apiKeyScopeOptions.map((scope) => scope.permission));

export type ApiKeyRecord = {
  id: number;
  name: string;
  keyPrefix: string;
  permissions: Permission[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type ApiKeyAuthentication = {
  id: number;
  name: string;
  permissions: Permission[];
  user: SessionUser;
};

function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((permission): permission is Permission => typeof permission === "string" && permittedScopes.has(permission as Permission)))];
}

function toRecord(row: Record<string, unknown>): ApiKeyRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    permissions: normalizePermissions(row.permissions),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    createdAt: String(row.created_at),
  };
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function parseExpiry(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Expiration must be a future date and time.");
  return date.toISOString();
}

export async function listApiKeys(userId: number) {
  const rows = await sql`
    select id, name, key_prefix, permissions, expires_at, last_used_at, created_at
    from api_keys
    where user_id = ${userId} and revoked_at is null
    order by created_at desc
  `;
  return rows.map((row) => toRecord(row as Record<string, unknown>));
}

export async function createApiKey(userId: number, input: { name: string; permissions: string[]; expiresAt?: string }) {
  const name = input.name.trim();
  const permissions = normalizePermissions(input.permissions);
  if (!name || name.length > 100) throw new Error("API key name must be between 1 and 100 characters.");
  if (permissions.length === 0) throw new Error("Select at least one API permission.");
  const expiresAt = parseExpiry(input.expiresAt);
  const prefix = randomBytes(9).toString("base64url").slice(0, 12);
  const secret = randomBytes(32).toString("base64url");
  const token = `${keyPrefix}_${prefix}_${secret}`;
  const rows = await sql`
    insert into api_keys (user_id, name, key_prefix, secret_hash, permissions, expires_at)
    values (${userId}, ${name}, ${prefix}, ${hashSecret(secret)}, ${sql.array(permissions)}, ${expiresAt})
    returning id, name, key_prefix, permissions, expires_at, last_used_at, created_at
  `;
  return { record: toRecord(rows[0] as Record<string, unknown>), token };
}

export async function revokeApiKey(id: number, userId: number) {
  const result = await sql`
    update api_keys
    set revoked_at = now()
    where id = ${id} and user_id = ${userId} and revoked_at is null
  `;
  return result.count > 0;
}

export async function authenticateApiKey(token: string): Promise<ApiKeyAuthentication | null> {
  const match = keyPattern.exec(token);
  if (!match) return null;
  const [, prefix, secret] = match;
  const rows = await sql`
    select k.id, k.name, k.secret_hash, k.permissions, k.last_used_at,
      u.id as user_id, u.email, u.display_name,
      coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles
    from api_keys k
    join users u on u.id = k.user_id
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where k.key_prefix = ${prefix}
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
      and u.is_active = true
    group by k.id, u.id
    limit 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const expected = Buffer.from(String(row.secret_hash), "utf8");
  const actual = Buffer.from(hashSecret(secret), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!row.last_used_at || Date.now() - new Date(String(row.last_used_at)).getTime() > 5 * 60 * 1000) {
    await sql`update api_keys set last_used_at = now() where id = ${Number(row.id)}`;
  }
  const roles = Array.isArray(row.roles) ? row.roles.filter((role): role is UserRole => typeof role === "string") : [];
  return {
    id: Number(row.id),
    name: String(row.name),
    permissions: normalizePermissions(row.permissions),
    user: {
      id: Number(row.user_id),
      sessionId: 0,
      email: String(row.email),
      displayName: String(row.display_name),
      roles,
      csrfToken: "",
    },
  };
}

export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  c.set("apiKey", null);
  c.set("apiKeyError", false);
  if (!c.req.path.startsWith(config.cmsApiPrefix)) return next();
  const authorization = c.req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return next();
  const authenticated = await authenticateApiKey(authorization.slice("Bearer ".length).trim());
  if (!authenticated) {
    c.set("apiKeyError", true);
    return next();
  }
  c.set("apiKey", authenticated);
  c.set("sessionUser", authenticated.user);
  return next();
};
