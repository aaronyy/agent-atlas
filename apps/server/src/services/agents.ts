import { and, eq } from "drizzle-orm";
import { agents, type AtlasDb } from "@agent-atlas/db";

export async function ensureAgent(
  db: AtlasDb,
  workspaceId: string,
  slug: string,
  opts?: { name?: string; modelHint?: string | null },
) {
  const existing = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.slug, slug)))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(agents)
    .values({
      workspaceId,
      slug,
      name: opts?.name ?? slug,
      modelHint: opts?.modelHint ?? null,
    })
    .returning();
  return inserted[0]!;
}

export async function listAgents(db: AtlasDb, workspaceId: string) {
  return db.select().from(agents).where(eq(agents.workspaceId, workspaceId));
}

export async function getAgentBySlug(
  db: AtlasDb,
  workspaceId: string,
  slug: string,
) {
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}
