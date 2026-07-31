import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { sql } from "./db";
import { ensurePublicAssetDirectories } from "./assets";

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
    const statement = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.begin(async (trx) => {
      await trx.unsafe(statement);
      await trx`insert into migrations (name) values (${file})`;
    });
    appliedNow.push(file);
  }
  return appliedNow;
}

export async function resetApplicationDatabase() {
  await sql.begin(async (trx) => {
    await trx.unsafe(`
      truncate table
        sessions,
        user_roles,
        login_attempts,
        form_submission_attempts,
        post_categories,
        post_tags,
        post_series,
        page_group_members,
        menu_items,
        form_fields,
        form_submissions,
        content_revisions,
        audit_logs,
        file_snapshots,
        ai_file_proposals,
        operator_notifications,
        media_variants,
        media_files,
        forms,
        menus,
        content_blocks,
        series,
        page_groups,
        posts,
        pages,
        categories,
        tags,
        settings,
        users
      restart identity cascade
    `);
  });
}

export async function getSetupStatus() {
  try {
    const rows = await sql`select count(*)::int as total from users`;
    return {
      databaseReady: true,
      hasAdmin: Number(rows[0]?.total ?? 0) > 0,
    };
  } catch {
    return { databaseReady: false, hasAdmin: false };
  }
}

function envValue(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function roleByteLimitsValue(limits: Record<string, number | undefined>) {
  return Object.entries(limits)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .map(([role, bytes]) => `${role}:${bytes}`)
    .join(",");
}

export async function writeSetupEnvironment(input: {
  appName: string;
  appUrl: string;
  publicHtmlDir: string;
  sessionSecret: string;
  accountEncryptionKey: string;
}) {
  const envPath = path.join(process.cwd(), ".env");
  let existingEnv = "";
  try {
    existingEnv = await readFile(envPath, "utf8");
  } catch {
    // Ignore if it doesn't exist
  }

  const updates: Record<string, string> = {
    PORT: envValue(String(config.port)),
    APP_URL: envValue(input.appUrl),
    APP_NAME: envValue(input.appName),
    PUBLIC_LOCALE: envValue(config.publicLocale),
    SCHEDULE_TIME_ZONE: envValue(config.scheduleTimeZone),
    SESSION_SECRET: envValue(input.sessionSecret),
    ACCOUNT_ENCRYPTION_KEY: envValue(input.accountEncryptionKey),
    DATABASE_URL: envValue(config.databaseUrl),
    PUBLIC_HTML_DIR: envValue(input.publicHtmlDir),
    CONTROL_PANEL_PATH: envValue(config.controlPanelPath),
    CMS_API_PREFIX: envValue(config.cmsApiPrefix),
    CMS_OUTPUT_DIR: envValue(path.join(input.publicHtmlDir, "cms")),
    CMS_UPLOAD_DIR: envValue(path.join(input.publicHtmlDir, "cms", "uploads")),
    TEMPLATE_DIR: envValue(config.templateDir),
    PLUGIN_DIR: envValue(config.pluginDir),
    DEFAULT_PAGE_SIZE: envValue(String(config.defaultPageSize)),
    MAX_UPLOAD_BYTES: envValue(String(config.maxUploadBytes)),
    ALLOW_SVG_UPLOADS: envValue(String(config.allowSvgUploads)),
    MEDIA_SITE_QUOTA_BYTES: envValue(String(config.mediaSiteQuotaBytes)),
    MEDIA_USER_QUOTA_BYTES: envValue(String(config.mediaUserQuotaBytes)),
    MEDIA_UPLOAD_ALLOWED_ROLES: envValue(Array.from(config.mediaUploadAllowedRoles).join(",")),
    MEDIA_ROLE_QUOTA_BYTES: envValue(roleByteLimitsValue(config.mediaRoleQuotaBytes)),
    MEDIA_ROLE_MAX_UPLOAD_BYTES: envValue(roleByteLimitsValue(config.mediaRoleMaxUploadBytes)),
    MEDIA_IMAGE_DERIVATIVES_ENABLED: envValue(String(config.mediaImageDerivativesEnabled)),
    MEDIA_IMAGE_MAX_WIDTH: envValue(String(config.mediaImageMaxWidth)),
    MEDIA_IMAGE_MAX_HEIGHT: envValue(String(config.mediaImageMaxHeight)),
    MEDIA_THUMBNAIL_WIDTH: envValue(String(config.mediaThumbnailWidth)),
    MEDIA_THUMBNAIL_HEIGHT: envValue(String(config.mediaThumbnailHeight)),
    MEDIA_WEBP_QUALITY: envValue(String(config.mediaWebpQuality)),
    MEDIA_AVIF_QUALITY: envValue(String(config.mediaAvifQuality)),
    MEDIA_MAX_INPUT_PIXELS: envValue(String(config.mediaMaxInputPixels)),
    RECAPTCHA_SITE_KEY: envValue(process.env.RECAPTCHA_SITE_KEY ?? ""),
    RECAPTCHA_SECRET_KEY: envValue(process.env.RECAPTCHA_SECRET_KEY ?? ""),
    RECAPTCHA_MIN_SCORE: envValue(String(config.recaptchaMinScore)),
    COOKIE_SECURE: envValue(String(config.cookieSecure)),
    TRUST_PROXY: envValue(String(config.trustProxy)),
    LOG_LEVEL: envValue(config.logLevel),
    LOG_FORMAT: envValue(config.logFormat),
    OPERATOR_ALERT_WEBHOOK_URL: envValue(config.operatorAlertWebhookUrl ?? ""),
    OPERATOR_ALERT_WEBHOOK_SECRET: envValue(config.operatorAlertWebhookSecret ?? ""),
    OPERATOR_ALERT_MIN_LEVEL: envValue(config.operatorAlertMinLevel),
    OPERATOR_ALERT_TIMEOUT_MS: envValue(String(config.operatorAlertTimeoutMs)),
  };

  const lines = existingEnv.split("\n");
  const seenKeys = new Set<string>();
  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=/);
    if (match) {
      const key = match[1];
      if (updates[key] !== undefined) {
        seenKeys.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seenKeys.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }

  const content = newLines.join("\n").replace(/\n+$/, "") + "\n";

  await mkdir(path.dirname(envPath), { recursive: true });
  await writeFile(envPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(envPath, 0o600);
  await ensurePublicAssetDirectories(input.publicHtmlDir);
  return envPath;
}
