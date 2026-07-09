import postgres from "postgres";
import { config } from "./config";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function withTransaction<T>(fn: (trx: typeof sql) => Promise<T>) {
  return sql.begin(async (trx) => fn(trx as unknown as typeof sql));
}
