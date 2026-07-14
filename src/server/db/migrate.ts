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

migrate().catch(async (err) => {
  console.error("[db:migrate] failed:", err);
  // Without this, a failed query never reaches the success path's
  // `pool.end()` — the open connection keeps the event loop alive, so the
  // process hangs instead of exiting non-zero, which would silently stall
  // (rather than fail) the Vercel build step this now runs as part of.
  await pool.end().catch(() => {});
  process.exit(1);
});
