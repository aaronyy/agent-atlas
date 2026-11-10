import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, isPgliteUrl } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureMigrated(
  databaseUrl: string,
  migrationsFolder = path.join(__dirname, "..", "drizzle"),
): Promise<void> {
  if (isPgliteUrl(databaseUrl)) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const db = await createDb(databaseUrl);
    await migrate(db as never, { migrationsFolder });
    return;
  }

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
