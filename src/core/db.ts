import postgres from "postgres";
import { config } from "./config";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const postgresBigintOid = 20;

export function bigintArray(values: readonly number[]) {
  return sql.array([...values], postgresBigintOid);
}

export async function withTransaction<T>(fn: (trx: typeof sql) => Promise<T>) {
  return sql.begin(async (trx) => fn(trx as unknown as typeof sql));
}
