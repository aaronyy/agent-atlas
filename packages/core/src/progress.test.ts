import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampPercent,
  isTaskStale,
  rollupKeyResult,
  rollupObjective,
  suggestHealthFromPercent,
  taskCompletionRatio,
} from "./progress.js";
import { collectAttention, cycleElapsedFraction } from "./attention.js";
import type { KeyResultProgressInput, TaskProgressInput } from "./types.js";

describe("clampPercent", () => {
  it("clamps to 0..100", () => {
    assert.equal(clampPercent(-5), 0);
    assert.equal(clampPercent(150), 100);
    assert.equal(clampPercent(42), 42);
  });
});

describe("taskCompletionRatio", () => {
  it("ignores cancelled and computes done ratio", () => {
    const tasks: TaskProgressInput[] = [
      task("1", "done"),
      task("2", "in_progress"),
      task("3", "cancelled"),
      task("4", "done"),
    ];
    const r = taskCompletionRatio(tasks);
    assert.equal(r.total, 3);
    assert.equal(r.done, 2);
    assert.equal(r.percent, clampPercent((2 / 3) * 100));
  });
});

describe("rollupKeyResult", () => {
  it("uses task completion for task_backed KRs", () => {
    const kr: KeyResultProgressInput = {
      id: "kr1",
      objectiveId: "o1",
      kind: "task_backed",
      targetValue: 100,
      currentValue: 0,
      weight: 1,
      status: "on_track",
    };
    const tasks = [task("1", "done", "kr1"), task("2", "ready", "kr1")];
    const r = rollupKeyResult(kr, tasks);
    assert.equal(r.completionPercent, 50);
    assert.equal(r.taskDone, 1);
    assert.equal(r.taskTotal, 2);
  });

  it("uses numeric current/target", () => {
    const kr: KeyResultProgressInput = {
      id: "kr2",
      objectiveId: "o1",
      kind: "numeric",
      targetValue: 200,
      currentValue: 50,
      weight: 1,
      status: "on_track",
    };
    const r = rollupKeyResult(kr, []);
    assert.equal(r.completionPercent, 25);
  });
});

describe("rollupObjective", () => {
  it("weights KR completion", () => {
    const krs: KeyResultProgressInput[] = [
      {
        id: "a",
        objectiveId: "o1",
        kind: "numeric",
        targetValue: 100,
        currentValue: 100,
        weight: 1,
        status: "on_track",
      },
      {
        id: "b",
        objectiveId: "o1",
        kind: "numeric",
        targetValue: 100,
        currentValue: 0,
        weight: 3,
        status: "behind",
      },
    ];
    const r = rollupObjective("o1", krs, new Map(), 0.5);
    // (100*1 + 0*3) / 4 = 25
    assert.equal(r.completionPercent, 25);
  });
});

describe("suggestHealthFromPercent", () => {
  it("marks lagging progress as behind", () => {
    assert.equal(suggestHealthFromPercent(100, 0.5), "done");
    assert.equal(suggestHealthFromPercent(50, 0.5), "on_track");
    assert.equal(suggestHealthFromPercent(30, 0.5), "at_risk");
    assert.equal(suggestHealthFromPercent(5, 0.5), "behind");
  });
});

describe("isTaskStale", () => {
  it("flags in_progress without recent progress", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const stale = task("1", "in_progress");
    stale.lastProgressAt = new Date("2026-11-09T00:00:00Z");
    stale.updatedAt = new Date("2026-11-09T00:00:00Z");
    assert.equal(isTaskStale(stale, now, 24), true);

    const fresh = task("2", "in_progress");
    fresh.lastProgressAt = new Date("2026-11-10T10:00:00Z");
    assert.equal(isTaskStale(fresh, now, 24), false);

    const backlog = task("3", "backlog");
    backlog.lastProgressAt = new Date("2026-11-01T00:00:00Z");
    assert.equal(isTaskStale(backlog, now, 24), false);
  });
});

describe("collectAttention", () => {
  it("returns blocked, stale, and behind KR items", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const items = collectAttention({
      now,
      staleHours: 24,
      tasks: [
        {
          ...task("t1", "blocked"),
          title: "Blocked work",
        },
        {
          ...task("t2", "in_progress"),
          title: "Stale work",
          lastProgressAt: new Date("2026-11-08T00:00:00Z"),
          updatedAt: new Date("2026-11-08T00:00:00Z"),
        },
      ],
      keyResults: [
        {
          id: "kr1",
          objectiveId: "o1",
          kind: "numeric",
          targetValue: 100,
          currentValue: 10,
          weight: 1,
          status: "behind",
          title: "Ship API",
        },
      ],
    });
    assert.equal(items.length, 3);
    assert.ok(items.some((i) => i.kind === "blocked_task"));
    assert.ok(items.some((i) => i.kind === "stale_task"));
    assert.ok(items.some((i) => i.kind === "behind_kr"));
  });
});

describe("cycleElapsedFraction", () => {
  it("computes mid-cycle fraction", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-04-01T00:00:00Z");
    const mid = new Date("2026-02-15T12:00:00Z");
    const f = cycleElapsedFraction(start, end, mid);
    assert.ok(f > 0.4 && f < 0.6);
  });
});

function task(
  id: string,
  status: TaskProgressInput["status"],
  keyResultId: string | null = null,
): TaskProgressInput {
  return {
    id,
    status,
    keyResultId,
    lastProgressAt: null,
    updatedAt: new Date("2026-11-10T00:00:00Z"),
  };
}
