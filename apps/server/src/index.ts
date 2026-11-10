import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createDb } from "@agent-atlas/db";
import { createApiApp } from "./api.js";
import { bootstrapWorkspace } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { DEFAULT_LOCAL_KEY, loadRepoEnv } from "./env.js";
import { handleMcpHttp } from "./mcp/http.js";
import { ensureMigratedOnBoot } from "./migrate-on-boot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const repoRoot = loadRepoEnv();
  process.chdir(repoRoot);

  const config = loadConfig();
  await ensureMigratedOnBoot(config.databaseUrl);

  const db = await createDb(config.databaseUrl, { dataDirCwd: repoRoot });
  await bootstrapWorkspace(db, config);

  const api = createApiApp(db, config);
  const app = new Hono();
  app.route("/", api);

  const webDistCandidates = [
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "../../web/dist"),
    path.resolve(process.cwd(), "apps/server/public"),
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "public"),
  ];

  let webRoot: string | null = null;
  const fs = await import("node:fs");
  for (const candidate of webDistCandidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      webRoot = candidate;
      break;
    }
  }

  if (webRoot) {
    const rel = path.relative(process.cwd(), webRoot) || webRoot;
    app.use("/*", serveStatic({ root: rel }));
    app.get("*", serveStatic({ root: rel, path: "index.html" }));
    console.log(`Serving dashboard from ${webRoot}`);
  } else {
    app.get("/", (c) =>
      c.html(
        `<!doctype html><html><body style="font-family:system-ui;background:#0d0d0f;color:#e8e8ed;padding:2rem">
        <h1>Agent Atlas</h1>
        <p>API is up. Build the dashboard with <code>pnpm --filter @agent-atlas/web build</code>.</p>
        <p>Local key: <code>${config.bootstrapKey}</code></p>
        <p>MCP: stdio via <code>pnpm mcp</code> or HTTP <code>POST /mcp</code> with Bearer key.</p>
        <p>Health: <a href="/api/health">/api/health</a></p>
        </body></html>`,
      ),
    );
  }

  const honoListener = getRequestListener(app.fetch);

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/mcp" || url.startsWith("/mcp?")) {
      void handleMcpHttp(req, res, db, config).catch((err) => {
        console.error("MCP error", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Internal MCP error" }));
        }
      });
      return;
    }
    honoListener(req, res);
  });

  server.listen(config.port, () => {
    console.log(`Agent Atlas listening on :${config.port}`);
    console.log(
      `DB: ${config.usingPglite ? "PGlite (.data/atlas)" : "Postgres/Neon"}`,
    );
    console.log(`Local API key: ${config.bootstrapKey}`);
    if (config.bootstrapKey === DEFAULT_LOCAL_KEY) {
      console.log("(default local key — set ATLAS_BOOTSTRAP_KEY to change)");
    }
    console.log(`MCP stdio: pnpm mcp`);
    console.log(`MCP HTTP:  ${config.publicBaseUrl}/mcp`);
    console.log(`Dashboard: ${config.publicBaseUrl}/`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
