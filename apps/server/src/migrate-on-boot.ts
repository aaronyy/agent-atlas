import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ensureMigrated } from "@agent-atlas/db";
import { findRepoRoot } from "./env.js";

/** Apply Drizzle migrations at process start. Safe to call repeatedly. */
export async function ensureMigratedOnBoot(databaseUrl: string): Promise<void> {
  const require = createRequire(import.meta.url);
  let migrationsFolder: string | undefined;
  try {
    const dbPkg = path.dirname(require.resolve("@agent-atlas/db/package.json"));
    migrationsFolder = path.join(dbPkg, "drizzle");
  } catch {
    /* fall through */
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const alt = path.resolve(here, "../../../packages/db/drizzle");
  const fs = await import("node:fs");
  if ((!migrationsFolder || !fs.existsSync(migrationsFolder)) && fs.existsSync(alt)) {
    migrationsFolder = alt;
  }
  if (!migrationsFolder) {
    migrationsFolder = path.join(findRepoRoot(), "packages/db/drizzle");
  }

  await ensureMigrated(databaseUrl, migrationsFolder);
}
