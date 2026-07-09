import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { requestIp, writeAuditLog } from "./audit";
import { sql } from "./db";
import { hashPassword, randomToken, verifyPassword } from "./security";
import type { SessionUser, UserRole } from "./types";

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

  const rows = await sql`
    select
      s.token,
      s.expires_at,
      u.id,
      u.email,
      u.display_name,
      coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles
    from sessions s
    join users u on u.id = s.user_id
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where s.token = ${token}
      and s.expires_at > now()
    group by s.token, s.expires_at, u.id
    limit 1
  `;

  if (!rows[0]) {
    c.set("sessionUser", null);
    await next();
    return;
  }

  c.set("sessionUser", {
    id: Number(rows[0].id),
    email: String(rows[0].email),
    displayName: String(rows[0].display_name),
    roles: normalizeRoles(rows[0].roles),
  });

  await next();
};

export async function attemptLogin(c: Context, email: string, password: string) {
  const rows = await sql`
    select id, email, display_name, password_hash
    from users
    where email = ${email}
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  const isValid = await verifyPassword(password, String(row.password_hash));
  if (!isValid) {
    return null;
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await sql`
    insert into sessions (user_id, token, expires_at)
    values (${row.id}, ${token}, ${expiresAt.toISOString()})
  `;

  await writeAuditLog({
    actorUserId: Number(row.id),
    action: "auth.login",
    targetType: "session",
    targetId: token,
    summary: `User ${row.display_name} signed in.`,
    ipAddress: requestIp(c),
  });

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: false,
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
    insert into users (email, display_name, password_hash)
    values (${input.email}, ${input.displayName}, ${passwordHash})
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
