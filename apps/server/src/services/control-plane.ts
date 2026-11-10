import { and, desc, eq } from "drizzle-orm";
import {
  applyOutcome,
  approvePromotion,
  collectAttention,
  detectKrDrift,
  gateAction,
  rankNextWork,
  suggestHealthFromPercent,
  type AttentionItem,
  type AutonomyLedgerState,
} from "@agent-atlas/core";
import {
  agents,
  approvals,
  autonomyLedgers,
  autonomyOutcomes,
  keyResults,
  principles,
  signals,
  tasks,
  tradeoffs,
  type ApprovalStatus,
  type AtlasDb,
  type EnforcementLevel,
  type EntityKind,
  type HealthStatus,
  type TaskStatus,
} from "@agent-atlas/db";
import { ensureAgent } from "./agents.js";
import { recordEvent } from "./events.js";
import type { AtlasService } from "./atlas.js";

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export class ControlPlaneService {
  constructor(
    private db: AtlasDb,
    private workspaceId: string,
    private atlas: AtlasService,
    private staleHours: number,
  ) {}

  // --- Phase A: next work + block ---

  async getNextWork(input: {
    agentSlug: string;
    domain?: string;
    limit?: number;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    if (agent.pausedAt) {
      return {
        agent: { slug: agent.slug, paused: true },
        items: [],
        message: "Agent is paused — an operator must resume before claiming work",
      };
    }
    const domains = input.domain
      ? [input.domain]
      : parseJsonArray(agent.domainsJson);
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, this.workspaceId));
    const allKrs = await this.db
      .select()
      .from(keyResults)
      .where(eq(keyResults.workspaceId, this.workspaceId));
    const elapsed = await this.atlas.activeCycleElapsedPublic();
    const items = rankNextWork({
      cycleElapsedFraction: elapsed,
      agentDomains: domains,
      agentAutonomyCeiling: agent.autonomyCeiling,
      limit: input.limit ?? 5,
      keyResults: allKrs.map((kr) => ({
        id: kr.id,
        objectiveId: kr.objectiveId,
        kind: kr.kind,
        targetValue: Number(kr.targetValue),
        currentValue: Number(kr.currentValue),
        weight: Number(kr.weight),
        status: kr.status as HealthStatus,
        title: kr.title,
      })),
      tasks: allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status as TaskStatus,
        priority: t.priority,
        riskTier: t.riskTier,
        keyResultId: t.keyResultId,
        objectiveId: t.objectiveId,
        domain: t.domain,
        unaligned: t.unaligned,
        blockedByTaskId: t.blockedByTaskId,
        lastProgressAt: t.lastProgressAt,
        updatedAt: t.updatedAt,
      })),
    });
    return {
      agent: {
        slug: agent.slug,
        domains,
        autonomyCeiling: agent.autonomyCeiling,
      },
      items,
    };
  }

  async blockTask(input: {
    taskId: string;
    blockedByTaskId?: string | null;
    note: string;
    agentSlug: string;
  }) {
    if (!input.note.trim()) throw new Error("note is required");
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    await this.atlas.requireTaskPublic(input.taskId);
    if (input.blockedByTaskId) {
      await this.atlas.requireTaskPublic(input.blockedByTaskId);
    }
    const now = new Date();
    const updated = await this.db
      .update(tasks)
      .set({
        status: "blocked",
        blockedByTaskId: input.blockedByTaskId ?? null,
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
      eventType: "task_blocked",
      note: input.note,
      meta: { blockedByTaskId: input.blockedByTaskId ?? null },
    });
    return updated[0]!;
  }

  async unblockTask(input: {
    taskId: string;
    status?: "ready" | "in_progress";
    note: string;
    agentSlug: string;
  }) {
    if (!input.note.trim()) throw new Error("note is required");
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    await this.atlas.requireTaskPublic(input.taskId);
    const now = new Date();
    const updated = await this.db
      .update(tasks)
      .set({
        status: input.status ?? "ready",
        blockedByTaskId: null,
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
      eventType: "task_unblocked",
      note: input.note,
    });
    return updated[0]!;
  }

  // --- Phase B: approvals + digest + enriched attention ---

  async proposeAction(input: {
    title: string;
    body?: string;
    actionType: string;
    riskTier?: number;
    payloadJson?: string;
    relatedEntityKind?: EntityKind;
    relatedEntityId?: string;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const risk = input.riskTier ?? 2;
    const gate = gateAction({
      ledgerTier: await this.getLedgerTier(agent.id, input.actionType),
      agentCeiling: agent.autonomyCeiling,
      actionRiskTier: risk,
      agentPaused: !!agent.pausedAt,
    });
    if (gate.mode === "blocked") {
      throw new Error(
        `Action blocked (tier 0 / paused). Escalate to a human: ${input.title}`,
      );
    }
    if (gate.mode === "autonomous" && risk < 2) {
      // Low-risk autonomous — still record as auto-approved for audit
      const inserted = await this.db
        .insert(approvals)
        .values({
          workspaceId: this.workspaceId,
          proposerAgentId: agent.id,
          actionType: input.actionType,
          riskTier: risk,
          title: input.title,
          body: input.body ?? null,
          payloadJson: input.payloadJson ?? null,
          status: "approved",
          relatedEntityKind: input.relatedEntityKind ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          resolvedBy: "autonomy_gate",
          resolvedAt: new Date(),
          resolutionNote: "Auto-approved under autonomy tier",
        })
        .returning();
      await recordEvent(this.db, {
        workspaceId: this.workspaceId,
        agentId: agent.id,
        entityKind: "approval",
        entityId: inserted[0]!.id,
        eventType: "approval_auto",
        note: input.title,
      });
      return { approval: inserted[0]!, mode: "autonomous" as const };
    }

    const inserted = await this.db
      .insert(approvals)
      .values({
        workspaceId: this.workspaceId,
        proposerAgentId: agent.id,
        actionType: input.actionType,
        riskTier: risk,
        title: input.title,
        body: input.body ?? null,
        payloadJson: input.payloadJson ?? null,
        status: "pending",
        relatedEntityKind: input.relatedEntityKind ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "approval",
      entityId: inserted[0]!.id,
      eventType: "approval_proposed",
      note: input.title,
    });
    return { approval: inserted[0]!, mode: "propose" as const };
  }

  async listApprovals(status?: ApprovalStatus) {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(eq(approvals.workspaceId, this.workspaceId))
      .orderBy(desc(approvals.createdAt));
    return status ? rows.filter((r) => r.status === status) : rows;
  }

  async resolveApproval(input: {
    approvalId: string;
    decision: "approved" | "rejected";
    note?: string;
    resolvedBy?: string;
    agentSlug?: string;
  }) {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.id, input.approvalId),
          eq(approvals.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Approval not found");
    if (rows[0].status !== "pending") {
      throw new Error(`Approval already ${rows[0].status}`);
    }
    let agentId: string | null = null;
    if (input.agentSlug) {
      agentId = (await ensureAgent(this.db, this.workspaceId, input.agentSlug))
        .id;
    }
    const updated = await this.db
      .update(approvals)
      .set({
        status: input.decision,
        resolvedBy: input.resolvedBy ?? input.agentSlug ?? "operator",
        resolvedAt: new Date(),
        resolutionNote: input.note ?? null,
      })
      .where(eq(approvals.id, input.approvalId))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId,
      entityKind: "approval",
      entityId: input.approvalId,
      eventType: `approval_${input.decision}`,
      note: input.note ?? input.decision,
    });
    return updated[0]!;
  }

  async getAttentionEnriched(): Promise<{
    items: AttentionItem[];
    staleHours: number;
  }> {
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, this.workspaceId));
    const allKrs = await this.db
      .select()
      .from(keyResults)
      .where(eq(keyResults.workspaceId, this.workspaceId));
    const pending = await this.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, this.workspaceId),
          eq(approvals.status, "pending"),
        ),
      );
    const recentOutcomes = await this.db
      .select()
      .from(autonomyOutcomes)
      .where(
        and(
          eq(autonomyOutcomes.workspaceId, this.workspaceId),
          eq(autonomyOutcomes.demoted, true),
        ),
      )
      .orderBy(desc(autonomyOutcomes.createdAt))
      .limit(10);

    const driftItems: Array<{ id: string; title: string; reason: string }> = [];
    for (const kr of allKrs) {
      const linked = allTasks.filter((t) => t.keyResultId === kr.id);
      const done = linked.filter((t) => t.status === "done").length;
      const drift = detectKrDrift({
        keyResultId: kr.id,
        title: kr.title,
        kind: kr.kind,
        targetValue: Number(kr.targetValue),
        currentValue: Number(kr.currentValue),
        tasksDone: done,
        tasksTotal: linked.filter((t) => t.status !== "cancelled").length,
      });
      if (drift) driftItems.push(drift);
    }

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
      pendingApprovals: pending.map((a) => ({
        id: a.id,
        title: a.title,
        riskTier: a.riskTier,
      })),
      recentDemotions: recentOutcomes.map((o) => ({
        id: o.id,
        title: `${o.actionType} demoted`,
        reason: o.note ?? "Autonomy demoted after failed outcome",
      })),
      driftItems,
    });
    return { items, staleHours: this.staleHours };
  }

  async getOperatorDigest() {
    const overview = await this.atlas.getWorkspaceOverview();
    const attention = await this.getAttentionEnriched();
    const pending = attention.items.filter(
      (i) =>
        i.kind === "pending_approval" ||
        i.kind === "blocked_task" ||
        i.kind === "behind_kr" ||
        i.kind === "autonomy_demotion",
    );
    const outcomes = await this.db
      .select()
      .from(autonomyOutcomes)
      .where(eq(autonomyOutcomes.workspaceId, this.workspaceId))
      .orderBy(desc(autonomyOutcomes.createdAt))
      .limit(20);
    const recentSuccess = outcomes.filter((o) => o.success).length;
    const recentFail = outcomes.filter((o) => !o.success).length;

    return {
      generatedAt: new Date().toISOString(),
      cycle: overview.cycle
        ? { id: overview.cycle.id, name: overview.cycle.name }
        : null,
      objectives: overview.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        completionPercent: o.completionPercent,
        status: o.suggestedStatus,
        atRiskKeyResults: o.atRiskKeyResults,
      })),
      topInterventions: pending.slice(0, 5),
      attentionCount: attention.items.length,
      autonomy: {
        recentSuccess,
        recentFail,
        demotions: outcomes.filter((o) => o.demoted).length,
      },
      summary:
        pending.length === 0
          ? "All clear — no human decisions needed."
          : `${pending.length} item(s) need a decision: ${pending
              .slice(0, 3)
              .map((p) => p.title ?? p.kind)
              .join("; ")}`,
    };
  }

  async intervene(input: {
    action:
      | "approve"
      | "reject"
      | "reassign"
      | "pause_agent"
      | "resume_agent"
      | "reweight_kr";
    approvalId?: string;
    taskId?: string;
    agentSlug?: string;
    assigneeAgentSlug?: string;
    keyResultId?: string;
    weight?: number;
    note?: string;
    actor?: string;
  }) {
    switch (input.action) {
      case "approve":
      case "reject": {
        if (!input.approvalId) throw new Error("approvalId required");
        return this.resolveApproval({
          approvalId: input.approvalId,
          decision: input.action === "approve" ? "approved" : "rejected",
          note: input.note,
          resolvedBy: input.actor ?? "operator",
        });
      }
      case "reassign": {
        if (!input.taskId || !input.assigneeAgentSlug) {
          throw new Error("taskId and assigneeAgentSlug required");
        }
        const assignee = await ensureAgent(
          this.db,
          this.workspaceId,
          input.assigneeAgentSlug,
        );
        const updated = await this.db
          .update(tasks)
          .set({
            assigneeAgentId: assignee.id,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId))
          .returning();
        return updated[0]!;
      }
      case "pause_agent":
      case "resume_agent": {
        if (!input.agentSlug) throw new Error("agentSlug required");
        const agent = await ensureAgent(
          this.db,
          this.workspaceId,
          input.agentSlug,
        );
        const updated = await this.db
          .update(agents)
          .set({
            pausedAt: input.action === "pause_agent" ? new Date() : null,
          })
          .where(eq(agents.id, agent.id))
          .returning();
        return updated[0]!;
      }
      case "reweight_kr": {
        if (!input.keyResultId || input.weight == null) {
          throw new Error("keyResultId and weight required");
        }
        const updated = await this.db
          .update(keyResults)
          .set({
            weight: String(input.weight),
            updatedAt: new Date(),
          })
          .where(eq(keyResults.id, input.keyResultId))
          .returning();
        if (!updated[0]) throw new Error("Key result not found");
        return updated[0]!;
      }
      default:
        throw new Error(`Unknown intervene action`);
    }
  }

  // --- Phase C: principles, tradeoffs, signals ---

  async upsertPrinciple(input: {
    slug: string;
    name: string;
    description?: string;
    weight?: number;
    enforcement?: EnforcementLevel;
    violationAction?: string;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const existing = await this.db
      .select()
      .from(principles)
      .where(
        and(
          eq(principles.workspaceId, this.workspaceId),
          eq(principles.slug, input.slug),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const updated = await this.db
        .update(principles)
        .set({
          name: input.name,
          description: input.description ?? existing[0].description,
          weight:
            input.weight != null
              ? String(input.weight)
              : existing[0].weight,
          enforcement: input.enforcement ?? existing[0].enforcement,
          violationAction:
            input.violationAction ?? existing[0].violationAction,
          updatedAt: new Date(),
        })
        .where(eq(principles.id, existing[0].id))
        .returning();
      await recordEvent(this.db, {
        workspaceId: this.workspaceId,
        agentId: agent.id,
        entityKind: "principle",
        entityId: updated[0]!.id,
        eventType: "principle_updated",
        note: input.name,
      });
      return updated[0]!;
    }
    const inserted = await this.db
      .insert(principles)
      .values({
        workspaceId: this.workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        weight: String(input.weight ?? 1),
        enforcement: input.enforcement ?? "soft",
        violationAction: input.violationAction ?? "log_and_continue",
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "principle",
      entityId: inserted[0]!.id,
      eventType: "principle_created",
      note: input.name,
    });
    return inserted[0]!;
  }

  async listPrinciples() {
    return this.db
      .select()
      .from(principles)
      .where(eq(principles.workspaceId, this.workspaceId));
  }

  async upsertTradeoff(input: {
    slug: string;
    title: string;
    description?: string;
    rules: unknown[];
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const rulesJson = JSON.stringify(input.rules ?? []);
    const existing = await this.db
      .select()
      .from(tradeoffs)
      .where(
        and(
          eq(tradeoffs.workspaceId, this.workspaceId),
          eq(tradeoffs.slug, input.slug),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const updated = await this.db
        .update(tradeoffs)
        .set({
          title: input.title,
          description: input.description ?? existing[0].description,
          rulesJson,
          updatedAt: new Date(),
        })
        .where(eq(tradeoffs.id, existing[0].id))
        .returning();
      await recordEvent(this.db, {
        workspaceId: this.workspaceId,
        agentId: agent.id,
        entityKind: "tradeoff",
        entityId: updated[0]!.id,
        eventType: "tradeoff_updated",
        note: input.title,
      });
      return updated[0]!;
    }
    const inserted = await this.db
      .insert(tradeoffs)
      .values({
        workspaceId: this.workspaceId,
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        rulesJson,
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "tradeoff",
      entityId: inserted[0]!.id,
      eventType: "tradeoff_created",
      note: input.title,
    });
    return inserted[0]!;
  }

  async listTradeoffs() {
    return this.db
      .select()
      .from(tradeoffs)
      .where(eq(tradeoffs.workspaceId, this.workspaceId));
  }

  async registerSignal(input: {
    slug: string;
    name: string;
    keyResultId: string;
    source?: string;
    unit?: string;
    healthyMin?: number;
    healthyMax?: number;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    await this.atlas.requireKeyResultPublic(input.keyResultId);
    const existing = await this.db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, this.workspaceId),
          eq(signals.slug, input.slug),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const updated = await this.db
        .update(signals)
        .set({
          name: input.name,
          keyResultId: input.keyResultId,
          source: input.source ?? existing[0].source,
          unit: input.unit ?? existing[0].unit,
          healthyMin:
            input.healthyMin != null
              ? String(input.healthyMin)
              : existing[0].healthyMin,
          healthyMax:
            input.healthyMax != null
              ? String(input.healthyMax)
              : existing[0].healthyMax,
          updatedAt: new Date(),
        })
        .where(eq(signals.id, existing[0].id))
        .returning();
      return updated[0]!;
    }
    const inserted = await this.db
      .insert(signals)
      .values({
        workspaceId: this.workspaceId,
        slug: input.slug,
        name: input.name,
        keyResultId: input.keyResultId,
        source: input.source ?? null,
        unit: input.unit ?? "",
        healthyMin:
          input.healthyMin != null ? String(input.healthyMin) : null,
        healthyMax:
          input.healthyMax != null ? String(input.healthyMax) : null,
      })
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "signal",
      entityId: inserted[0]!.id,
      eventType: "signal_registered",
      note: input.name,
    });
    return inserted[0]!;
  }

  async ingestSignal(input: {
    slug: string;
    value: number;
    note?: string;
    agentSlug: string;
    updateKeyResult?: boolean;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const rows = await this.db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, this.workspaceId),
          eq(signals.slug, input.slug),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error(`Signal not found: ${input.slug}`);
    const now = new Date();
    const updated = await this.db
      .update(signals)
      .set({
        lastValue: String(input.value),
        lastAt: now,
        updatedAt: now,
      })
      .where(eq(signals.id, rows[0].id))
      .returning();

    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "signal",
      entityId: rows[0].id,
      eventType: "signal_ingest",
      note: input.note ?? `value=${input.value}`,
      percent: input.value,
    });

    let keyResult = null;
    if (input.updateKeyResult !== false) {
      const kr = await this.atlas.requireKeyResultPublic(rows[0].keyResultId);
      if (kr.kind !== "task_backed") {
        const target = Number(kr.targetValue) || 100;
        const percent = target === 0 ? 0 : (input.value / target) * 100;
        let status = suggestHealthFromPercent(
          percent,
          await this.atlas.activeCycleElapsedPublic(),
        );
        const min =
          rows[0].healthyMin != null ? Number(rows[0].healthyMin) : null;
        const max =
          rows[0].healthyMax != null ? Number(rows[0].healthyMax) : null;
        if (
          (min != null && input.value < min) ||
          (max != null && input.value > max)
        ) {
          status = status === "done" ? "at_risk" : "behind";
        }
        const krUpdated = await this.db
          .update(keyResults)
          .set({
            currentValue: String(input.value),
            status,
            updatedAt: now,
          })
          .where(eq(keyResults.id, kr.id))
          .returning();
        keyResult = krUpdated[0]!;
        await this.atlas.refreshObjectiveStatusPublic(kr.objectiveId);
      }
    }

    return { signal: updated[0]!, keyResult };
  }

  async listSignals() {
    return this.db
      .select()
      .from(signals)
      .where(eq(signals.workspaceId, this.workspaceId));
  }

  async getIntentContext() {
    const [prin, trades, sigs] = await Promise.all([
      this.listPrinciples(),
      this.listTradeoffs(),
      this.listSignals(),
    ]);
    return {
      principles: prin,
      tradeoffs: trades.map((t) => ({
        ...t,
        rules: (() => {
          try {
            return JSON.parse(t.rulesJson) as unknown;
          } catch {
            return [];
          }
        })(),
      })),
      signals: sigs,
    };
  }

  // --- Phase D: autonomy ledger ---

  async updateAgentProfile(input: {
    agentSlug: string;
    domains?: string[];
    capabilities?: string[];
    autonomyCeiling?: number;
    name?: string;
    modelHint?: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const updated = await this.db
      .update(agents)
      .set({
        name: input.name ?? agent.name,
        modelHint:
          input.modelHint !== undefined ? input.modelHint : agent.modelHint,
        domainsJson:
          input.domains != null
            ? JSON.stringify(input.domains)
            : agent.domainsJson,
        capabilitiesJson:
          input.capabilities != null
            ? JSON.stringify(input.capabilities)
            : agent.capabilitiesJson,
        autonomyCeiling:
          input.autonomyCeiling != null
            ? Math.max(0, Math.min(3, input.autonomyCeiling))
            : agent.autonomyCeiling,
      })
      .where(eq(agents.id, agent.id))
      .returning();
    return updated[0]!;
  }

  private async getOrCreateLedger(
    agentId: string,
    actionType: string,
  ): Promise<typeof autonomyLedgers.$inferSelect> {
    const existing = await this.db
      .select()
      .from(autonomyLedgers)
      .where(
        and(
          eq(autonomyLedgers.workspaceId, this.workspaceId),
          eq(autonomyLedgers.agentId, agentId),
          eq(autonomyLedgers.actionType, actionType),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const inserted = await this.db
      .insert(autonomyLedgers)
      .values({
        workspaceId: this.workspaceId,
        agentId,
        actionType,
        tier: 1,
      })
      .returning();
    return inserted[0]!;
  }

  private async getLedgerTier(
    agentId: string,
    actionType: string,
  ): Promise<number> {
    const row = await this.getOrCreateLedger(agentId, actionType);
    return row.tier;
  }

  async recordOutcome(input: {
    actionType: string;
    success: boolean;
    note?: string;
    evidenceUrl?: string;
    taskId?: string;
    agentSlug: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const row = await this.getOrCreateLedger(agent.id, input.actionType);
    const state: AutonomyLedgerState = {
      actionType: row.actionType,
      tier: row.tier,
      samples: row.samples,
      successes: row.successes,
      failures: row.failures,
      pendingPromotionTier: row.pendingPromotionTier,
    };
    const result = applyOutcome(state, input.success);
    const updated = await this.db
      .update(autonomyLedgers)
      .set({
        tier: result.ledger.tier,
        samples: result.ledger.samples,
        successes: result.ledger.successes,
        failures: result.ledger.failures,
        pendingPromotionTier: result.ledger.pendingPromotionTier,
        updatedAt: new Date(),
      })
      .where(eq(autonomyLedgers.id, row.id))
      .returning();

    const outcome = await this.db
      .insert(autonomyOutcomes)
      .values({
        workspaceId: this.workspaceId,
        agentId: agent.id,
        actionType: input.actionType,
        success: input.success,
        note: input.note ?? null,
        evidenceUrl: input.evidenceUrl ?? null,
        taskId: input.taskId ?? null,
        demoted: result.demoted,
      })
      .returning();

    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: input.taskId ?? row.id,
      eventType: result.demoted
        ? "autonomy_demoted"
        : result.promotionProposed
          ? "autonomy_promotion_proposed"
          : "autonomy_outcome",
      note:
        input.note ??
        (input.success ? "success" : "failure") +
          (result.demoted ? " (demoted)" : ""),
      evidenceUrl: input.evidenceUrl ?? null,
      meta: {
        actionType: input.actionType,
        tier: result.ledger.tier,
        promotionProposed: result.promotionProposed,
      },
    });

    return {
      ledger: updated[0]!,
      outcome: outcome[0]!,
      demoted: result.demoted,
      promotionProposed: result.promotionProposed,
    };
  }

  async listAutonomyLedgers(agentSlug?: string) {
    let agentId: string | undefined;
    if (agentSlug) {
      agentId = (await ensureAgent(this.db, this.workspaceId, agentSlug)).id;
    }
    const rows = await this.db
      .select()
      .from(autonomyLedgers)
      .where(eq(autonomyLedgers.workspaceId, this.workspaceId));
    return agentId ? rows.filter((r) => r.agentId === agentId) : rows;
  }

  async resolveAutonomyPromotion(input: {
    agentSlug: string;
    actionType: string;
    decision: "approve" | "reject";
    actor?: string;
  }) {
    const agent = await ensureAgent(this.db, this.workspaceId, input.agentSlug);
    const row = await this.getOrCreateLedger(agent.id, input.actionType);
    if (row.pendingPromotionTier == null) {
      throw new Error("No pending promotion for this action type");
    }
    if (input.decision === "reject") {
      const updated = await this.db
        .update(autonomyLedgers)
        .set({ pendingPromotionTier: null, updatedAt: new Date() })
        .where(eq(autonomyLedgers.id, row.id))
        .returning();
      return updated[0]!;
    }
    const next = approvePromotion({
      actionType: row.actionType,
      tier: row.tier,
      samples: row.samples,
      successes: row.successes,
      failures: row.failures,
      pendingPromotionTier: row.pendingPromotionTier,
    });
    const updated = await this.db
      .update(autonomyLedgers)
      .set({
        tier: next.tier,
        pendingPromotionTier: null,
        updatedAt: new Date(),
      })
      .where(eq(autonomyLedgers.id, row.id))
      .returning();
    await recordEvent(this.db, {
      workspaceId: this.workspaceId,
      agentId: agent.id,
      entityKind: "task",
      entityId: row.id,
      eventType: "autonomy_promoted",
      note: `Promoted ${input.actionType} → T${next.tier} by ${input.actor ?? "operator"}`,
    });
    return updated[0]!;
  }
}
