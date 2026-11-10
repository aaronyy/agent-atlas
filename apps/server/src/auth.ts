import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { apiKeys, type AtlasDb } from "@agent-atlas/db";

export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

export function generateApiKey(): string {
  return `atlas_${randomBytes(24).toString("base64url")}`;
}

export function keyPrefix(plain: string): string {
  return plain.slice(0, 12);
}

export async function findWorkspaceByApiKey(
  db: AtlasDb,
  plainKey: string,
): Promise<{ workspaceId: string; apiKeyId: string } | null> {
  const keyHash = hashApiKey(plainKey);
  const rows = await db
    .select({
      id: apiKeys.id,
      workspaceId: apiKeys.workspaceId,
      keyHash: apiKeys.keyHash,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Constant-time compare even though we looked up by hash
  const a = Buffer.from(row.keyHash);
  const b = Buffer.from(keyHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  return { workspaceId: row.workspaceId, apiKeyId: row.id };
}

export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m?.[1]?.trim() || null;
}
