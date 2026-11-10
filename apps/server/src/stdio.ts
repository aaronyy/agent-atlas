import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "@agent-atlas/db";
import { bootstrapWorkspace } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { loadRepoEnv } from "./env.js";
import { createAtlasMcpServer } from "./mcp/tools.js";
import { createAtlasServices } from "./services/create.js";
import { ensureMigratedOnBoot } from "./migrate-on-boot.js";

async function main() {
  const repoRoot = loadRepoEnv();
  process.chdir(repoRoot);

  const config = loadConfig();
  await ensureMigratedOnBoot(config.databaseUrl);

  const db = await createDb(config.databaseUrl, { dataDirCwd: repoRoot });
  const { workspaceId } = await bootstrapWorkspace(db, config);
  const { atlas, control } = createAtlasServices(
    db,
    workspaceId,
    config.staleHours,
  );
  const server = createAtlasMcpServer(atlas, control);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
