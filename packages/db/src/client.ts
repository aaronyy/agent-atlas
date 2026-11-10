import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import * as schema from "./schema.js";

export type AtlasDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

/** Walk up to monorepo root (pnpm-workspace.yaml), else cwd. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function isPgliteUrl(connectionString: string | undefined | null): boolean {
  if (!connectionString) return true;
  const v = connectionString.trim().toLowerCase();
  return v === "" || v === "pglite" || v.startsWith("pglite:");
}

export function pgliteDataDir(
  connectionString: string | undefined | null,
  cwd?: string,
): string {
  const base = cwd ?? findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  if (connectionString?.trim().toLowerCase().startsWith("pglite:")) {
    const raw = connectionString.trim().slice("pglite:".length);
    return path.isAbsolute(raw) ? raw : path.resolve(base, raw);
  }
  return path.resolve(base, ".data", "atlas");
}

/** Local default: embedded PGlite. Set DATABASE_URL=postgresql://… for Neon/Postgres. */
export async function createDb(
  connectionString?: string | null,
  opts?: { dataDirCwd?: string },
): Promise<AtlasDb> {
  if (isPgliteUrl(connectionString)) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = pgliteDataDir(
      connectionString,
      opts?.dataDirCwd ?? findRepoRoot(),
    );
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await client.waitReady;
    return drizzle(client, { schema });
  }

  const client = postgres(connectionString!, {
    max: 10,
    prepare: false,
  });
  return drizzlePg(client, { schema });
}
