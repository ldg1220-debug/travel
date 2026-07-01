import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@/lib/server/db";

const here = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = await readFile(path.join(here, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("[db:migrate] schema applied");
  await pool.end();
}

migrate().catch((err) => {
  console.error("[db:migrate] failed:", err);
  process.exitCode = 1;
});
