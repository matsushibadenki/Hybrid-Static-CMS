import { config } from "../core/config";

export function postgresCommandEnvironment(databaseName?: string) {
  const url = new URL(config.databaseUrl);
  const environment = { ...process.env } as Record<string, string | undefined>;

  environment.PGHOST = url.hostname;
  environment.PGPORT = url.port || "5432";
  environment.PGUSER = decodeURIComponent(url.username);
  environment.PGPASSWORD = decodeURIComponent(url.password);
  environment.PGDATABASE = databaseName ?? decodeURIComponent(url.pathname.replace(/^\//, ""));

  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) {
    environment.PGSSLMODE = sslMode;
  }

  return environment;
}

export function postgresDatabaseName(databaseName?: string) {
  if (databaseName) return databaseName;
  const url = new URL(config.databaseUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}
