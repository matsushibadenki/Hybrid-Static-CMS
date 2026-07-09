import { Hono } from "hono";
import { adminLayout } from "../../core/layout";
import { attemptLogin, logout } from "../../core/auth";
import { config } from "../../core/config";

export const authRoutes = new Hono();

authRoutes.get("/login", (c) => {
  const user = c.get("sessionUser");
  if (user) {
    return c.redirect(config.controlPanelPath);
  }

  const body = `
    <form method="post" action="/login" class="form-grid">
      <label>Email <input type="email" name="email" autocomplete="email" required /></label>
      <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
      <div class="row">
        <button class="button button-primary" type="submit">Sign in</button>
      </div>
    </form>
  `;

  return c.html(adminLayout("Login", null, body));
});

authRoutes.post("/login", async (c) => {
  const form = await c.req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const user = await attemptLogin(c, email, password);

  if (!user) {
    const body = `
      <p>Invalid credentials.</p>
      <form method="post" action="/login" class="form-grid">
        <label>Email <input type="email" name="email" value="${email}" autocomplete="email" required /></label>
        <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
        <div class="row">
          <button class="button button-primary" type="submit">Try again</button>
        </div>
      </form>
    `;
    return c.html(adminLayout("Login", null, body), 401);
  }

  return c.redirect(config.controlPanelPath);
});

authRoutes.post("/logout", async (c) => {
  await logout(c);
  return c.redirect("/login");
});
