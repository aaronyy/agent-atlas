import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AtlasDb } from "@agent-atlas/db";
import { extractBearer, findWorkspaceByApiKey } from "./auth.js";
import type { Config } from "./config.js";
import type { AtlasService } from "./services/atlas.js";
import type { ControlPlaneService } from "./services/control-plane.js";
import { createAtlasServices } from "./services/create.js";

type Variables = {
  atlas: AtlasService;
  control: ControlPlaneService;
  workspaceId: string;
};

export function createApiApp(db: AtlasDb, config: Config) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", cors());

  app.get("/api/health", (c) =>
    c.json({ ok: true, service: "agent-atlas", version: "0.2.0" }),
  );

  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/health") return next();
    const token = extractBearer(c.req.header("authorization"));
    if (!token) return c.json({ error: "Missing Bearer token" }, 401);
    const found = await findWorkspaceByApiKey(db, token);
    if (!found) return c.json({ error: "Invalid API key" }, 401);
    const services = createAtlasServices(
      db,
      found.workspaceId,
      config.staleHours,
    );
    c.set("atlas", services.atlas);
    c.set("control", services.control);
    c.set("workspaceId", found.workspaceId);
    await next();
  });

  app.get("/api/overview", async (c) => {
    const atlas = c.get("atlas");
    return c.json(await atlas.getWorkspaceOverview());
  });

  app.get("/api/attention", async (c) => {
    const atlas = c.get("atlas");
    return c.json(await atlas.getAttention());
  });

  app.get("/api/cycles", async (c) => {
    const atlas = c.get("atlas");
    return c.json(await atlas.listCycles());
  });

  app.get("/api/objectives/:id", async (c) => {
    const atlas = c.get("atlas");
    try {
      return c.json(await atlas.getObjective(c.req.param("id")));
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        404,
      );
    }
  });

  app.get("/api/tasks", async (c) => {
    const atlas = c.get("atlas");
    const status = c.req.query("status") as
      | "backlog"
      | "ready"
      | "in_progress"
      | "blocked"
      | "done"
      | "cancelled"
      | undefined;
    return c.json(
      await atlas.listTasks({
        status,
        assigneeAgentSlug: c.req.query("assignee") ?? undefined,
        cycleId: c.req.query("cycleId") ?? undefined,
        objectiveId: c.req.query("objectiveId") ?? undefined,
        staleOnly: c.req.query("stale") === "1",
      }),
    );
  });

  app.get("/api/tasks/:id", async (c) => {
    const atlas = c.get("atlas");
    try {
      return c.json(await atlas.getTask(c.req.param("id")));
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        404,
      );
    }
  });

  app.get("/api/agents", async (c) => {
    const atlas = c.get("atlas");
    return c.json(await atlas.getAgentsSummary());
  });

  app.get("/api/connect", async (c) => {
    const atlas = c.get("atlas");
    return c.json(await atlas.getConnectInfo(config.publicBaseUrl));
  });

  app.post("/api/comments", async (c) => {
    const atlas = c.get("atlas");
    const body = await c.req.json<{
      entityKind:
        | "objective"
        | "key_result"
        | "project"
        | "task"
        | "cycle"
        | "principle"
        | "tradeoff"
        | "approval"
        | "signal";
      entityId: string;
      body: string;
      authorLabel?: string;
    }>();
    if (!body.entityKind || !body.entityId || !body.body) {
      return c.json({ error: "entityKind, entityId, body required" }, 400);
    }
    const row = await atlas.addComment({
      entityKind: body.entityKind,
      entityId: body.entityId,
      body: body.body,
      authorLabel: body.authorLabel ?? "human",
      agentSlug: "human",
    });
    return c.json(row);
  });

  app.post("/api/tasks/:id/acknowledge", async (c) => {
    const atlas = c.get("atlas");
    try {
      return c.json(await atlas.acknowledgeAttention(c.req.param("id")));
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        404,
      );
    }
  });

  app.get("/api/digest", async (c) => {
    const control = c.get("control");
    return c.json(await control.getOperatorDigest());
  });

  app.get("/api/approvals", async (c) => {
    const control = c.get("control");
    const status = c.req.query("status") as
      | "pending"
      | "approved"
      | "rejected"
      | "cancelled"
      | undefined;
    return c.json(await control.listApprovals(status));
  });

  app.post("/api/approvals/:id/resolve", async (c) => {
    const control = c.get("control");
    const body = await c.req.json<{
      decision: "approved" | "rejected";
      note?: string;
    }>();
    try {
      return c.json(
        await control.resolveApproval({
          approvalId: c.req.param("id"),
          decision: body.decision,
          note: body.note,
          resolvedBy: "operator",
        }),
      );
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        400,
      );
    }
  });

  return app;
}
