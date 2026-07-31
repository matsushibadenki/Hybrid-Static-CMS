import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { requestIp, writeAuditLog } from "./audit";
import { sql } from "./db";
import { hashPassword, randomToken, verifyPassword, verifyTotpCode } from "./security";
import { config } from "./config";
import type { SessionUser, UserRole } from "./types";
import { verifyAndConsumeSecondFactor } from "./accountSecurity";

const SESSION_COOKIE = "hybrid_static_cms_session";

declare module "hono" {
  interface ContextVariableMap {
    sessionUser: SessionUser | null;
  }
}

function normalizeRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is UserRole => typeof entry === "string") as UserRole[];
}

export const sessionMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);

  if (!token) {
    c.set("sessionUser", null);
    await next();
    return;
  }

  let rows;
  try {
    rows = await sql`
    select
      s.token,
      s.id as session_id,
      s.csrf_token,
      s.expires_at,
      u.id,
      u.email,
      u.display_name,
      u.is_active,
      coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles
    from sessions s
    join users u on u.id = s.user_id
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where s.token = ${token}
      and s.expires_at > now()
      and u.is_active = true
    group by s.id, s.token, s.csrf_token, s.expires_at, u.id
    limit 1
    `;
  } catch {
    c.set("sessionUser", null);
    await next();
    return;
  }

  if (!rows[0]) {
    c.set("sessionUser", null);
    await next();
    return;
  }

  c.set("sessionUser", {
    id: Number(rows[0].id),
    sessionId: Number(rows[0].session_id),
    email: String(rows[0].email),
    displayName: String(rows[0].display_name),
    roles: normalizeRoles(rows[0].roles),
    csrfToken: String(rows[0].csrf_token),
  });

  await sql`
    update sessions
    set last_seen_at = now()
    where id = ${rows[0].session_id}
      and last_seen_at < now() - interval '5 minutes'
  `;

  await next();
};

function loginAttemptKeys(c: Context, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const ip = requestIp(c) ?? "unknown";
  return [`ip:${ip}`, `email:${normalizedEmail}`];
}

async function isLoginRateLimited(keys: string[]) {
  const rows = await sql`
    select attempt_key, attempts
    from login_attempts
    where attempt_key = any(${sql.array(keys)})
      and window_started > now() - make_interval(secs => ${config.loginWindowSeconds})
  `;
  return rows.some((row) => Number(row.attempts) >= config.loginMaxAttempts);
}

async function recordFailedLogin(keys: string[]) {
  for (const key of keys) {
    await sql`
      insert into login_attempts (attempt_key, attempts, window_started)
      values (${key}, 1, now())
      on conflict (attempt_key) do update set
        attempts = case
          when login_attempts.window_started <= now() - make_interval(secs => ${config.loginWindowSeconds}) then 1
          else login_attempts.attempts + 1
        end,
        window_started = case
          when login_attempts.window_started <= now() - make_interval(secs => ${config.loginWindowSeconds}) then now()
          else login_attempts.window_started
        end
    `;
  }
}

async function clearLoginAttempts(keys: string[]) {
  await sql`delete from login_attempts where attempt_key = any(${sql.array(keys)})`;
}

export async function attemptLogin(c: Context, email: string, password: string, twoFactorCode = "") {
  const normalizedEmail = email.trim().toLowerCase();
  const attemptKeys = loginAttemptKeys(c, normalizedEmail);
  if (await isLoginRateLimited(attemptKeys)) {
    return null;
  }

  const rows = await sql`
    select id, email, display_name, password_hash, is_active,
      totp_secret_encrypted, recovery_code_hashes
    from users
    where email = ${normalizedEmail}
    limit 1
  `;

  const row = rows[0];
  if (!row || row.is_active !== true) {
    await recordFailedLogin(attemptKeys);
    return null;
  }

  const isValid = await verifyPassword(password, String(row.password_hash));
  if (!isValid) {
    await recordFailedLogin(attemptKeys);
    return null;
  }

  let recoveryCodeUsed = false;
  if (row.totp_secret_encrypted) {
    const recoveryHashes = Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes.map(String) : [];
    const verification = await verifyAndConsumeSecondFactor(
      Number(row.id),
      String(row.totp_secret_encrypted),
      recoveryHashes,
      twoFactorCode,
    );
    if (!verification.ok) {
      await recordFailedLogin(attemptKeys);
      return null;
    }
    recoveryCodeUsed = verification.recoveryCodeUsed;
  } else if (config.twoFactorEnabled && config.twoFactorSecret && !(await verifyTotpCode(config.twoFactorSecret, twoFactorCode))) {
    await recordFailedLogin(attemptKeys);
    return null;
  }

  await clearLoginAttempts(attemptKeys);

  await sql`update users set last_login_at = now() where id = ${row.id}`;

  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await sql`
    insert into sessions (user_id, token, csrf_token, expires_at, created_ip, user_agent, last_seen_at)
    values (
      ${row.id},
      ${token},
      ${csrfToken},
      ${expiresAt.toISOString()},
      ${requestIp(c)},
      ${c.req.header("user-agent")?.slice(0, 500) ?? null},
      now()
    )
  `;

  await writeAuditLog({
    actorUserId: Number(row.id),
    action: "auth.login",
    targetType: "session",
    targetId: token,
    summary: `User ${row.display_name} signed in.`,
    ipAddress: requestIp(c),
  });
  if (recoveryCodeUsed) {
    await writeAuditLog({
      actorUserId: Number(row.id),
      action: "auth.recovery_code_used",
      targetType: "user",
      targetId: row.id,
      summary: `User ${row.display_name} signed in with a recovery code.`,
      ipAddress: requestIp(c),
    });
  }

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: config.cookieSecure,
    expires: expiresAt,
  });

  return row;
}

export async function logout(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  const user = c.get("sessionUser");
  if (token) {
    await sql`delete from sessions where token = ${token}`;
  }

  if (user) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.logout",
      targetType: "session",
      targetId: token ?? null,
      summary: `User ${user.displayName} signed out.`,
      ipAddress: requestIp(c),
    });
  }

  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
  });
}

export function requireRole(...allowed: UserRole[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get("sessionUser");
    if (!user) {
      return c.redirect("/login");
    }

    if (!user.roles.some((role) => allowed.includes(role))) {
      return c.text("Forbidden", 403);
    }

    await next();
  };
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  roles: UserRole[];
}) {
  const passwordHash = await hashPassword(input.password);
  const rows = await sql`
    insert into users (email, display_name, password_hash, password_changed_at)
    values (${input.email.trim().toLowerCase()}, ${input.displayName.trim()}, ${passwordHash}, now())
    returning id
  `;

  const userId = Number(rows[0].id);
  if (input.roles.length > 0) {
    await sql`
      insert into user_roles (user_id, role_id)
      select ${userId}, id from roles where name = any(${sql.array(input.roles)})
    `;
  }

  return userId;
}
