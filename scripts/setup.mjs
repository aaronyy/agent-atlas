#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(
    envPath,
    `# Local Agent Atlas — zero-config defaults
ATLAS_BOOTSTRAP_KEY=atlas_local
DATABASE_URL=pglite
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
WORKSPACE_NAME=Agent Atlas
STALE_HOURS=24
`,
  );
  console.log("Wrote .env (key: atlas_local, DB: PGlite)");
} else {
  console.log(".env already exists — leaving it alone");
}

run("pnpm", ["install"]);
run("pnpm", ["--filter", "@agent-atlas/core", "build"]);
run("pnpm", ["--filter", "@agent-atlas/db", "build"]);
run("pnpm", ["--filter", "@agent-atlas/server", "build"]);
run("pnpm", ["--filter", "@agent-atlas/web", "build"]);

// Migrate embedded DB (or Postgres if DATABASE_URL is set in .env)
run("pnpm", ["db:migrate"]);

console.log(`
Setup complete.

  Dashboard:  pnpm dev          → http://localhost:8080  (key: atlas_local)
  MCP local:  add examples/cursor-mcp.json to Cursor

Cursor / Claude MCP (copy cwd to your clone path):

{
  "mcpServers": {
    "agent-atlas": {
      "command": "node",
      "args": ["bin/atlas-mcp.mjs"],
      "cwd": "${root}"
    }
  }
}
`);
