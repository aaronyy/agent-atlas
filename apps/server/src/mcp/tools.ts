import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtlasService } from "../services/atlas.js";
import type { ControlPlaneService } from "../services/control-plane.js";

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

const healthStatus = z.enum([
  "on_track",
  "at_risk",
  "behind",
  "done",
  "dropped",
]);
const taskStatus = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
const entityKind = z.enum([
  "objective",
  "key_result",
  "project",
  "task",
  "cycle",
  "principle",
  "tradeoff",
  "approval",
  "signal",
]);

export function registerAtlasTools(
  server: McpServer,
  atlas: AtlasService,
  control: ControlPlaneService,
) {
  server.tool(
    "whoami",
    "Return workspace and the agent identity for agent_slug",
    { agent_slug: z.string().default("grok") },
    async ({ agent_slug }) => run(() => atlas.whoami(agent_slug)),
  );

  server.tool(
    "list_agents",
    "List agents in the workspace",
    {},
    async () => run(() => atlas.listAgents()),
  );

  server.tool(
    "get_workspace_overview",
    "Active cycle, objectives with completion % and at-risk KR counts",
    {},
    async () => run(() => atlas.getWorkspaceOverview()),
  );

  server.tool(
    "get_attention",
    "Stale tasks, blocked tasks, and behind/at-risk key results",
    {},
    async () => run(() => atlas.getAttention()),
  );

  server.tool(
    "upsert_cycle",
    "Create or update a planning cycle (quarter/sprint)",
    {
      id: z.string().uuid().optional(),
      name: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      is_active: z.boolean().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.upsertCycle({
          id: args.id,
          name: args.name,
          startsAt: args.starts_at,
          endsAt: args.ends_at,
          isActive: args.is_active,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "create_objective",
    "Create an OKR objective",
    {
      title: z.string(),
      description: z.string().optional(),
      cycle_id: z.string().uuid().optional(),
      owner_agent_slug: z.string().optional(),
      status: healthStatus.optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.createObjective({
          title: args.title,
          description: args.description,
          cycleId: args.cycle_id,
          ownerAgentSlug: args.owner_agent_slug,
          status: args.status,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "create_key_result",
    "Create a measurable key result under an objective",
    {
      objective_id: z.string().uuid(),
      title: z.string(),
      description: z.string().optional(),
      kind: z.enum(["numeric", "task_backed"]).optional(),
      unit: z.string().optional(),
      target_value: z.number().optional(),
      current_value: z.number().optional(),
      weight: z.number().optional(),
      status: healthStatus.optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.createKeyResult({
          objectiveId: args.objective_id,
          title: args.title,
          description: args.description,
          kind: args.kind,
          unit: args.unit,
          targetValue: args.target_value,
          currentValue: args.current_value,
          weight: args.weight,
          status: args.status,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "create_project",
    "Create a project optionally under an objective",
    {
      title: z.string(),
      description: z.string().optional(),
      objective_id: z.string().uuid().optional(),
      status: healthStatus.optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.createProject({
          title: args.title,
          description: args.description,
          objectiveId: args.objective_id,
          status: args.status,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "create_task",
    "Create a task. Requires key_result_id unless unaligned=true (busywork flag).",
    {
      title: z.string(),
      description: z.string().optional(),
      objective_id: z.string().uuid().optional(),
      key_result_id: z.string().uuid().optional(),
      project_id: z.string().uuid().optional(),
      priority: z.number().int().min(0).max(4).optional(),
      status: taskStatus.optional(),
      assignee_agent_slug: z.string().optional(),
      unaligned: z.boolean().optional(),
      risk_tier: z.number().int().min(0).max(3).optional(),
      domain: z.string().optional(),
      blocked_by_task_id: z.string().uuid().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.createTask({
          title: args.title,
          description: args.description,
          objectiveId: args.objective_id,
          keyResultId: args.key_result_id,
          projectId: args.project_id,
          priority: args.priority,
          status: args.status,
          assigneeAgentSlug: args.assignee_agent_slug,
          unaligned: args.unaligned,
          riskTier: args.risk_tier,
          domain: args.domain,
          blockedByTaskId: args.blocked_by_task_id,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "link_task",
    "Attach a task to objective / key result / project",
    {
      task_id: z.string().uuid(),
      objective_id: z.string().uuid().nullable().optional(),
      key_result_id: z.string().uuid().nullable().optional(),
      project_id: z.string().uuid().nullable().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.linkTask({
          taskId: args.task_id,
          objectiveId: args.objective_id,
          keyResultId: args.key_result_id,
          projectId: args.project_id,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "claim_task",
    "Claim a task as the given agent (moves backlog/ready → in_progress)",
    {
      task_id: z.string().uuid(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.claimTask({ taskId: args.task_id, agentSlug: args.agent_slug }),
      ),
  );

  server.tool(
    "release_task",
    "Release a claimed task back to ready",
    {
      task_id: z.string().uuid(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.releaseTask({ taskId: args.task_id, agentSlug: args.agent_slug }),
      ),
  );

  server.tool(
    "update_task_status",
    "Update task status. note required for in_progress/done; evidence_url required for done.",
    {
      task_id: z.string().uuid(),
      status: taskStatus,
      note: z.string().optional(),
      evidence_url: z.string().url().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.updateTaskStatus({
          taskId: args.task_id,
          status: args.status,
          note: args.note,
          evidenceUrl: args.evidence_url,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "post_progress",
    "Post a progress note on a task (keeps it from going stale)",
    {
      task_id: z.string().uuid(),
      note: z.string(),
      percent: z.number().optional(),
      evidence_url: z.string().url().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.postProgress({
          taskId: args.task_id,
          note: args.note,
          percent: args.percent,
          evidenceUrl: args.evidence_url,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "set_key_result_value",
    "Set numeric key result current value (not for task_backed KRs)",
    {
      key_result_id: z.string().uuid(),
      current_value: z.number(),
      status: healthStatus.optional(),
      note: z.string().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        atlas.setKeyResultValue({
          keyResultId: args.key_result_id,
          currentValue: args.current_value,
          status: args.status,
          note: args.note,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "add_comment",
    "Add a comment on an entity",
    {
      entity_kind: entityKind,
      entity_id: z.string().uuid(),
      body: z.string(),
      agent_slug: z.string().optional(),
      author_label: z.string().optional(),
    },
    async (args) =>
      run(() =>
        atlas.addComment({
          entityKind: args.entity_kind,
          entityId: args.entity_id,
          body: args.body,
          agentSlug: args.agent_slug,
          authorLabel: args.author_label,
        }),
      ),
  );

  server.tool(
    "list_tasks",
    "List tasks with optional filters",
    {
      status: taskStatus.optional(),
      assignee_agent_slug: z.string().optional(),
      cycle_id: z.string().uuid().optional(),
      objective_id: z.string().uuid().optional(),
      stale_only: z.boolean().optional(),
    },
    async (args) =>
      run(() =>
        atlas.listTasks({
          status: args.status,
          assigneeAgentSlug: args.assignee_agent_slug,
          cycleId: args.cycle_id,
          objectiveId: args.objective_id,
          staleOnly: args.stale_only,
        }),
      ),
  );

  server.tool(
    "get_objective",
    "Get objective with KRs, tasks, projects, and rollup",
    { objective_id: z.string().uuid() },
    async ({ objective_id }) => run(() => atlas.getObjective(objective_id)),
  );

  server.tool(
    "get_task",
    "Get task with recent progress events and comments",
    { task_id: z.string().uuid() },
    async ({ task_id }) => run(() => atlas.getTask(task_id)),
  );

  // --- Phase A ---
  server.tool(
    "get_next_work",
    "Rank claimable tasks by KR lag × weight × priority for this agent",
    {
      agent_slug: z.string().default("grok"),
      domain: z.string().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async (args) =>
      run(() =>
        control.getNextWork({
          agentSlug: args.agent_slug,
          domain: args.domain,
          limit: args.limit,
        }),
      ),
  );

  server.tool(
    "block_task",
    "Mark a task blocked, optionally naming the blocker task",
    {
      task_id: z.string().uuid(),
      blocked_by_task_id: z.string().uuid().nullable().optional(),
      note: z.string(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.blockTask({
          taskId: args.task_id,
          blockedByTaskId: args.blocked_by_task_id,
          note: args.note,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "unblock_task",
    "Clear block and return task to ready or in_progress",
    {
      task_id: z.string().uuid(),
      status: z.enum(["ready", "in_progress"]).optional(),
      note: z.string(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.unblockTask({
          taskId: args.task_id,
          status: args.status,
          note: args.note,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  // --- Phase B ---
  server.tool(
    "propose_action",
    "Propose a risk-gated action for founder approval (or auto-approve if autonomous)",
    {
      title: z.string(),
      body: z.string().optional(),
      action_type: z.string(),
      risk_tier: z.number().int().min(0).max(3).optional(),
      payload_json: z.string().optional(),
      related_entity_kind: entityKind.optional(),
      related_entity_id: z.string().uuid().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.proposeAction({
          title: args.title,
          body: args.body,
          actionType: args.action_type,
          riskTier: args.risk_tier,
          payloadJson: args.payload_json,
          relatedEntityKind: args.related_entity_kind,
          relatedEntityId: args.related_entity_id,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "list_approvals",
    "List approval requests",
    {
      status: z
        .enum(["pending", "approved", "rejected", "cancelled"])
        .optional(),
    },
    async (args) => run(() => control.listApprovals(args.status)),
  );

  server.tool(
    "resolve_approval",
    "Approve or reject a pending approval",
    {
      approval_id: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().optional(),
      resolved_by: z.string().optional(),
      agent_slug: z.string().optional(),
    },
    async (args) =>
      run(() =>
        control.resolveApproval({
          approvalId: args.approval_id,
          decision: args.decision,
          note: args.note,
          resolvedBy: args.resolved_by,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "get_founder_digest",
    "60-second founder brief: outcomes, top interventions, autonomy health",
    {},
    async () => run(() => control.getFounderDigest()),
  );

  server.tool(
    "intervene",
    "Founder intervention: approve/reject/reassign/pause_agent/resume_agent/reweight_kr",
    {
      action: z.enum([
        "approve",
        "reject",
        "reassign",
        "pause_agent",
        "resume_agent",
        "reweight_kr",
      ]),
      approval_id: z.string().uuid().optional(),
      task_id: z.string().uuid().optional(),
      agent_slug: z.string().optional(),
      assignee_agent_slug: z.string().optional(),
      key_result_id: z.string().uuid().optional(),
      weight: z.number().optional(),
      note: z.string().optional(),
      actor: z.string().optional(),
    },
    async (args) =>
      run(() =>
        control.intervene({
          action: args.action,
          approvalId: args.approval_id,
          taskId: args.task_id,
          agentSlug: args.agent_slug,
          assigneeAgentSlug: args.assignee_agent_slug,
          keyResultId: args.key_result_id,
          weight: args.weight,
          note: args.note,
          actor: args.actor,
        }),
      ),
  );

  // --- Phase C ---
  server.tool(
    "upsert_principle",
    "Create or update a hard/soft organisational principle",
    {
      slug: z.string(),
      name: z.string(),
      description: z.string().optional(),
      weight: z.number().optional(),
      enforcement: z.enum(["hard", "soft", "advisory"]).optional(),
      violation_action: z.string().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.upsertPrinciple({
          slug: args.slug,
          name: args.name,
          description: args.description,
          weight: args.weight,
          enforcement: args.enforcement,
          violationAction: args.violation_action,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "list_principles",
    "List organisational principles",
    {},
    async () => run(() => control.listPrinciples()),
  );

  server.tool(
    "upsert_tradeoff",
    "Create or update a trade-off rule set (when goals conflict)",
    {
      slug: z.string(),
      title: z.string(),
      description: z.string().optional(),
      rules: z.array(z.unknown()),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.upsertTradeoff({
          slug: args.slug,
          title: args.title,
          description: args.description,
          rules: args.rules,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "list_tradeoffs",
    "List trade-off rules",
    {},
    async () => run(() => control.listTradeoffs()),
  );

  server.tool(
    "register_signal",
    "Bind a live metric signal to a key result",
    {
      slug: z.string(),
      name: z.string(),
      key_result_id: z.string().uuid(),
      source: z.string().optional(),
      unit: z.string().optional(),
      healthy_min: z.number().optional(),
      healthy_max: z.number().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.registerSignal({
          slug: args.slug,
          name: args.name,
          keyResultId: args.key_result_id,
          source: args.source,
          unit: args.unit,
          healthyMin: args.healthy_min,
          healthyMax: args.healthy_max,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "ingest_signal",
    "Ingest a signal value and optionally update the linked key result",
    {
      slug: z.string(),
      value: z.number(),
      note: z.string().optional(),
      update_key_result: z.boolean().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.ingestSignal({
          slug: args.slug,
          value: args.value,
          note: args.note,
          updateKeyResult: args.update_key_result,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "list_signals",
    "List registered signals",
    {},
    async () => run(() => control.listSignals()),
  );

  server.tool(
    "get_intent_context",
    "Principles, trade-offs, and signals for agent alignment",
    {},
    async () => run(() => control.getIntentContext()),
  );

  // --- Phase D ---
  server.tool(
    "update_agent_profile",
    "Set agent domains, capabilities, and autonomy ceiling",
    {
      agent_slug: z.string(),
      domains: z.array(z.string()).optional(),
      capabilities: z.array(z.string()).optional(),
      autonomy_ceiling: z.number().int().min(0).max(3).optional(),
      name: z.string().optional(),
      model_hint: z.string().optional(),
    },
    async (args) =>
      run(() =>
        control.updateAgentProfile({
          agentSlug: args.agent_slug,
          domains: args.domains,
          capabilities: args.capabilities,
          autonomyCeiling: args.autonomy_ceiling,
          name: args.name,
          modelHint: args.model_hint,
        }),
      ),
  );

  server.tool(
    "record_outcome",
    "Record success/failure for an action type (feeds earned autonomy ledger)",
    {
      action_type: z.string(),
      success: z.boolean(),
      note: z.string().optional(),
      evidence_url: z.string().url().optional(),
      task_id: z.string().uuid().optional(),
      agent_slug: z.string().default("grok"),
    },
    async (args) =>
      run(() =>
        control.recordOutcome({
          actionType: args.action_type,
          success: args.success,
          note: args.note,
          evidenceUrl: args.evidence_url,
          taskId: args.task_id,
          agentSlug: args.agent_slug,
        }),
      ),
  );

  server.tool(
    "list_autonomy_ledgers",
    "List autonomy tiers / samples per action type",
    { agent_slug: z.string().optional() },
    async (args) => run(() => control.listAutonomyLedgers(args.agent_slug)),
  );

  server.tool(
    "resolve_autonomy_promotion",
    "Approve or reject a pending autonomy tier promotion",
    {
      agent_slug: z.string(),
      action_type: z.string(),
      decision: z.enum(["approve", "reject"]),
      actor: z.string().optional(),
    },
    async (args) =>
      run(() =>
        control.resolveAutonomyPromotion({
          agentSlug: args.agent_slug,
          actionType: args.action_type,
          decision: args.decision,
          actor: args.actor,
        }),
      ),
  );
}

export function createAtlasMcpServer(
  atlas: AtlasService,
  control: ControlPlaneService,
) {
  const server = new McpServer({
    name: "agent-atlas",
    version: "0.2.0",
  });
  registerAtlasTools(server, atlas, control);
  return server;
}
