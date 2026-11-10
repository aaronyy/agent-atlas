import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPgliteUrl, pgliteDataDir } from "./client.js";
import { ensureMigrated } from "./ensure-migrated.js";

function loadRootEnv() {
  // packages/db/src|dist → repo root is ../../..
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const envPath = path.join(dir, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  loadRootEnv();
  const url = process.env.DATABASE_URL?.trim() || "pglite";
  console.log(
    isPgliteUrl(url)
      ? `Database: PGlite (${pgliteDataDir(url)})`
      : "Database: Postgres/Neon",
  );
  await ensureMigrated(url);
  console.log("Migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
