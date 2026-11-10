import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const taskStatuses = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const healthStatuses = [
  "on_track",
  "at_risk",
  "behind",
  "done",
  "dropped",
] as const;
export type HealthStatus = (typeof healthStatuses)[number];

export const entityKinds = [
  "objective",
  "key_result",
  "project",
  "task",
  "cycle",
  "principle",
  "tradeoff",
  "approval",
  "signal",
] as const;
export type EntityKind = (typeof entityKinds)[number];

export const enforcementLevels = ["hard", "soft", "advisory"] as const;
export type EnforcementLevel = (typeof enforcementLevels)[number];

export const approvalStatuses = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

/** T0 blocked → T1 propose → T2 confirm → T3 autonomous */
export const autonomyTiers = [0, 1, 2, 3] as const;
export type AutonomyTier = (typeof autonomyTiers)[number];

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
    index("api_keys_workspace_idx").on(t.workspaceId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    modelHint: text("model_hint"),
    /** JSON string array of domain tags, e.g. ["product","sales"] */
    domainsJson: text("domains_json").default("[]").notNull(),
    /** Max autonomy tier this agent may exercise (0–3). */
    autonomyCeiling: integer("autonomy_ceiling").default(3).notNull(),
    /** JSON string array of capability tags */
    capabilitiesJson: text("capabilities_json").default("[]").notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agents_workspace_slug_idx").on(t.workspaceId, t.slug),
    index("agents_workspace_idx").on(t.workspaceId),
  ],
);

export const cycles = pgTable(
  "cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cycles_workspace_idx").on(t.workspaceId)],
);

export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").references(() => cycles.id, { onDelete: "set null" }),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<HealthStatus>().default("on_track").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("objectives_workspace_idx").on(t.workspaceId),
    index("objectives_cycle_idx").on(t.cycleId),
  ],
);

export const keyResults = pgTable(
  "key_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** task_backed | numeric */
    kind: text("kind").default("numeric").notNull(),
    unit: text("unit").default("%").notNull(),
    targetValue: numeric("target_value", { precision: 18, scale: 4 })
      .default("100")
      .notNull(),
    currentValue: numeric("current_value", { precision: 18, scale: 4 })
      .default("0")
      .notNull(),
    weight: numeric("weight", { precision: 8, scale: 4 }).default("1").notNull(),
    status: text("status").$type<HealthStatus>().default("on_track").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("key_results_workspace_idx").on(t.workspaceId),
    index("key_results_objective_idx").on(t.objectiveId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").references(() => objectives.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<HealthStatus>().default("on_track").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("projects_workspace_idx").on(t.workspaceId),
    index("projects_objective_idx").on(t.objectiveId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").references(() => objectives.id, {
      onDelete: "set null",
    }),
    keyResultId: uuid("key_result_id").references(() => keyResults.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    blockedByTaskId: uuid("blocked_by_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<TaskStatus>().default("backlog").notNull(),
    priority: integer("priority").default(2).notNull(),
    /** Explicit opt-out from KR linkage (surfaces as attention noise). */
    unaligned: boolean("unaligned").default(false).notNull(),
    /** Suggested risk class for completion / side effects (0–3). */
    riskTier: integer("risk_tier").default(1).notNull(),
    domain: text("domain"),
    attentionAcknowledgedAt: timestamp("attention_acknowledged_at", {
      withTimezone: true,
    }),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tasks_workspace_idx").on(t.workspaceId),
    index("tasks_status_idx").on(t.workspaceId, t.status),
    index("tasks_assignee_idx").on(t.assigneeAgentId),
    index("tasks_kr_idx").on(t.keyResultId),
    index("tasks_objective_idx").on(t.objectiveId),
  ],
);

export const principles = pgTable(
  "principles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    weight: numeric("weight", { precision: 8, scale: 4 }).default("1").notNull(),
    enforcement: text("enforcement")
      .$type<EnforcementLevel>()
      .default("soft")
      .notNull(),
    violationAction: text("violation_action")
      .default("log_and_continue")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("principles_workspace_slug_idx").on(t.workspaceId, t.slug),
    index("principles_workspace_idx").on(t.workspaceId),
  ],
);

