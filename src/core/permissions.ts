import type { Context, MiddlewareHandler } from "hono";
import { config } from "./config";
import type { UserRole } from "./types";

export type Permission =
  | "admin.access"
  | "posts.read"
  | "posts.write"
  | "posts.publish"
  | "posts.delete"
  | "posts.restore"
  | "pages.read"
  | "pages.write"
  | "pages.publish"
  | "pages.delete"
  | "pages.restore"
  | "forms.read"
  | "forms.submissions.read"
  | "forms.write"
  | "forms.delete"
  | "media.read"
  | "media.write"
  | "media.delete"
  | "menus.read"
  | "menus.write"
  | "menus.delete"
  | "blocks.read"
  | "blocks.write"
  | "blocks.delete"
  | "ai.review"
  | "ai.propose"
  | "audit.read"
  | "snapshots.read"
  | "snapshots.write"
  | "snapshots.restore"
  | "users.manage"
  | "publishing.render";

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  owner: [
    "admin.access", "posts.read", "posts.write", "posts.publish", "posts.delete", "posts.restore",
    "pages.read", "pages.write", "pages.publish", "pages.delete", "pages.restore", "forms.read", "forms.submissions.read", "forms.write", "forms.delete",
    "media.read", "media.write", "media.delete", "menus.read", "menus.write", "menus.delete", "blocks.read", "blocks.write", "blocks.delete",
    "ai.review", "ai.propose", "audit.read", "snapshots.read", "snapshots.write", "snapshots.restore", "users.manage", "publishing.render",
  ],
  admin: [
    "admin.access", "posts.read", "posts.write", "posts.publish", "posts.delete", "posts.restore",
    "pages.read", "pages.write", "pages.publish", "pages.delete", "pages.restore", "forms.read", "forms.submissions.read", "forms.write", "forms.delete",
    "media.read", "media.write", "media.delete", "menus.read", "menus.write", "menus.delete", "blocks.read", "blocks.write", "blocks.delete",
    "ai.review", "ai.propose", "audit.read", "snapshots.read", "snapshots.write", "snapshots.restore", "users.manage", "publishing.render",
  ],
  editor: [
    "admin.access", "posts.read", "posts.write", "posts.publish", "pages.read", "pages.write", "pages.publish",
    "forms.read", "forms.submissions.read", "forms.write", "media.read", "media.write", "menus.read", "menus.write", "blocks.read", "blocks.write", "publishing.render",
  ],
  author: ["admin.access", "posts.read", "posts.write", "media.read", "media.write"],
  viewer: ["admin.access", "posts.read", "pages.read", "forms.read", "media.read", "menus.read", "blocks.read"],
  ai_agent: ["posts.read", "pages.read", "ai.propose"],
};

export function hasPermission(user: { roles: ReadonlyArray<UserRole> } | null | undefined, permission: Permission) {
  return Boolean(user?.roles.some((role) => rolePermissions[role]?.includes(permission)));
}

function relativePath(c: Context) {
  const prefix = config.controlPanelPath.replace(/\/$/, "");
  return c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) || "/" : c.req.path;
}

function adminPermissionForRequest(c: Context): Permission {
  const path = relativePath(c);
  const method = c.req.method;
  if (path === "/" || path.startsWith("/notifications/")) return "admin.access";
  if (path.startsWith("/users")) return "users.manage";
  if (path.startsWith("/logs")) return "audit.read";
  if (path.startsWith("/snapshots")) return path.endsWith("/restore") && method === "POST" ? "snapshots.restore" : method === "POST" ? "snapshots.write" : "snapshots.read";
  if (path.startsWith("/proposals")) return "ai.review";
  if (path.startsWith("/media")) return method === "GET" ? "media.read" : path.endsWith("/delete") ? "media.delete" : "media.write";
  if (path.startsWith("/posts")) {
    if (path === "/posts/media/upload") return "media.write";
    if (path.endsWith("/delete")) return "posts.delete";
    if (path.includes("/revisions/") && method === "POST") return "posts.restore";
    if (path.endsWith("/revisions") || path.endsWith("/edit") || path === "/posts") return method === "GET" ? "posts.read" : "posts.write";
    if (path === "/posts/new") return "posts.write";
    return path === "/posts/new" ? "posts.write" : method === "GET" ? "posts.read" : "posts.write";
  }
  if (path.startsWith("/pages")) {
    if (path.endsWith("/delete")) return "pages.delete";
    if (path.includes("/revisions/") && method === "POST") return "pages.restore";
    if (path.endsWith("/revisions") || path.endsWith("/edit") || path === "/pages") return method === "GET" ? "pages.read" : "pages.write";
    return path === "/pages/new" ? "pages.write" : method === "GET" ? "pages.read" : "pages.write";
  }
  if (path.startsWith("/forms")) {
    if (path.endsWith("/delete")) return "forms.delete";
    if (path.endsWith("/submissions.csv")) return "forms.submissions.read";
    return path === "/forms/new" || path.endsWith("/edit") ? "forms.write" : method === "GET" ? "forms.read" : "forms.write";
  }
  if (path.startsWith("/menus")) return path.endsWith("/delete") ? "menus.delete" : path === "/menus/new" ? "menus.write" : method === "GET" ? "menus.read" : "menus.write";
  if (path.startsWith("/blocks")) return path.endsWith("/delete") ? "blocks.delete" : path === "/blocks/new" ? "blocks.write" : method === "GET" ? "blocks.read" : "blocks.write";
  if (path === "/render") return "publishing.render";
  return "admin.access";
}

export function requirePermission(permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("sessionUser");
    if (!user) return c.redirect("/login");
    if (!hasPermission(user, permission)) return c.text("Forbidden", 403);
    await next();
  };
}

export function requireAdminPermission(): MiddlewareHandler {
  return async (c, next) => {
    const permission = adminPermissionForRequest(c);
    const user = c.get("sessionUser");
    if (!user) return c.redirect("/login");
    if (!hasPermission(user, permission)) return c.text("Forbidden", 403);
    await next();
  };
}

export function apiPermissionForRequest(c: Context): Permission | null {
  if (c.req.method === "GET" || c.req.path.endsWith("/submit")) return null;
  const path = c.req.path.replace(config.cmsApiPrefix, "");
  if (path.startsWith("/ai/proposals")) return "ai.propose";
  if (path.startsWith("/posts")) return c.req.method === "DELETE" ? "posts.delete" : "posts.write";
  if (path.startsWith("/pages")) return c.req.method === "DELETE" ? "pages.delete" : "pages.write";
  if (path.startsWith("/media")) return c.req.method === "DELETE" ? "media.delete" : "media.write";
  if (path.startsWith("/forms")) return c.req.method === "DELETE" ? "forms.delete" : "forms.write";
  return "admin.access";
}

export function requireApiPermission(): MiddlewareHandler {
  return async (c, next) => {
    const permission = apiPermissionForRequest(c);
    if (!permission) return next();
    const user = c.get("sessionUser");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!hasPermission(user, permission)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}
