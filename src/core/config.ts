import path from "node:path";

export type AppConfig = {
  port: number;
  appUrl: string;
  appName: string;
  sessionSecret: string;
  databaseUrl: string;
  publicHtmlDir: string;
  controlPanelPath: string;
  cmsApiPrefix: string;
  cmsOutputDir: string;
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
  appName: requireEnv("APP_NAME", "BunPress Core"),
  sessionSecret: requireEnv("SESSION_SECRET", "change-me"),
  databaseUrl: requireEnv("DATABASE_URL"),
  publicHtmlDir: path.resolve(requireEnv("PUBLIC_HTML_DIR", path.join(process.cwd(), "public_html"))),
  controlPanelPath: requireEnv("CONTROL_PANEL_PATH", "/control-panel"),
  cmsApiPrefix: requireEnv("CMS_API_PREFIX", "/cms-api"),
  cmsOutputDir: path.resolve(
    requireEnv("CMS_OUTPUT_DIR", path.join(process.cwd(), "public_html", "cms")),
  ),
  defaultPageSize: Number(process.env.DEFAULT_PAGE_SIZE ?? 10),
};
