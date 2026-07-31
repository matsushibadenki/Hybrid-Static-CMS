import path from "node:path";
import { parseScheduleTimeZone } from "./scheduling";
import type { LogLevel } from "./logger";
import type { UserRole } from "./types";

export type AppConfig = {
  port: number;
  appUrl: string;
  appName: string;
  publicLocale: "en" | "ja" | "zh";
  scheduleTimeZone: string;
  sessionSecret: string;
  accountEncryptionKey: string;
  databaseUrl: string;
  recaptchaSiteKey: string | null;
  recaptchaSecretKey: string | null;
  recaptchaMinScore: number;
  loginMaxAttempts: number;
  loginWindowSeconds: number;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  cookieSecure: boolean;
  trustProxy: boolean;
  publicHtmlDir: string;
  controlPanelPath: string;
  cmsApiPrefix: string;
  cmsOutputDir: string;
  cmsUploadDir: string;
  templateDir: string;
  pluginDir: string;
  defaultPageSize: number;
  googleFontsCssUrls: string[];
  maxUploadBytes: number;
  allowSvgUploads: boolean;
  mediaSiteQuotaBytes: number;
  mediaUserQuotaBytes: number;
  mediaUploadAllowedRoles: ReadonlySet<UserRole>;
  mediaRoleQuotaBytes: Partial<Record<UserRole, number>>;
  mediaRoleMaxUploadBytes: Partial<Record<UserRole, number>>;
  mediaImageDerivativesEnabled: boolean;
  mediaImageMaxWidth: number;
  mediaImageMaxHeight: number;
  mediaThumbnailWidth: number;
  mediaThumbnailHeight: number;
  mediaWebpQuality: number;
  mediaAvifQuality: number;
  mediaMaxInputPixels: number;
  formRateLimitAttempts: number;
  formRateLimitWindowSeconds: number;
  formSubmissionRetentionDays: number;
  smtpHost: string | null;
  smtpPort: number;
  smtpTls: boolean;
  smtpHostname: string;
  smtpUsername: string | null;
  smtpPassword: string | null;
  smtpFrom: string | null;
  formNotificationEmail: string | null;
  logLevel: LogLevel;
  logFormat: "json" | "text";
  operatorAlertWebhookUrl: string | null;
  operatorAlertWebhookSecret: string | null;
  operatorAlertMinLevel: LogLevel;
  operatorAlertTimeoutMs: number;
};

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function parseConfigNumber(value: string | undefined, fallback: number, options: { min?: number; max?: number; integer?: boolean } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = options.integer === false ? parsed : Math.trunc(parsed);
  if (options.min !== undefined && normalized < options.min) return options.min;
  if (options.max !== undefined && normalized > options.max) return options.max;
  return normalized;
}

export function parsePublicLocale(value: string | undefined): AppConfig["publicLocale"] {
  return value === "ja" || value === "zh" ? value : "en";
}

export function parseLogLevel(value: string | undefined, fallback: LogLevel = "info"): LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : fallback;
}

const userRoles = new Set<UserRole>(["owner", "admin", "editor", "author", "viewer", "ai_agent"]);

export function parseRoleSet(value: string | undefined, fallback: UserRole[] = []) {
  const source = value === undefined ? fallback : value.split(",").map((item) => item.trim());
  return new Set(source.filter((role): role is UserRole => userRoles.has(role as UserRole)));
}

export function parseRoleByteLimits(value: string | undefined) {
  const limits: Partial<Record<UserRole, number>> = {};
  for (const entry of (value ?? "").split(/[|,]/)) {
    const [rawRole, rawBytes] = entry.split(":").map((item) => item.trim());
    if (!userRoles.has(rawRole as UserRole)) continue;
    const bytes = Number(rawBytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) continue;
    limits[rawRole as UserRole] = bytes;
  }
  return limits;
}

