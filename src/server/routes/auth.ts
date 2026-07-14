import { Hono } from "hono";
import { adminLayout } from "../../core/layout";
import { attemptLogin, logout } from "../../core/auth";
import { config } from "../../core/config";
import { escapeHtml } from "../../core/content";
import { createUser } from "../../core/auth";
import { getSetupStatus, runSetupMigrations, writeSetupEnvironment } from "../../core/setup";
import { randomToken } from "../../core/security";

function twoFactorField() {
  return config.twoFactorEnabled
    ? `<label>Authenticator code <input inputmode="numeric" pattern="[0-9]{6}" name="twoFactorCode" autocomplete="one-time-code" required /></label>`
    : "";
}

export const authRoutes = new Hono();

function setupForm(values: Record<string, string> = {}, message = "") {
  return `
    ${message ? `<p>${escapeHtml(message)}</p>` : ""}
    <p class="meta">Database: configured by the current <code>DATABASE_URL</code>. The wizard will run pending migrations and create the first administrator.</p>
    <form method="post" action="/setup" class="form-grid">
      <label>Site name <input name="appName" value="${escapeHtml(values.appName ?? config.appName)}" required /></label>
      <label>Public URL <input type="url" name="appUrl" value="${escapeHtml(values.appUrl ?? config.appUrl)}" required /></label>
      <label>public_html directory <input name="publicHtmlDir" value="${escapeHtml(values.publicHtmlDir ?? config.publicHtmlDir)}" required /></label>
      <label>Administrator name <input name="displayName" value="${escapeHtml(values.displayName ?? "Site Owner")}" required /></label>
      <label>Administrator email <input type="email" name="email" value="${escapeHtml(values.email ?? "")}" autocomplete="email" required /></label>
      <label>Administrator password <input type="password" name="password" autocomplete="new-password" minlength="12" required /></label>
      <div class="row"><button class="button button-primary" type="submit">Run setup</button></div>
    </form>
  `;
}

authRoutes.get("/setup", async (c) => {
  const status = await getSetupStatus();
  if (status.hasAdmin) return c.redirect("/login");
  return c.html(adminLayout("Initial Setup", null, setupForm()));
});

authRoutes.post("/setup", async (c) => {
  const status = await getSetupStatus();
  if (status.hasAdmin) return c.redirect("/login");
  const form = await c.req.formData();
  const values = {
    appName: String(form.get("appName") ?? ""),
    appUrl: String(form.get("appUrl") ?? ""),
    publicHtmlDir: String(form.get("publicHtmlDir") ?? ""),
    displayName: String(form.get("displayName") ?? ""),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: String(form.get("password") ?? ""),
  };
  try {
    if (!values.appName || !values.appUrl || !values.publicHtmlDir || !values.displayName || !values.email.includes("@")) throw new Error("Complete all required fields.");
    if (values.password.length < 12) throw new Error("Administrator password must contain at least 12 characters.");
    await runSetupMigrations();
    const afterMigration = await getSetupStatus();
    if (afterMigration.hasAdmin) return c.redirect("/login");
    await createUser({ email: values.email, password: values.password, displayName: values.displayName, roles: ["owner", "admin"] });
    await writeSetupEnvironment({ appName: values.appName, appUrl: values.appUrl, publicHtmlDir: values.publicHtmlDir, sessionSecret: randomToken(48) });
    return c.html(adminLayout("Setup Complete", null, `<h2>Setup complete</h2><p>The administrator was created and the environment file was written with owner-only permissions.</p><p>Restart the Bun process, then sign in at <a href="/login">/login</a>. The setup wizard is now locked because an administrator exists.</p>`));
  } catch (error) {
    return c.html(adminLayout("Initial Setup", null, setupForm(values, error instanceof Error ? error.message : "Setup failed.")), 400);
  }
});

authRoutes.get("/login", (c) => {
  const user = c.get("sessionUser");
  if (user) {
    return c.redirect(config.controlPanelPath);
  }

  const body = `
    <form method="post" action="/login" class="form-grid">
      <label>Email <input type="email" name="email" autocomplete="email" required /></label>
      <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
      ${twoFactorField()}
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
  const twoFactorCode = String(form.get("twoFactorCode") ?? "");
  const user = await attemptLogin(c, email, password, twoFactorCode);

  if (!user) {
    const body = `
      <p>Invalid credentials.</p>
      <form method="post" action="/login" class="form-grid">
        <label>Email <input type="email" name="email" value="${escapeHtml(email)}" autocomplete="email" required /></label>
        <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
        ${twoFactorField()}
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
