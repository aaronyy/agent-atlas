import { DEFAULT_LOCAL_KEY } from "./env.js";

export interface Config {
  databaseUrl: string;
  port: number;
  bootstrapKey: string;
  extraApiKeys: string[];
  staleHours: number;
  publicBaseUrl: string;
  workspaceName: string;
  /** True when using embedded PGlite (no Postgres required). */
  usingPglite: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawDb = env.DATABASE_URL?.trim();
  const databaseUrl = rawDb && rawDb.length > 0 ? rawDb : "pglite";
  const usingPglite =
    databaseUrl === "pglite" ||
    databaseUrl.toLowerCase().startsWith("pglite:");

  const extra =
    env.ATLAS_API_KEYS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const bootstrapKey =
    env.ATLAS_BOOTSTRAP_KEY?.trim() || DEFAULT_LOCAL_KEY;

  return {
    databaseUrl,
    port: Number(env.PORT ?? 8080),
    bootstrapKey,
    extraApiKeys: extra,
    staleHours: Number(env.STALE_HOURS ?? 24),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:8080").replace(
      /\/$/,
      "",
    ),
    workspaceName: env.WORKSPACE_NAME?.trim() || "Agent Atlas",
    usingPglite,
  };
}
