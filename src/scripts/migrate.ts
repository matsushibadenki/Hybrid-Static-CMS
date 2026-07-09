import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "../core/db";

const migrationsDir = path.join(process.cwd(), "migrations");

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

for (const file of files) {
  if (appliedNames.has(file)) {
    continue;
  }

  const statement = await readFile(path.join(migrationsDir, file), "utf8");
  console.log(`Applying ${file}`);
  await sql.unsafe(statement);
  await sql`insert into migrations (name) values (${file})`;
}

console.log("Migrations complete.");
