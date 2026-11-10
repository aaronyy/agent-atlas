#!/usr/bin/env node
/**
 * Zero-config local MCP entry for Cursor / Claude / Grok.
 *
 * mcp.json:
 * {
 *   "mcpServers": {
 *     "agent-atlas": {
 *       "command": "node",
 *       "args": ["bin/atlas-mcp.mjs"],
 *       "cwd": "/absolute/path/to/agent-atlas"
 *     }
 *   }
 * }
 *
 * Uses embedded PGlite + local key `atlas_local` unless .env overrides.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(
    envPath,
    `# Auto-created for local Agent Atlas
# Dashboard + HTTP MCP: Authorization Bearer atlas_local
ATLAS_BOOTSTRAP_KEY=atlas_local
# Leave unset / pglite for zero-config local DB (no Docker)
DATABASE_URL=pglite
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
`,
  );
}

const tsxBin = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "apps", "server", "src", "stdio.ts");
const built = path.join(root, "apps", "server", "dist", "stdio.js");

const useTsx = fs.existsSync(tsxBin) && fs.existsSync(entry);
const cmd = useTsx ? tsxBin : process.execPath;
const args = useTsx ? [entry] : [built];

if (!useTsx && !fs.existsSync(built)) {
  console.error(
    "Agent Atlas MCP: run `pnpm setup` once from the repo root, then retry.",
  );
  process.exit(1);
}

const child = spawn(cmd, args, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
