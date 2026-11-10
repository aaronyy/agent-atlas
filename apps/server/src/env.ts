import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from here to find the monorepo root (pnpm-workspace.yaml). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/** Load KEY=VAL from .env into process.env. */
export function loadDotEnv(
  filePath: string,
  opts?: { override?: boolean },
): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
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
    if (opts?.override || process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function loadRepoEnv(): string {
  const root = findRepoRoot(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  // Prefer cwd when already in repo; else package-relative root
  const fromCwd = findRepoRoot(process.cwd());
  const repoRoot =
    fs.existsSync(path.join(fromCwd, "pnpm-workspace.yaml"))
      ? fromCwd
      : root;
  // Repo .env wins for local DX (so DATABASE_URL=pglite isn't clobbered by a shell export)
  loadDotEnv(path.join(repoRoot, ".env"), { override: true });
  return repoRoot;
}

/** Default local API key — dashboard + HTTP MCP. Change via ATLAS_BOOTSTRAP_KEY. */
export const DEFAULT_LOCAL_KEY = "atlas_local";
