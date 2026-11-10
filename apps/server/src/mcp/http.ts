import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AtlasDb } from "@agent-atlas/db";
import { extractBearer, findWorkspaceByApiKey } from "../auth.js";
import type { Config } from "../config.js";
import { createAtlasServices } from "../services/create.js";
import { createAtlasMcpServer } from "./tools.js";

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function handleMcpHttp(
  req: IncomingMessage,
  res: ServerResponse,
  db: AtlasDb,
  config: Config,
): Promise<void> {
  const auth = extractBearer(
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : undefined,
  );
  if (!auth) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Missing Bearer token" }));
    return;
  }

  const found = await findWorkspaceByApiKey(db, auth);
  if (!found) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return;
  }

  const { atlas, control } = createAtlasServices(
    db,
    found.workspaceId,
    config.staleHours,
  );
  const server = createAtlasMcpServer(atlas, control);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);

  const method = (req.method ?? "GET").toUpperCase();
  const parsedBody =
    method === "POST" || method === "PUT" || method === "PATCH"
      ? await readJsonBody(req)
      : undefined;

  await transport.handleRequest(req, res, parsedBody);
}
