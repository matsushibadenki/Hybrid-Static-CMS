import { sql } from "./db";
import { hashPassword } from "./security";
import type { UserRole } from "./types";

export const managedRoles: UserRole[] = ["owner", "admin", "editor", "author", "viewer", "ai_agent"];

export type UserAdminRecord = {
  id: number;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  roles: UserRole[];
};

function toUser(row: Record<string, unknown>): UserAdminRecord {
  return {
    id: Number(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    passwordChangedAt: row.password_changed_at ? String(row.password_changed_at) : null,
    roles: Array.isArray(row.roles) ? (row.roles.filter((role): role is UserRole => managedRoles.includes(String(role) as UserRole))) : [],
  };
}

export async function listUsers() {
  const rows = await sql`
    select u.id, u.email, u.display_name, u.is_active, u.created_at, u.last_login_at, u.password_changed_at,
      coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}') as roles
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    group by u.id
    order by u.is_active desc, u.created_at asc
  `;
  return rows.map((row) => toUser(row));
}

export async function getUserById(id: number) {
  const rows = await sql`
    select u.id, u.email, u.display_name, u.is_active, u.created_at, u.last_login_at, u.password_changed_at,
      coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}') as roles
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where u.id = ${id}
    group by u.id
    limit 1
  `;
  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateUserProfile(id: number, input: { email: string; displayName: string; roles: UserRole[] }) {
  const roles = [...new Set(input.roles)].filter((role): role is UserRole => managedRoles.includes(role));
  await sql`
    update users
    set email = ${input.email.trim().toLowerCase()}, display_name = ${input.displayName.trim()}
    where id = ${id}
  `;
  await sql`delete from user_roles where user_id = ${id}`;
  if (roles.length > 0) {
    await sql`
      insert into user_roles (user_id, role_id)
      select ${id}, id from roles where name = any(${sql.array(roles)})
    `;
  }
}

export async function setUserActive(id: number, isActive: boolean) {
  await sql`update users set is_active = ${isActive} where id = ${id}`;
  if (!isActive) {
    await sql`delete from sessions where user_id = ${id}`;
  }
}

export async function resetUserPassword(id: number, password: string) {
  const passwordHash = await hashPassword(password);
  await sql`
    update users
    set password_hash = ${passwordHash}, password_changed_at = now()
    where id = ${id}
  `;
  await sql`delete from sessions where user_id = ${id}`;
}

export async function revokeUserSessions(id: number) {
  const result = await sql`delete from sessions where user_id = ${id}`;
  return result.count;
}

export async function createManagedUser(input: { email: string; displayName: string; password: string; roles: UserRole[] }) {
  const passwordHash = await hashPassword(input.password);
  const rows = await sql`
    insert into users (email, display_name, password_hash, password_changed_at)
    values (${input.email.trim().toLowerCase()}, ${input.displayName.trim()}, ${passwordHash}, now())
    returning id
  `;
  const id = Number(rows[0].id);
  const roles = [...new Set(input.roles)].filter((role): role is UserRole => managedRoles.includes(role));
  if (roles.length > 0) {
    await sql`
      insert into user_roles (user_id, role_id)
      select ${id}, id from roles where name = any(${sql.array(roles)})
    `;
  }
  return id;
}
