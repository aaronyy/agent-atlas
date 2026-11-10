import {
  progressEvents,
  type AtlasDb,
  type EntityKind,
} from "@agent-atlas/db";

export async function recordEvent(
  db: AtlasDb,
  input: {
    workspaceId: string;
    agentId?: string | null;
    entityKind: EntityKind;
    entityId: string;
    eventType: string;
    note?: string | null;
    percent?: number | null;
    evidenceUrl?: string | null;
    meta?: Record<string, unknown> | null;
  },
) {
  const inserted = await db
    .insert(progressEvents)
    .values({
      workspaceId: input.workspaceId,
      agentId: input.agentId ?? null,
      entityKind: input.entityKind,
      entityId: input.entityId,
      eventType: input.eventType,
      note: input.note ?? null,
      percent: input.percent != null ? String(input.percent) : null,
      evidenceUrl: input.evidenceUrl ?? null,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    })
    .returning();
  return inserted[0]!;
}
