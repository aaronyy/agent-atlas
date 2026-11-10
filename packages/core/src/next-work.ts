import { clampPercent } from "./progress.js";
import type {
  HealthStatus,
  KeyResultProgressInput,
  NextWorkCandidate,
  TaskProgressInput,
  TaskStatus,
} from "./types.js";

const CLAIMABLE: TaskStatus[] = ["backlog", "ready"];

export interface NextWorkInput {
  tasks: Array<
    TaskProgressInput & {
      title: string;
      priority: number;
      riskTier: number;
      objectiveId?: string | null;
      domain?: string | null;
    }
  >;
  keyResults: KeyResultProgressInput[];
  cycleElapsedFraction: number;
  agentDomains?: string[];
  agentAutonomyCeiling?: number;
  limit?: number;
}

function krLag(
  kr: KeyResultProgressInput,
  cycleElapsed: number,
): { lag: number; completion: number } {
  const target = Number(kr.targetValue) || 0;
  const current = Number(kr.currentValue) || 0;
  const completion =
    target === 0 ? 0 : clampPercent((current / target) * 100);
  const expected = clampPercent(cycleElapsed * 100);
  const lag = Math.max(0, expected - completion) / 100;
  return { lag, completion };
}

function statusBoost(status: HealthStatus): number {
  if (status === "behind") return 1.5;
  if (status === "at_risk") return 1.2;
  return 1;
}

/**
 * Rank claimable tasks by outcome leverage: KR lag × weight × priority,
 * filtered by domain and autonomy ceiling when provided.
 */
export function rankNextWork(input: NextWorkInput): NextWorkCandidate[] {
  const krById = new Map(input.keyResults.map((k) => [k.id, k]));
  const doneIds = new Set(
    input.tasks.filter((t) => t.status === "done").map((t) => t.id),
  );
  const domains = (input.agentDomains ?? [])
    .map((d) => d.toLowerCase())
    .filter(Boolean);
  const ceiling = input.agentAutonomyCeiling ?? 3;
  const limit = input.limit ?? 5;

  const scored: NextWorkCandidate[] = [];

  for (const task of input.tasks) {
    if (!CLAIMABLE.includes(task.status)) continue;
    if (task.blockedByTaskId && !doneIds.has(task.blockedByTaskId)) continue;
    if (task.riskTier > ceiling) continue;
    if (
      domains.length > 0 &&
      task.domain &&
      !domains.includes(task.domain.toLowerCase())
    ) {
      continue;
    }

    const kr = task.keyResultId ? krById.get(task.keyResultId) : undefined;
    const weight = kr ? Number(kr.weight) || 1 : 0.15;
    const { lag } = kr
      ? krLag(kr, input.cycleElapsedFraction)
      : { lag: task.unaligned ? 0.05 : 0.2 };
    const healthMul = kr ? statusBoost(kr.status) : 0.5;
    const priorityBoost = (4 - Math.min(4, Math.max(0, task.priority))) / 4;
    const score =
      (0.35 + lag) * weight * healthMul * (0.5 + priorityBoost);

    const reasonParts: string[] = [];
    if (kr) {
      reasonParts.push(
        `Moves KR “${kr.title ?? kr.id}” (lag ${(lag * 100).toFixed(0)}%, weight ${weight})`,
      );
      if (kr.status === "behind" || kr.status === "at_risk") {
        reasonParts.push(`KR is ${kr.status.replace("_", " ")}`);
      }
    } else if (task.unaligned) {
      reasonParts.push("Unaligned busywork — low leverage");
    } else {
      reasonParts.push("No KR link — prefer linking before claiming");
    }

    scored.push({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      keyResultId: task.keyResultId,
      objectiveId: task.objectiveId ?? null,
      domain: task.domain ?? null,
      riskTier: task.riskTier,
      score,
      reason: reasonParts.join(". "),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.priority - b.priority);
  return scored.slice(0, limit);
}
