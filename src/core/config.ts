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
  publicHtmlDir: string;
  controlPanelPath: string;
  cmsApiPrefix: string;
  cmsOutputDir: string;
  cmsUploadDir: string;
  defaultPageSize: number;
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
  publicHtmlDir: path.resolve(requireEnv("PUBLIC_HTML_DIR", path.join(process.cwd(), "public_html"))),
  controlPanelPath: requireEnv("CONTROL_PANEL_PATH", "/control-panel"),
  cmsApiPrefix: requireEnv("CMS_API_PREFIX", "/cms-api"),
  cmsOutputDir: path.resolve(
    requireEnv("CMS_OUTPUT_DIR", path.join(process.cwd(), "public_html", "cms")),
  ),
  cmsUploadDir: path.resolve(
    requireEnv("CMS_UPLOAD_DIR", path.join(process.cwd(), "public_html", "cms", "uploads")),
  ),
  defaultPageSize: Number(process.env.DEFAULT_PAGE_SIZE ?? 10),
};
