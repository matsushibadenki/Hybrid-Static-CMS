import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { sql } from "./db";

const migrationsDir = path.join(process.cwd(), "migrations");

export async function runSetupMigrations() {
  await sql`
    create table if not exists migrations (
      id serial primary key,
      name text not null unique,
      executed_at timestamptz not null default now()
    )
  `;
  const applied = await sql`select name from migrations order by name asc`;
  const appliedNames = new Set(applied.map((row) => String(row.name)));
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const appliedNow: string[] = [];
  for (const file of files) {
    if (appliedNames.has(file)) continue;
    await sql.unsafe(await readFile(path.join(migrationsDir, file), "utf8"));
    await sql`insert into migrations (name) values (${file})`;
    appliedNow.push(file);
  }
  return appliedNow;
}

export async function getSetupStatus() {
  try {
    const rows = await sql`select count(*)::int as total from users`;
    return { databaseReady: true, hasAdmin: Number(rows[0]?.total ?? 0) > 0 };
  } catch {
    return { databaseReady: false, hasAdmin: false };
  }
}

function envValue(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function writeSetupEnvironment(input: {
  appName: string;
  appUrl: string;
  publicHtmlDir: string;
  sessionSecret: string;
}) {
  const environment = [
    `PORT=${envValue(String(config.port))}`,
    `APP_URL=${envValue(input.appUrl)}`,
    `APP_NAME=${envValue(input.appName)}`,
    `SESSION_SECRET=${envValue(input.sessionSecret)}`,
    `DATABASE_URL=${envValue(config.databaseUrl)}`,
    `PUBLIC_HTML_DIR=${envValue(input.publicHtmlDir)}`,
    `CONTROL_PANEL_PATH=${envValue(config.controlPanelPath)}`,
    `CMS_API_PREFIX=${envValue(config.cmsApiPrefix)}`,
    `CMS_OUTPUT_DIR=${envValue(path.join(input.publicHtmlDir, "cms"))}`,
    `CMS_UPLOAD_DIR=${envValue(path.join(input.publicHtmlDir, "cms", "uploads"))}`,
    `TEMPLATE_DIR=${envValue(config.templateDir)}`,
    `PLUGIN_DIR=${envValue(config.pluginDir)}`,
    `DEFAULT_PAGE_SIZE=${envValue(String(config.defaultPageSize))}`,
    `RECAPTCHA_SITE_KEY=${envValue(process.env.RECAPTCHA_SITE_KEY ?? "")}`,
    `RECAPTCHA_SECRET_KEY=${envValue(process.env.RECAPTCHA_SECRET_KEY ?? "")}`,
    `RECAPTCHA_MIN_SCORE=${envValue(String(config.recaptchaMinScore))}`,
    `COOKIE_SECURE=${envValue(String(config.cookieSecure))}`,
    `TRUST_PROXY=${envValue(String(config.trustProxy))}`,
  ];
  const envPath = path.join(process.cwd(), ".env");
  await mkdir(path.dirname(envPath), { recursive: true });
  await writeFile(envPath, `${environment.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(envPath, 0o600);
  return envPath;
}
