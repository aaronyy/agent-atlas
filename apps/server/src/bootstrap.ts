import { eq } from "drizzle-orm";
import {
  agents,
  apiKeys,
  workspaces,
  type AtlasDb,
} from "@agent-atlas/db";
import { hashApiKey, keyPrefix } from "./auth.js";
import type { Config } from "./config.js";

export async function bootstrapWorkspace(
  db: AtlasDb,
  config: Config,
): Promise<{ workspaceId: string; createdBootstrapKey: string | null }> {
  const existing = await db.select().from(workspaces).limit(1);
  let workspaceId = existing[0]?.id;
  let createdBootstrapKey: string | null = null;

  if (!workspaceId) {
    const inserted = await db
      .insert(workspaces)
      .values({ name: config.workspaceName })
      .returning();
    workspaceId = inserted[0]!.id;
    console.log(`Created workspace "${config.workspaceName}" (${workspaceId})`);
  }

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId));

  // Always ensure the configured local/bootstrap key exists
  {
    const plain = config.bootstrapKey;
    const hash = hashApiKey(plain);
    const found = keys.some((k) => k.keyHash === hash);
    if (!found) {
      await db.insert(apiKeys).values({
        workspaceId,
        label: keys.length === 0 ? "local" : "bootstrap",
        keyHash: hash,
        keyPrefix: keyPrefix(plain),
      });
      createdBootstrapKey = plain;
      console.log(`API key ready: ${plain}`);
    }
  }

  for (const plain of config.extraApiKeys) {
    const hash = hashApiKey(plain);
    const existingKey = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hash))
      .limit(1);
    if (existingKey.length === 0) {
      await db.insert(apiKeys).values({
        workspaceId,
        label: "env",
        keyHash: hash,
        keyPrefix: keyPrefix(plain),
      });
    }
  }

  // Ensure a default grok agent exists
  const grok = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId));
  if (!grok.some((a) => a.slug === "grok")) {
    await db.insert(agents).values({
      workspaceId,
      slug: "grok",
      name: "Grok",
      modelHint: "grok",
    });
  }
  if (!grok.some((a) => a.slug === "human")) {
    await db.insert(agents).values({
      workspaceId,
      slug: "human",
      name: "Human",
      modelHint: null,
    });
  }

  return { workspaceId, createdBootstrapKey };
}
