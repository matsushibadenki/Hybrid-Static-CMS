import path from "node:path";

export type AppConfig = {
  port: number;
  appUrl: string;
  appName: string;
  sessionSecret: string;
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
};

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 3000),
  appUrl: requireEnv("APP_URL", "http://localhost:3000"),
  appName: requireEnv("APP_NAME", "Hybrid-Static-CMS"),
  sessionSecret: requireEnv("SESSION_SECRET", "change-me"),
  databaseUrl: requireEnv("DATABASE_URL"),
  recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY?.trim() || null,
  recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY?.trim() || null,
  recaptchaMinScore: Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5),
  loginMaxAttempts: Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS ?? 8)),
  loginWindowSeconds: Math.max(60, Number(process.env.LOGIN_WINDOW_SECONDS ?? 900)),
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
  defaultPageSize: Number(process.env.DEFAULT_PAGE_SIZE ?? 10),
  maxUploadBytes: Math.max(1_048_576, Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024)),
  allowSvgUploads: process.env.ALLOW_SVG_UPLOADS === "true",
  formRateLimitAttempts: Math.max(1, Number(process.env.FORM_RATE_LIMIT_ATTEMPTS ?? 5)),
  formRateLimitWindowSeconds: Math.max(60, Number(process.env.FORM_RATE_LIMIT_WINDOW_SECONDS ?? 300)),
  formSubmissionRetentionDays: Math.max(0, Number(process.env.FORM_SUBMISSION_RETENTION_DAYS ?? 0)),
  smtpHost: process.env.SMTP_HOST?.trim() || null,
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpTls: process.env.SMTP_TLS !== "false",
  smtpHostname: process.env.SMTP_HOSTNAME?.trim() || "localhost",
  smtpUsername: process.env.SMTP_USERNAME?.trim() || null,
  smtpPassword: process.env.SMTP_PASSWORD || null,
  smtpFrom: process.env.SMTP_FROM?.trim() || null,
  formNotificationEmail: process.env.FORM_NOTIFICATION_EMAIL?.trim() || null,
  googleFontsCssUrls: (process.env.GOOGLE_FONTS_CSS_URLS ?? [
    "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&family=Noto+Sans+JP:wght@100..900&family=Noto+Sans+Mono:wght@100..900&family=Noto+Serif+JP:wght@200..900&family=Roboto:ital,wght@0,100..900;1,100..900&family=Zen+Maru+Gothic&display=swap",
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=search",
  ].join("|"))
    .split("|")
    .map((url) => url.trim())
    .filter(Boolean),
};
