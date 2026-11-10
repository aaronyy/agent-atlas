export type TaskStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export type HealthStatus =
  | "on_track"
  | "at_risk"
  | "behind"
  | "done"
  | "dropped";

export type KeyResultKind = "numeric" | "task_backed";

export type EnforcementLevel = "hard" | "soft" | "advisory";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type AutonomyTier = 0 | 1 | 2 | 3;

export interface TaskProgressInput {
  id: string;
  status: TaskStatus;
  keyResultId: string | null;
  lastProgressAt: Date | null;
  updatedAt: Date;
  attentionAcknowledgedAt?: Date | null;
  unaligned?: boolean;
  blockedByTaskId?: string | null;
  priority?: number;
  riskTier?: number;
  domain?: string | null;
  title?: string;
}

export interface KeyResultProgressInput {
  id: string;
  objectiveId: string;
  kind: KeyResultKind | string;
  targetValue: number;
  currentValue: number;
  weight: number;
  status: HealthStatus;
  title?: string;
}

export interface ObjectiveRollup {
  objectiveId: string;
  completionPercent: number;
  suggestedStatus: HealthStatus;
  keyResultCount: number;
}

export interface KeyResultRollup {
  keyResultId: string;
  completionPercent: number;
  currentValue: number;
  targetValue: number;
  taskTotal: number;
  taskDone: number;
}

export type AttentionKind =
  | "stale_task"
  | "blocked_task"
  | "behind_kr"
  | "pending_approval"
  | "unaligned_task"
  | "autonomy_demotion"
  | "drift";

export interface AttentionItem {
  kind: AttentionKind;
  id: string;
  title?: string;
  reason: string;
  severity: "high" | "medium" | "low";
}

export interface NextWorkCandidate {
  id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  keyResultId: string | null;
  objectiveId?: string | null;
  domain?: string | null;
  riskTier: number;
  score: number;
  reason: string;
}

export interface AutonomyLedgerState {
  actionType: string;
  tier: number;
  samples: number;
  successes: number;
  failures: number;
  pendingPromotionTier: number | null;
}
