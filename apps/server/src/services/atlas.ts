import { and, desc, eq, sql } from "drizzle-orm";
import {
  collectAttention,
  cycleElapsedFraction,
  isTaskStale,
  rollupKeyResult,
  rollupObjective,
  suggestHealthFromPercent,
  type AttentionItem,
} from "@agent-atlas/core";
import {
  comments,
  cycles,
  keyResults,
  objectives,
  progressEvents,
  projects,
  tasks,
  workspaces,
  type AtlasDb,
  type EntityKind,
  type HealthStatus,
  type TaskStatus,
} from "@agent-atlas/db";
import { ensureAgent, getAgentBySlug, listAgents } from "./agents.js";
import { recordEvent } from "./events.js";

export class AtlasService {
  constructor(
    private db: AtlasDb,
    private workspaceId: string,
    private staleHours: number,
  ) {}

  async whoami(agentSlug: string) {
    const agent = await ensureAgent(this.db, this.workspaceId, agentSlug);
    const ws = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, this.workspaceId))
      .limit(1);
    return { workspace: ws[0], agent };
  }

  async listAgents() {
    return listAgents(this.db, this.workspaceId);
  }

  async upsertCycle(input: {
    id?: string;
    name: string;
    startsAt: string;
    endsAt: string;
    isActive?: boolean;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    if (input.isActive) {
      await this.db
        .update(cycles)
        .set({ isActive: false })
        .where(eq(cycles.workspaceId, this.workspaceId));
    }

    if (input.id) {
      const updated = await this.db
        .update(cycles)
        .set({
          name: input.name,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          isActive: input.isActive ?? false,
        })
        .where(
          and(
            eq(cycles.id, input.id),
            eq(cycles.workspaceId, this.workspaceId),
          ),
        )
        .returning();
      if (!updated[0]) throw new Error("Cycle not found");
      await recordEvent(this.db, {
        workspaceId: this.workspaceId,
        agentId: agent.id,
        entityKind: "cycle",
        entityId: updated[0].id,
        eventType: "cycle_updated",
        note: `Updated cycle ${input.name}`,
      });
      return updated[0];
    }

    const inserted = await this.db
      .insert(cycles)
      .values({
        workspaceId: this.workspaceId,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        isActive: input.isActive ?? false,
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "cycle",
      entityId: inserted[0]!.id,
      eventType: "cycle_created",
      note: `Created cycle ${input.name}`,
    });
    return inserted[0]!;
  }

  async createObjective(input: {
    title: string;
    description?: string;
    cycleId?: string;
    ownerAgentSlug?: string;
    status?: HealthStatus;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    let ownerId: string | null = null;
    if (input.ownerAgentSlug) {
      const owner = await ensureAgent(
        this.db,
        this.workspaceId,
        input.ownerAgentSlug,
      );
      ownerId = owner.id;
    }
    const inserted = await this.db
      .insert(objectives)
      .values({
        workspaceId: this.workspaceId,
        title: input.title,
        description: input.description ?? null,
        cycleId: input.cycleId ?? null,
        ownerAgentId: ownerId,
        status: input.status ?? "on_track",
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "objective",
      entityId: inserted[0]!.id,
      eventType: "objective_created",
      note: input.title,
    });
    return inserted[0]!;
  }

  async createKeyResult(input: {
    objectiveId: string;
    title: string;
    description?: string;
    kind?: "numeric" | "task_backed";
    unit?: string;
    targetValue?: number;
    currentValue?: number;
    weight?: number;
    status?: HealthStatus;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    await this.requireObjective(input.objectiveId);
    const inserted = await this.db
      .insert(keyResults)
      .values({
        workspaceId: this.workspaceId,
        objectiveId: input.objectiveId,
        title: input.title,
        description: input.description ?? null,
        kind: input.kind ?? "numeric",
        unit: input.unit ?? "%",
        targetValue: String(input.targetValue ?? 100),
        currentValue: String(input.currentValue ?? 0),
        weight: String(input.weight ?? 1),
        status: input.status ?? "on_track",
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "key_result",
      entityId: inserted[0]!.id,
      eventType: "key_result_created",
      note: input.title,
    });
    return inserted[0]!;
  }

  async createProject(input: {
    title: string;
    description?: string;
    objectiveId?: string;
    status?: HealthStatus;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    if (input.objectiveId) await this.requireObjective(input.objectiveId);
    const inserted = await this.db
      .insert(projects)
      .values({
        workspaceId: this.workspaceId,
        title: input.title,
        description: input.description ?? null,
        objectiveId: input.objectiveId ?? null,
        status: input.status ?? "on_track",
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "project",
      entityId: inserted[0]!.id,
      eventType: "project_created",
      note: input.title,
    });
    return inserted[0]!;
  }

  async createTask(input: {
    title: string;
    description?: string;
    objectiveId?: string;
    keyResultId?: string;
    projectId?: string;
    priority?: number;
    status?: TaskStatus;
    assigneeAgentSlug?: string;
    unaligned?: boolean;
    riskTier?: number;
    domain?: string;
    blockedByTaskId?: string;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const unaligned = input.unaligned === true;
    if (!input.keyResultId && !unaligned) {
      throw new Error(
        "key_result_id is required (or set unaligned=true to flag busywork)",
      );
    }
    if (input.objectiveId) await this.requireObjective(input.objectiveId);
    if (input.keyResultId) await this.requireKeyResult(input.keyResultId);
    if (input.blockedByTaskId) await this.requireTask(input.blockedByTaskId);
    let assigneeId: string | null = null;
    if (input.assigneeAgentSlug) {
      assigneeId = (
        await ensureAgent(this.db, this.workspaceId, input.assigneeAgentSlug)
      ).id;
    }
    let objectiveId = input.objectiveId ?? null;
    if (!objectiveId && input.keyResultId) {
      const kr = await this.requireKeyResult(input.keyResultId);
      objectiveId = kr.objectiveId;
    }
    const inserted = await this.db
      .insert(tasks)
      .values({
        workspaceId: this.workspaceId,
        title: input.title,
        description: input.description ?? null,
        objectiveId,
        keyResultId: input.keyResultId ?? null,
        projectId: input.projectId ?? null,
        priority: input.priority ?? 2,
        status: input.status ?? "backlog",
        assigneeAgentId: assigneeId,
        unaligned,
        riskTier: input.riskTier ?? 1,
        domain: input.domain ?? null,
        blockedByTaskId: input.blockedByTaskId ?? null,
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: inserted[0]!.id,
      eventType: "task_created",
      note: input.title,
      meta: { unaligned },
    });
    if (input.keyResultId) {
      await this.refreshTaskBackedKr(input.keyResultId, agent.id);
    }
    return inserted[0]!;
  }

  async linkTask(input: {
    taskId: string;
    objectiveId?: string | null;
    keyResultId?: string | null;
    projectId?: string | null;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const existing = await this.requireTask(input.taskId);
    const updated = await this.db
      .update(tasks)
      .set({
        objectiveId:
          input.objectiveId === undefined
            ? existing.objectiveId
            : input.objectiveId,
        keyResultId:
          input.keyResultId === undefined
            ? existing.keyResultId
            : input.keyResultId,
        projectId:
          input.projectId === undefined ? existing.projectId : input.projectId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: input.taskId,
      eventType: "task_linked",
      note: "Updated task links",
      meta: {
        objectiveId: updated[0]!.objectiveId,
        keyResultId: updated[0]!.keyResultId,
        projectId: updated[0]!.projectId,
      },
    });
    const krIds = [existing.keyResultId, updated[0]!.keyResultId].filter(
      Boolean,
    ) as string[];
    for (const krId of new Set(krIds)) {
      await this.refreshTaskBackedKr(krId, agent.id);
    }
    return updated[0]!;
  }

  async claimTask(input: { taskId: string; agentSlug: string }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const task = await this.requireTask(input.taskId);
    if (
      task.assigneeAgentId &&
      task.assigneeAgentId !== agent.id &&
      task.status === "in_progress"
    ) {
      throw new Error("Task already claimed by another agent");
    }
    const now = new Date();
    const updated = await this.db
      .update(tasks)
      .set({
        assigneeAgentId: agent.id,
        status: task.status === "backlog" || task.status === "ready"
          ? "in_progress"
          : task.status,
        lastProgressAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, input.taskId))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: input.taskId,
      eventType: "task_claimed",
      note: `${input.agentSlug} claimed task`,
    });
    return updated[0]!;
  }

  async releaseTask(input: { taskId: string; agentSlug: string }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    await this.requireTask(input.taskId);
    const updated = await this.db
      .update(tasks)
      .set({
        assigneeAgentId: null,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: input.taskId,
      eventType: "task_released",
      note: `${input.agentSlug} released task`,
    });
    return updated[0]!;
  }

  async updateTaskStatus(input: {
    taskId: string;
    status: TaskStatus;
    note?: string;
    evidenceUrl?: string;
    agentSlug: string;
  }) {
    if (
      (input.status === "in_progress" || input.status === "done") &&
      !input.note?.trim()
    ) {
      throw new Error("note is required when moving to in_progress or done");
    }
    if (input.status === "done" && !input.evidenceUrl?.trim()) {
      throw new Error(
        "evidence_url is required when marking done (PR, link, screenshot, or artifact)",
      );
    }
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    if (agent.pausedAt) {
      throw new Error("Agent is paused — cannot update task status");
    }
    const task = await this.requireTask(input.taskId);
    if (
      input.status === "in_progress" &&
      task.blockedByTaskId &&
      task.status === "blocked"
    ) {
      throw new Error("Unblock the task before moving to in_progress");
    }
    const now = new Date();
    const updated = await this.db
      .update(tasks)
      .set({
        status: input.status,
        lastProgressAt: now,
        updatedAt: now,
        blockedByTaskId:
          input.status === "done" || input.status === "ready"
            ? null
            : task.blockedByTaskId,
      })
      .where(eq(tasks.id, input.taskId))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: input.taskId,
      eventType: "task_status",
      note: input.note ?? `Status → ${input.status}`,
      evidenceUrl: input.evidenceUrl ?? null,
      meta: { from: task.status, to: input.status },
    });
    if (task.keyResultId) {
      await this.refreshTaskBackedKr(task.keyResultId, agent.id);
    }
    return updated[0]!;
  }

  async postProgress(input: {
    taskId: string;
    note: string;
    percent?: number;
    evidenceUrl?: string;
    agentSlug: string;
  }) {
    if (!input.note.trim()) throw new Error("note is required");
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    await this.requireTask(input.taskId);
    const now = new Date();
    await this.db
      .update(tasks)
      .set({ lastProgressAt: now, updatedAt: now })
      .where(eq(tasks.id, input.taskId));
    return recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: input.taskId,
      eventType: "progress",
      note: input.note,
      percent: input.percent ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
    });
  }

  async setKeyResultValue(input: {
    keyResultId: string;
    currentValue: number;
    status?: HealthStatus;
    note?: string;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const kr = await this.requireKeyResult(input.keyResultId);
    if (kr.kind === "task_backed") {
      throw new Error(
        "task_backed key results are derived from linked tasks; use update_task_status instead",
      );
    }
    const target = Number(kr.targetValue) || 100;
    const percent = target === 0 ? 0 : (input.currentValue / target) * 100;
    const status =
      input.status ??
      suggestHealthFromPercent(percent, await this.activeCycleElapsed());
    const updated = await this.db
      .update(keyResults)
      .set({
        currentValue: String(input.currentValue),
        status,
        updatedAt: new Date(),
      })
      .where(eq(keyResults.id, input.keyResultId))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "key_result",
      entityId: input.keyResultId,
      eventType: "kr_value_set",
      note: input.note ?? `Set current to ${input.currentValue}`,
      percent,
    });
    await this.refreshObjectiveStatus(kr.objectiveId);
    return updated[0]!;
  }

  async addComment(input: {
    entityKind: EntityKind;
    entityId: string;
    body: string;
    agentSlug?: string;
    authorLabel?: string;
  }) {
    let agentId: string | null = null;
    if (input.agentSlug) {
      agentId = (await ensureAgent(this.db, this.workspaceId, input.agentSlug))
        .id;
    }
    const inserted = await this.db
      .insert(comments)
      .values({
        workspaceId: this.workspaceId,
        agentId,
        authorLabel: input.authorLabel ?? input.agentSlug ?? "human",
        entityKind: input.entityKind,
        entityId: input.entityId,
        body: input.body,
      })
      .returning();
    return inserted[0]!;
  }

  async acknowledgeAttention(taskId: string) {
    await this.requireTask(taskId);
    const updated = await this.db
      .update(tasks)
      .set({ attentionAcknowledgedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated[0]!;
  }

  async listTasks(filters: {
    status?: TaskStatus;
    assigneeAgentSlug?: string;
    cycleId?: string;
    staleOnly?: boolean;
    objectiveId?: string;
  }) {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, this.workspaceId))
      .orderBy(desc(tasks.updatedAt));

    let assigneeId: string | null = null;
    if (filters.assigneeAgentSlug) {
      const a = await getAgentBySlug(
        this.db,
        this.workspaceId,
        filters.assigneeAgentSlug,
      );
      assigneeId = a?.id ?? "__none__";
    }

    let objectiveIds: Set<string> | null = null;
    if (filters.cycleId) {
      const objs = await this.db
        .select({ id: objectives.id })
        .from(objectives)
        .where(
          and(
            eq(objectives.workspaceId, this.workspaceId),
            eq(objectives.cycleId, filters.cycleId),
          ),
        );
      objectiveIds = new Set(objs.map((o) => o.id));
    }

    const now = new Date();
    return rows.filter((t) => {
      if (filters.status && t.status !== filters.status) return false;
      if (assigneeId && t.assigneeAgentId !== assigneeId) return false;
      if (filters.objectiveId && t.objectiveId !== filters.objectiveId)
        return false;
      if (objectiveIds && (!t.objectiveId || !objectiveIds.has(t.objectiveId)))
        return false;
      if (filters.staleOnly) {
        return isTaskStale(
          {
            id: t.id,
            status: t.status as TaskStatus,
            keyResultId: t.keyResultId,
            lastProgressAt: t.lastProgressAt,
            updatedAt: t.updatedAt,
          },
          now,
          this.staleHours,
        );
      }
      return true;
    });
  }

  async getTask(taskId: string) {
    const task = await this.requireTask(taskId);
    const events = await this.db
      .select()
      .from(progressEvents)
      .where(
        and(
          eq(progressEvents.workspaceId, this.workspaceId),
          eq(progressEvents.entityKind, "task"),
          eq(progressEvents.entityId, taskId),
        ),
      )
      .orderBy(desc(progressEvents.createdAt))
      .limit(50);
    const taskComments = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.workspaceId, this.workspaceId),
          eq(comments.entityKind, "task"),
          eq(comments.entityId, taskId),
        ),
      )
      .orderBy(desc(comments.createdAt))
      .limit(50);
    return { task, events, comments: taskComments };
  }

  async getObjective(objectiveId: string) {
    const objective = await this.requireObjective(objectiveId);
    const krs = await this.db
      .select()
      .from(keyResults)
      .where(
        and(
          eq(keyResults.workspaceId, this.workspaceId),
          eq(keyResults.objectiveId, objectiveId),
        ),
      );
    const linkedTasks = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, this.workspaceId),
          eq(tasks.objectiveId, objectiveId),
        ),
      );
    const projs = await this.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, this.workspaceId),
          eq(projects.objectiveId, objectiveId),
        ),
      );
    const events = await this.db
      .select()
      .from(progressEvents)
      .where(
        and(
          eq(progressEvents.workspaceId, this.workspaceId),
          eq(progressEvents.entityKind, "objective"),
          eq(progressEvents.entityId, objectiveId),
        ),
      )
      .orderBy(desc(progressEvents.createdAt))
      .limit(30);

    const tasksByKr = new Map<string, typeof linkedTasks>();
    for (const t of linkedTasks) {
      if (!t.keyResultId) continue;
      const list = tasksByKr.get(t.keyResultId) ?? [];
      list.push(t);
      tasksByKr.set(t.keyResultId, list);
    }

    const krRollups = krs.map((kr) =>
      rollupKeyResult(
        {
          id: kr.id,
          objectiveId: kr.objectiveId,
          kind: kr.kind,
          targetValue: Number(kr.targetValue),
          currentValue: Number(kr.currentValue),
          weight: Number(kr.weight),
          status: kr.status as HealthStatus,
        },
        (tasksByKr.get(kr.id) ?? []).map((t) => ({
          id: t.id,
          status: t.status as TaskStatus,
          keyResultId: t.keyResultId,
          lastProgressAt: t.lastProgressAt,
          updatedAt: t.updatedAt,
        })),
      ),
    );

    const objRollup = rollupObjective(
      objectiveId,
      krs.map((kr) => ({
        id: kr.id,
        objectiveId: kr.objectiveId,
        kind: kr.kind,
        targetValue: Number(kr.targetValue),
        currentValue: Number(kr.currentValue),
        weight: Number(kr.weight),
        status: kr.status as HealthStatus,
      })),
      new Map(
        [...tasksByKr.entries()].map(([id, ts]) => [
          id,
          ts.map((t) => ({
            id: t.id,
            status: t.status as TaskStatus,
            keyResultId: t.keyResultId,
            lastProgressAt: t.lastProgressAt,
            updatedAt: t.updatedAt,
          })),
        ]),
      ),
      await this.activeCycleElapsed(),
    );

    return {
      objective,
      keyResults: krs,
      projects: projs,
      tasks: linkedTasks,
      events,
      rollup: objRollup,
      keyResultRollups: krRollups,
    };
  }

  async getWorkspaceOverview() {
    const ws = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, this.workspaceId))
      .limit(1);
    const activeCycle = await this.getActiveCycle();
    const objs = await this.db
      .select()
      .from(objectives)
      .where(
        and(
          eq(objectives.workspaceId, this.workspaceId),
          activeCycle
            ? eq(objectives.cycleId, activeCycle.id)
            : sql`true`,
        ),
      );
    const allKrs = await this.db
      .select()
      .from(keyResults)
      .where(eq(keyResults.workspaceId, this.workspaceId));
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, this.workspaceId));

    const elapsed = await this.activeCycleElapsed();
    const objectiveSummaries = [];
    for (const obj of objs) {
      const krs = allKrs.filter((k) => k.objectiveId === obj.id);
      const objTasks = allTasks.filter((t) => t.objectiveId === obj.id);
      const tasksByKr = new Map<
        string,
        Array<{
          id: string;
          status: TaskStatus;
          keyResultId: string | null;
          lastProgressAt: Date | null;
          updatedAt: Date;
        }>
      >();
      for (const t of objTasks) {
        if (!t.keyResultId) continue;
        const list = tasksByKr.get(t.keyResultId) ?? [];
        list.push({
          id: t.id,
          status: t.status as TaskStatus,
          keyResultId: t.keyResultId,
          lastProgressAt: t.lastProgressAt,
          updatedAt: t.updatedAt,
        });
        tasksByKr.set(t.keyResultId, list);
      }
      const rollup = rollupObjective(
        obj.id,
        krs.map((kr) => ({
          id: kr.id,
          objectiveId: kr.objectiveId,
          kind: kr.kind,
          targetValue: Number(kr.targetValue),
          currentValue: Number(kr.currentValue),
          weight: Number(kr.weight),
          status: kr.status as HealthStatus,
        })),
        tasksByKr,
        elapsed,
      );
      objectiveSummaries.push({
        ...obj,
        completionPercent: rollup.completionPercent,
        suggestedStatus: rollup.suggestedStatus,
        keyResultCount: rollup.keyResultCount,
        taskCount: objTasks.length,
        atRiskKeyResults: krs.filter(
          (k) => k.status === "at_risk" || k.status === "behind",
        ).length,
      });
    }

    return {
      workspace: ws[0],
      cycle: activeCycle,
      objectives: objectiveSummaries,
      staleHours: this.staleHours,
    };
  }

  async getAttention(): Promise<{
    items: AttentionItem[];
    staleHours: number;
  }> {
    // Prefer enriched attention when control plane is attached (see createServices).
    if (this.controlPlane) {
      return this.controlPlane.getAttentionEnriched();
    }
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, this.workspaceId));
    const allKrs = await this.db
      .select()
      .from(keyResults)
      .where(eq(keyResults.workspaceId, this.workspaceId));
    const items = collectAttention({
      now: new Date(),
      staleHours: this.staleHours,
      tasks: allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status as TaskStatus,
        keyResultId: t.keyResultId,
        lastProgressAt: t.lastProgressAt,
        updatedAt: t.updatedAt,
        attentionAcknowledgedAt: t.attentionAcknowledgedAt,
        unaligned: t.unaligned,
        blockedByTaskId: t.blockedByTaskId,
      })),
      keyResults: allKrs.map((kr) => ({
        id: kr.id,
        title: kr.title,
        objectiveId: kr.objectiveId,
        kind: kr.kind,
        targetValue: Number(kr.targetValue),
        currentValue: Number(kr.currentValue),
        weight: Number(kr.weight),
        status: kr.status as HealthStatus,
      })),
    });
    return { items, staleHours: this.staleHours };
  }

  /** Optional back-reference set by bootstrap so getAttention can enrich. */
  controlPlane: import("./control-plane.js").ControlPlaneService | null = null;

  async getAgentsSummary() {
    const agentRows = await listAgents(this.db, this.workspaceId);
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, this.workspaceId));
    return agentRows.map((a) => {
      const mine = allTasks.filter((t) => t.assigneeAgentId === a.id);
      return {
        ...a,
        openTasks: mine.filter(
          (t) =>
            t.status !== "done" &&
            t.status !== "cancelled" &&
            t.status !== "backlog",
        ).length,
        doneTasks: mine.filter((t) => t.status === "done").length,
        inProgress: mine.filter((t) => t.status === "in_progress").length,
      };
    });
  }

  async listCycles() {
    return this.db
      .select()
      .from(cycles)
      .where(eq(cycles.workspaceId, this.workspaceId))
      .orderBy(desc(cycles.startsAt));
  }

  async getConnectInfo(publicBaseUrl: string) {
    return {
      mcpUrl: `${publicBaseUrl}/mcp`,
      healthUrl: `${publicBaseUrl}/api/health`,
      auth: "Authorization: Bearer atlas_local",
      tip: "Local: node bin/atlas-mcp.mjs (stdio, no key). HTTP: Bearer atlas_local. Pass agent_slug=grok on mutating tools.",
    };
  }

  // --- helpers (public wrappers for ControlPlaneService) ---

  async activeCycleElapsedPublic(): Promise<number> {
    return this.activeCycleElapsed();
  }

  async requireTaskPublic(id: string) {
    return this.requireTask(id);
  }

  async requireKeyResultPublic(id: string) {
    return this.requireKeyResult(id);
  }

  async refreshObjectiveStatusPublic(objectiveId: string) {
    return this.refreshObjectiveStatus(objectiveId);
  }

  private async getActiveCycle() {
    const rows = await this.db
      .select()
      .from(cycles)
      .where(
        and(
          eq(cycles.workspaceId, this.workspaceId),
          eq(cycles.isActive, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private async activeCycleElapsed(): Promise<number> {
    const cycle = await this.getActiveCycle();
    if (!cycle) return 0.5;
    return cycleElapsedFraction(cycle.startsAt, cycle.endsAt, new Date());
  }

  private async requireObjective(id: string) {
    const rows = await this.db
      .select()
      .from(objectives)
      .where(
        and(
          eq(objectives.id, id),
          eq(objectives.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Objective not found");
    return rows[0];
  }

  private async requireKeyResult(id: string) {
    const rows = await this.db
      .select()
      .from(keyResults)
      .where(
        and(
          eq(keyResults.id, id),
          eq(keyResults.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Key result not found");
    return rows[0];
  }

  private async requireTask(id: string) {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, this.workspaceId)))
      .limit(1);
    if (!rows[0]) throw new Error("Task not found");
    return rows[0];
  }

  private async refreshTaskBackedKr(keyResultId: string, agentId: string) {
    const kr = await this.requireKeyResult(keyResultId);
    if (kr.kind !== "task_backed") return;
    const linked = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, this.workspaceId),
          eq(tasks.keyResultId, keyResultId),
        ),
      );
    const rollup = rollupKeyResult(
      {
        id: kr.id,
        objectiveId: kr.objectiveId,
        kind: kr.kind,
        targetValue: Number(kr.targetValue),
        currentValue: Number(kr.currentValue),
        weight: Number(kr.weight),
        status: kr.status as HealthStatus,
      },
      linked.map((t) => ({
        id: t.id,
        status: t.status as TaskStatus,
        keyResultId: t.keyResultId,
        lastProgressAt: t.lastProgressAt,
        updatedAt: t.updatedAt,
      })),
    );
    const status = suggestHealthFromPercent(
      rollup.completionPercent,
      await this.activeCycleElapsed(),
    );
    await this.db
      .update(keyResults)
      .set({
        currentValue: String(rollup.currentValue),
        status,
        updatedAt: new Date(),
      })
      .where(eq(keyResults.id, keyResultId));
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId,
      entityKind: "key_result",
      entityId: keyResultId,
      eventType: "kr_task_rollup",
      percent: rollup.completionPercent,
      note: `Task-backed rollup → ${rollup.completionPercent.toFixed(1)}%`,
    });
    await this.refreshObjectiveStatus(kr.objectiveId);
  }

  private async refreshObjectiveStatus(objectiveId: string) {
    const detail = await this.getObjective(objectiveId);
    await this.db
      .update(objectives)
      .set({
        status: detail.rollup.suggestedStatus,
        updatedAt: new Date(),
      })
      .where(eq(objectives.id, objectiveId));
  }
}