export const config: AppConfig = {
  port: parseConfigNumber(process.env.PORT, 3000, { min: 1, max: 65_535 }),
  appUrl: requireEnv("APP_URL", "http://localhost:3000"),
  appName: requireEnv("APP_NAME", "Hybrid-Static-CMS"),
  publicLocale: parsePublicLocale(process.env.PUBLIC_LOCALE),
  scheduleTimeZone: parseScheduleTimeZone(process.env.SCHEDULE_TIME_ZONE),
  sessionSecret: requireEnv("SESSION_SECRET", "change-me"),
  accountEncryptionKey: requireEnv("ACCOUNT_ENCRYPTION_KEY", requireEnv("SESSION_SECRET", "change-me")),
  databaseUrl: requireEnv("DATABASE_URL"),
  recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY?.trim() || null,
  recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY?.trim() || null,
  recaptchaMinScore: parseConfigNumber(process.env.RECAPTCHA_MIN_SCORE, 0.5, { min: 0, max: 1, integer: false }),
  loginMaxAttempts: parseConfigNumber(process.env.LOGIN_MAX_ATTEMPTS, 8, { min: 3 }),
  loginWindowSeconds: parseConfigNumber(process.env.LOGIN_WINDOW_SECONDS, 900, { min: 60 }),
  twoFactorEnabled: process.env.TWO_FACTOR_ENABLED === "true" && Boolean(process.env.TWO_FACTOR_SECRET?.trim()),
  twoFactorSecret: process.env.TWO_FACTOR_SECRET?.trim() || null,
  cookieSecure: process.env.COOKIE_SECURE === "true" || (process.env.COOKIE_SECURE !== "false" && process.env.APP_URL?.startsWith("https://") === true),
  trustProxy: process.env.TRUST_PROXY === "true",
  publicHtmlDir: path.resolve(requireEnv("PUBLIC_HTML_DIR", path.join(process.cwd(), "public_html"))),
  controlPanelPath: requireEnv("CONTROL_PANEL_PATH", "/control-panel"),
  cmsApiPrefix: requireEnv("CMS_API_PREFIX", "/cms-api"),
  cmsOutputDir: path.resolve(
    requireEnv("CMS_OUTPUT_DIR", path.join(process.cwd(), "public_html", "cms")),
  ),
  cmsUploadDir: path.resolve(
    requireEnv("CMS_UPLOAD_DIR", path.join(process.cwd(), "public_html", "cms", "uploads")),
  ),
  templateDir: path.resolve(requireEnv("TEMPLATE_DIR", path.join(process.cwd(), "templates"))),
  pluginDir: path.resolve(requireEnv("PLUGIN_DIR", path.join(process.cwd(), "plugins"))),
  defaultPageSize: parseConfigNumber(process.env.DEFAULT_PAGE_SIZE, 10, { min: 1, max: 50 }),
  maxUploadBytes: parseConfigNumber(process.env.MAX_UPLOAD_BYTES, 20 * 1024 * 1024, { min: 1_048_576 }),
  allowSvgUploads: process.env.ALLOW_SVG_UPLOADS === "true",
  mediaSiteQuotaBytes: parseConfigNumber(process.env.MEDIA_SITE_QUOTA_BYTES, 0, { min: 0 }),
  mediaUserQuotaBytes: parseConfigNumber(process.env.MEDIA_USER_QUOTA_BYTES, 0, { min: 0 }),
  mediaUploadAllowedRoles: parseRoleSet(process.env.MEDIA_UPLOAD_ALLOWED_ROLES, ["owner", "admin", "editor", "author"]),
  mediaRoleQuotaBytes: parseRoleByteLimits(process.env.MEDIA_ROLE_QUOTA_BYTES),
  mediaRoleMaxUploadBytes: parseRoleByteLimits(process.env.MEDIA_ROLE_MAX_UPLOAD_BYTES),
  mediaImageDerivativesEnabled: process.env.MEDIA_IMAGE_DERIVATIVES_ENABLED !== "false",
  mediaImageMaxWidth: parseConfigNumber(process.env.MEDIA_IMAGE_MAX_WIDTH, 1920, { min: 320, max: 7680 }),
  mediaImageMaxHeight: parseConfigNumber(process.env.MEDIA_IMAGE_MAX_HEIGHT, 1920, { min: 320, max: 7680 }),
  mediaThumbnailWidth: parseConfigNumber(process.env.MEDIA_THUMBNAIL_WIDTH, 480, { min: 64, max: 1920 }),
  mediaThumbnailHeight: parseConfigNumber(process.env.MEDIA_THUMBNAIL_HEIGHT, 320, { min: 64, max: 1920 }),
  mediaWebpQuality: parseConfigNumber(process.env.MEDIA_WEBP_QUALITY, 82, { min: 1, max: 100 }),
  mediaAvifQuality: parseConfigNumber(process.env.MEDIA_AVIF_QUALITY, 55, { min: 1, max: 100 }),
  mediaMaxInputPixels: parseConfigNumber(process.env.MEDIA_MAX_INPUT_PIXELS, 40_000_000, { min: 1_000_000, max: 268_402_689 }),
  formRateLimitAttempts: parseConfigNumber(process.env.FORM_RATE_LIMIT_ATTEMPTS, 5, { min: 1 }),
  formRateLimitWindowSeconds: parseConfigNumber(process.env.FORM_RATE_LIMIT_WINDOW_SECONDS, 300, { min: 60 }),
  formSubmissionRetentionDays: parseConfigNumber(process.env.FORM_SUBMISSION_RETENTION_DAYS, 0, { min: 0 }),
  smtpHost: process.env.SMTP_HOST?.trim() || null,
  smtpPort: parseConfigNumber(process.env.SMTP_PORT, 465, { min: 1, max: 65_535 }),
  smtpTls: process.env.SMTP_TLS !== "false",
  smtpHostname: process.env.SMTP_HOSTNAME?.trim() || "localhost",
  smtpUsername: process.env.SMTP_USERNAME?.trim() || null,
  smtpPassword: process.env.SMTP_PASSWORD || null,
  smtpFrom: process.env.SMTP_FROM?.trim() || null,
  formNotificationEmail: process.env.FORM_NOTIFICATION_EMAIL?.trim() || null,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  logFormat: process.env.LOG_FORMAT === "text" ? "text" : "json",
  operatorAlertWebhookUrl: process.env.OPERATOR_ALERT_WEBHOOK_URL?.trim() || null,
  operatorAlertWebhookSecret: process.env.OPERATOR_ALERT_WEBHOOK_SECRET || null,
  operatorAlertMinLevel: parseLogLevel(process.env.OPERATOR_ALERT_MIN_LEVEL, "error"),
  operatorAlertTimeoutMs: parseConfigNumber(process.env.OPERATOR_ALERT_TIMEOUT_MS, 5_000, { min: 500, max: 30_000 }),
  googleFontsCssUrls: (process.env.GOOGLE_FONTS_CSS_URLS ?? [
    "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&family=Noto+Sans+JP:wght@100..900&family=Noto+Sans+Mono:wght@100..900&family=Noto+Serif+JP:wght@200..900&family=Roboto:ital,wght@0,100..900;1,100..900&family=Zen+Maru+Gothic&display=swap",
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=search",
  ].join("|"))
    .split("|")
    .map((url) => url.trim())
    .filter(Boolean),
};
