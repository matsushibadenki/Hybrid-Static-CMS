import { Hono } from "hono";
import type { Handler } from "hono";

export const customApiRoutes = new Hono();

export function registerApiRoute(method: "get" | "post" | "put" | "patch" | "delete", path: string, handler: Handler) {
  customApiRoutes[method](path, handler);
}

export type AdminLink = { label: string; href: string };
const adminLinks: AdminLink[] = [];

export function registerAdminLink(link: AdminLink) {
  if (!link.label.trim() || !link.href.trim()) return;
  adminLinks.push({ label: link.label.trim(), href: link.href.trim() });
}

export function listAdminLinks() {
  return [...adminLinks];
}
