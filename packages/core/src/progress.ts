import type {
  HealthStatus,
  KeyResultProgressInput,
  KeyResultRollup,
  ObjectiveRollup,
  TaskProgressInput,
  TaskStatus,
} from "./types.js";

const DONE_STATUSES: TaskStatus[] = ["done"];
const OPEN_STATUSES: TaskStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
];

export function clampPercent(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function taskCompletionRatio(tasks: TaskProgressInput[]): {
  total: number;
  done: number;
  percent: number;
} {
  const relevant = tasks.filter((t) => t.status !== "cancelled");
  const total = relevant.length;
  const done = relevant.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const percent = total === 0 ? 0 : (done / total) * 100;
  return { total, done, percent: clampPercent(percent) };
}

export function rollupKeyResult(
  kr: KeyResultProgressInput,
  linkedTasks: TaskProgressInput[],
): KeyResultRollup {
  const target = Number(kr.targetValue) || 0;
  if (kr.kind === "task_backed") {
    const { total, done, percent } = taskCompletionRatio(linkedTasks);
    const currentValue = target === 0 ? 0 : (percent / 100) * target;
    return {
      keyResultId: kr.id,
      completionPercent: percent,
      currentValue,
      targetValue: target,
      taskTotal: total,
      taskDone: done,
    };
  }

  const current = Number(kr.currentValue) || 0;
  const percent = target === 0 ? 0 : (current / target) * 100;
  const { total, done } = taskCompletionRatio(linkedTasks);
  return {
    keyResultId: kr.id,
    completionPercent: clampPercent(percent),
    currentValue: current,
    targetValue: target,
    taskTotal: total,
    taskDone: done,
  };
}

export function suggestHealthFromPercent(
  percent: number,
  cycleElapsedFraction: number = 0.5,
): HealthStatus {
  const p = clampPercent(percent);
  if (p >= 100) return "done";
  // Expected progress roughly tracks cycle elapsed; lagging hard → behind
  const expected = clampPercent(cycleElapsedFraction * 100);
  const delta = p - expected;
  if (delta >= -10) return "on_track";
  if (delta >= -25) return "at_risk";
  return "behind";
}

export function rollupObjective(
  objectiveId: string,
  keyResults: KeyResultProgressInput[],
  tasksByKr: Map<string, TaskProgressInput[]>,
  cycleElapsedFraction: number = 0.5,
): ObjectiveRollup {
  if (keyResults.length === 0) {
    return {
      objectiveId,
      completionPercent: 0,
      suggestedStatus: "on_track",
      keyResultCount: 0,
    };
  }

  let weightSum = 0;
  let weighted = 0;
  for (const kr of keyResults) {
    const tasks = tasksByKr.get(kr.id) ?? [];
    const rollup = rollupKeyResult(kr, tasks);
    const w = Number(kr.weight) || 1;
    weightSum += w;
    weighted += rollup.completionPercent * w;
  }

  const completionPercent =
    weightSum === 0 ? 0 : clampPercent(weighted / weightSum);

  return {
    objectiveId,
    completionPercent,
    suggestedStatus: suggestHealthFromPercent(
      completionPercent,
      cycleElapsedFraction,
    ),
    keyResultCount: keyResults.length,
  };
}

export function isTaskStale(
  task: TaskProgressInput,
  now: Date,
  staleHours: number,
): boolean {
  if (task.status !== "in_progress") return false;
  const anchor = task.lastProgressAt ?? task.updatedAt;
  const ageMs = now.getTime() - anchor.getTime();
  return ageMs >= staleHours * 60 * 60 * 1000;
}

export function openTaskCount(tasks: TaskProgressInput[]): number {
  return tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
}
