import { spawnSync } from "node:child_process";
import { readdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { env } from "@el-audio-daw/env/api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const DB_PACKAGE = join(REPO_ROOT, "packages", "db");
const ZERO_REPLICA = process.env.ZERO_REPLICA_FILE ?? "/tmp/zero-replica.db";

console.log("→ dropping public schema and zero state");
{
  const sql = postgres(env.DATABASE_URL);
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO public`;
  // Zero's publications and metadata schemas reference table OIDs that won't
  // survive the schema drop. Wipe them so zero-cache rebuilds on next start.
  await sql`DROP PUBLICATION IF EXISTS _zero_public_0`;
  await sql`DROP PUBLICATION IF EXISTS _zero_metadata_0`;
  await sql`DROP SCHEMA IF EXISTS zero CASCADE`;
  await sql`DROP SCHEMA IF EXISTS zero_0 CASCADE`;
  await sql.end();
}

console.log("→ pushing schema (drizzle-kit push)");
{
  const result = spawnSync("bunx", ["drizzle-kit", "push", "--force"], {
    cwd: DB_PACKAGE,
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    console.error("drizzle-kit push failed");
    process.exit(result.status ?? 1);
  }
}

console.log("→ clearing zero replica");
{
  const dir = dirname(ZERO_REPLICA);
  const prefix = basename(ZERO_REPLICA);
  for (const entry of readdirSync(dir)) {
    if (entry === prefix || entry.startsWith(`${prefix}-`)) {
      const path = join(dir, entry);
      unlinkSync(path);
      console.log(`  removed ${path}`);
    }
  }
}

console.log("→ seeding");
{
  const result = spawnSync("bun", ["run", join(__dirname, "seed.ts")], {
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    console.error("seed failed");
    process.exit(result.status ?? 1);
  }
}

console.log("\n✓ reset complete. Restart `bun dev` to rebuild the replica.");
