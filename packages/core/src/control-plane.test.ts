import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankNextWork } from "./next-work.js";
import {
  applyOutcome,
  approvePromotion,
  gateAction,
} from "./autonomy.js";
import { collectAttention, detectKrDrift } from "./attention.js";
import type { AutonomyLedgerState } from "./types.js";

describe("rankNextWork", () => {
  it("prefers tasks on behind high-weight KRs", () => {
    const ranked = rankNextWork({
      cycleElapsedFraction: 0.5,
      keyResults: [
        {
          id: "kr-behind",
          objectiveId: "o1",
          kind: "numeric",
          targetValue: 100,
          currentValue: 10,
          weight: 3,
          status: "behind",
          title: "Revenue",
        },
        {
          id: "kr-ok",
          objectiveId: "o1",
          kind: "numeric",
          targetValue: 100,
          currentValue: 50,
          weight: 1,
          status: "on_track",
          title: "Docs",
        },
      ],
      tasks: [
        {
          id: "t-low",
          title: "Polish docs",
          status: "ready",
          priority: 2,
          riskTier: 1,
          keyResultId: "kr-ok",
          lastProgressAt: null,
          updatedAt: new Date(),
        },
        {
          id: "t-high",
          title: "Close deals",
          status: "ready",
          priority: 1,
          riskTier: 1,
          keyResultId: "kr-behind",
          lastProgressAt: null,
          updatedAt: new Date(),
        },
      ],
    });
    assert.equal(ranked[0]?.id, "t-high");
    assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
  });

  it("skips blocked-by unfinished tasks", () => {
    const ranked = rankNextWork({
      cycleElapsedFraction: 0.5,
      keyResults: [],
      tasks: [
        {
          id: "blocker",
          title: "Blocker",
          status: "in_progress",
          priority: 1,
          riskTier: 1,
          keyResultId: null,
          lastProgressAt: null,
          updatedAt: new Date(),
        },
        {
          id: "waiting",
          title: "Waiting",
          status: "ready",
          priority: 1,
          riskTier: 1,
          keyResultId: null,
          blockedByTaskId: "blocker",
          lastProgressAt: null,
          updatedAt: new Date(),
        },
      ],
    });
    assert.equal(ranked.length, 0);
  });
});

describe("autonomy ledger", () => {
  it("demotes on failure and proposes promotion on streak", () => {
    let ledger: AutonomyLedgerState = {
      actionType: "task_complete",
      tier: 2,
      samples: 0,
      successes: 0,
      failures: 0,
      pendingPromotionTier: null,
    };
    const fail = applyOutcome(ledger, false);
    assert.equal(fail.demoted, true);
    assert.equal(fail.ledger.tier, 1);

    ledger = {
      actionType: "task_complete",
      tier: 1,
      samples: 7,
      successes: 7,
      failures: 0,
      pendingPromotionTier: null,
    };
    const ok = applyOutcome(ledger, true);
    assert.equal(ok.promotionProposed, true);
    assert.equal(ok.ledger.pendingPromotionTier, 2);
    const promoted = approvePromotion(ok.ledger);
    assert.equal(promoted.tier, 2);
    assert.equal(promoted.pendingPromotionTier, null);
  });

  it("gates high-risk actions to propose unless T3", () => {
    const g = gateAction({
      ledgerTier: 2,
      agentCeiling: 3,
      actionRiskTier: 2,
    });
    assert.equal(g.mode, "propose");
    const auto = gateAction({
      ledgerTier: 3,
      agentCeiling: 3,
      actionRiskTier: 2,
    });
    assert.equal(auto.mode, "autonomous");
  });
});

describe("attention + drift", () => {
  it("ranks pending approvals first", () => {
    const items = collectAttention({
      now: new Date(),
      staleHours: 24,
      tasks: [],
      keyResults: [],
      pendingApprovals: [{ id: "a1", title: "Send email", riskTier: 2 }],
    });
    assert.equal(items[0]?.kind, "pending_approval");
  });

  it("detects outcome drift", () => {
    const d = detectKrDrift({
      keyResultId: "kr1",
      title: "MRR",
      kind: "numeric",
      targetValue: 100,
      currentValue: 10,
      tasksDone: 5,
      tasksTotal: 6,
    });
    assert.ok(d);
    assert.match(d!.reason, /drift/i);
  });
});