export const tradeoffs = pgTable(
  "tradeoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** JSON array of { condition, resolution, rationale?, constraints? } */
    rulesJson: text("rules_json").default("[]").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tradeoffs_workspace_slug_idx").on(t.workspaceId, t.slug),
    index("tradeoffs_workspace_idx").on(t.workspaceId),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    keyResultId: uuid("key_result_id")
      .notNull()
      .references(() => keyResults.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    source: text("source"),
    unit: text("unit").default("").notNull(),
    healthyMin: numeric("healthy_min", { precision: 18, scale: 4 }),
    healthyMax: numeric("healthy_max", { precision: 18, scale: 4 }),
    lastValue: numeric("last_value", { precision: 18, scale: 4 }),
    lastAt: timestamp("last_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("signals_workspace_slug_idx").on(t.workspaceId, t.slug),
    index("signals_workspace_idx").on(t.workspaceId),
    index("signals_kr_idx").on(t.keyResultId),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    proposerAgentId: uuid("proposer_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    actionType: text("action_type").notNull(),
    riskTier: integer("risk_tier").default(2).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    payloadJson: text("payload_json"),
    status: text("status")
      .$type<ApprovalStatus>()
      .default("pending")
      .notNull(),
    relatedEntityKind: text("related_entity_kind").$type<EntityKind>(),
    relatedEntityId: uuid("related_entity_id"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("approvals_workspace_idx").on(t.workspaceId),
    index("approvals_status_idx").on(t.workspaceId, t.status),
  ],
);

export const autonomyLedgers = pgTable(
  "autonomy_ledgers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    tier: integer("tier").default(1).notNull(),
    samples: integer("samples").default(0).notNull(),
    successes: integer("successes").default(0).notNull(),
    failures: integer("failures").default(0).notNull(),
    pendingPromotionTier: integer("pending_promotion_tier"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("autonomy_ledgers_agent_action_idx").on(
      t.workspaceId,
      t.agentId,
      t.actionType,
    ),
    index("autonomy_ledgers_workspace_idx").on(t.workspaceId),
  ],
);

export const autonomyOutcomes = pgTable(
  "autonomy_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    actionType: text("action_type").notNull(),
    success: boolean("success").notNull(),
    note: text("note"),
    evidenceUrl: text("evidence_url"),
    taskId: uuid("task_id"),
    demoted: boolean("demoted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("autonomy_outcomes_workspace_idx").on(t.workspaceId),
    index("autonomy_outcomes_agent_idx").on(t.agentId),
  ],
);

export const progressEvents = pgTable(
  "progress_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    entityKind: text("entity_kind").$type<EntityKind>().notNull(),
    entityId: uuid("entity_id").notNull(),
    eventType: text("event_type").notNull(),
    note: text("note"),
    percent: numeric("percent", { precision: 8, scale: 4 }),
    evidenceUrl: text("evidence_url"),
    metaJson: text("meta_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("progress_events_workspace_idx").on(t.workspaceId),
    index("progress_events_entity_idx").on(t.entityKind, t.entityId),
    index("progress_events_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    authorLabel: text("author_label"),
    entityKind: text("entity_kind").$type<EntityKind>().notNull(),
    entityId: uuid("entity_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("comments_workspace_idx").on(t.workspaceId),
    index("comments_entity_idx").on(t.entityKind, t.entityId),
  ],
);

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  apiKeys: many(apiKeys),
  agents: many(agents),
  cycles: many(cycles),
  objectives: many(objectives),
  keyResults: many(keyResults),
  projects: many(projects),
  tasks: many(tasks),
  progressEvents: many(progressEvents),
  comments: many(comments),
}));

export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [objectives.workspaceId],
    references: [workspaces.id],
  }),
  cycle: one(cycles, {
    fields: [objectives.cycleId],
    references: [cycles.id],
  }),
  owner: one(agents, {
    fields: [objectives.ownerAgentId],
    references: [agents.id],
  }),
  keyResults: many(keyResults),
  projects: many(projects),
  tasks: many(tasks),
}));

export const keyResultsRelations = relations(keyResults, ({ one, many }) => ({
  objective: one(objectives, {
    fields: [keyResults.objectiveId],
    references: [objectives.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  objective: one(objectives, {
    fields: [tasks.objectiveId],
    references: [objectives.id],
  }),
  keyResult: one(keyResults, {
    fields: [tasks.keyResultId],
    references: [keyResults.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(agents, {
    fields: [tasks.assigneeAgentId],
    references: [agents.id],
  }),
}));
