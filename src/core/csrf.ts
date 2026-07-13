import type { MiddlewareHandler } from "hono";
import { config } from "./config";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOrigin(c: Parameters<MiddlewareHandler>[0]) {
  const expectedOrigin = new URL(config.appUrl).origin;
  const origin = c.req.header("origin");
  if (origin) {
    return origin === expectedOrigin;
  }

  const referer = c.req.header("referer");
  return Boolean(referer && new URL(referer).origin === expectedOrigin);
}

export const csrfMiddleware: MiddlewareHandler = async (c, next) => {
  if (!mutationMethods.has(c.req.method)) {
    await next();
    return;
  }

  const user = c.get("sessionUser");
  if (!user) {
    await next();
    return;
  }

  const suppliedToken = c.req.header("x-csrf-token");
  const tokenMatches = Boolean(suppliedToken && suppliedToken === user.csrfToken);
  if (tokenMatches || isSameOrigin(c)) {
    await next();
    return;
  }

  if (c.req.path.startsWith(config.cmsApiPrefix)) {
    return c.json({ error: "CSRF validation failed" }, 403);
  }
  return c.text("CSRF validation failed", 403);
};
