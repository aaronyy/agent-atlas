import { isTaskStale } from "./progress.js";
import type {
  AttentionItem,
  HealthStatus,
  KeyResultProgressInput,
  TaskProgressInput,
} from "./types.js";

export interface AttentionInput {
  tasks: Array<TaskProgressInput & { title: string }>;
  keyResults: Array<KeyResultProgressInput & { title: string }>;
  pendingApprovals?: Array<{ id: string; title: string; riskTier: number }>;
  recentDemotions?: Array<{ id: string; title: string; reason: string }>;
  driftItems?: Array<{ id: string; title: string; reason: string }>;
  now: Date;
  staleHours: number;
}

export function collectAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const approval of input.pendingApprovals ?? []) {
    items.push({
      kind: "pending_approval",
      id: approval.id,
      title: approval.title,
      reason: `Needs a human decision (risk T${approval.riskTier})`,
      severity: approval.riskTier >= 2 ? "high" : "medium",
    });
  }

  for (const demotion of input.recentDemotions ?? []) {
    items.push({
      kind: "autonomy_demotion",
      id: demotion.id,
      title: demotion.title,
      reason: demotion.reason,
      severity: "high",
    });
  }

  for (const drift of input.driftItems ?? []) {
    items.push({
      kind: "drift",
      id: drift.id,
      title: drift.title,
      reason: drift.reason,
      severity: "medium",
    });
  }

  for (const task of input.tasks) {
    if (task.status === "blocked") {
      items.push({
        kind: "blocked_task",
        id: task.id,
        title: task.title,
        reason: task.blockedByTaskId
          ? `Blocked by task ${task.blockedByTaskId}`
          : "This work is stuck",
        severity: "high",
      });
      continue;
    }

    if (
      task.unaligned &&
      task.status !== "done" &&
      task.status !== "cancelled"
    ) {
      items.push({
        kind: "unaligned_task",
        id: task.id,
        title: task.title,
        reason: "Task has no key result — busywork risk",
        severity: "low",
      });
    }

    if (isTaskStale(task, input.now, input.staleHours)) {
      const acknowledged =
        task.attentionAcknowledgedAt &&
        task.attentionAcknowledgedAt.getTime() >
          (task.lastProgressAt ?? task.updatedAt).getTime();
      if (!acknowledged) {
        items.push({
          kind: "stale_task",
          id: task.id,
          title: task.title,
          reason: `No update for ${input.staleHours} hours while still in progress`,
          severity: "high",
        });
      }
    }
  }

  for (const kr of input.keyResults) {
    if (kr.status === "behind" || kr.status === "at_risk") {
      items.push({
        kind: "behind_kr",
        id: kr.id,
        title: kr.title,
        reason:
          kr.status === "behind"
            ? "This target is behind where it should be"
            : "This target is at risk of falling behind",
        severity: kr.status === "behind" ? "high" : "medium",
      });
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  const kindRank: Record<AttentionItem["kind"], number> = {
    pending_approval: 0,
    autonomy_demotion: 1,
    blocked_task: 2,
    behind_kr: 3,
    drift: 4,
    stale_task: 5,
    unaligned_task: 6,
  };
  items.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      kindRank[a.kind] - kindRank[b.kind],
  );
  return items;
}

export function cycleElapsedFraction(
  startsAt: Date,
  endsAt: Date,
  now: Date,
): number {
  const total = endsAt.getTime() - startsAt.getTime();
  if (total <= 0) return 0.5;
  const elapsed = now.getTime() - startsAt.getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

export function healthNeedsAttention(status: HealthStatus): boolean {
  return status === "behind" || status === "at_risk";
}

/** Detect KR drift: many tasks done but numeric KR barely moved. */
export function detectKrDrift(opts: {
  keyResultId: string;
  title: string;
  kind: string;
  targetValue: number;
  currentValue: number;
  tasksDone: number;
  tasksTotal: number;
}): { id: string; title: string; reason: string } | null {
  if (opts.kind === "task_backed") return null;
  if (opts.tasksDone < 3) return null;
  const target = opts.targetValue || 100;
  const pct = target === 0 ? 0 : (opts.currentValue / target) * 100;
  const taskPct =
    opts.tasksTotal === 0 ? 0 : (opts.tasksDone / opts.tasksTotal) * 100;
  if (taskPct >= 50 && pct < taskPct - 30) {
    return {
      id: opts.keyResultId,
      title: opts.title,
      reason: `${opts.tasksDone} tasks done but KR only at ${pct.toFixed(0)}% — outcome drift`,
    };
  }
  return null;
}
