import type { AutonomyLedgerState, AutonomyTier } from "./types.js";

/** Promotion thresholds: T1→T2 needs 90%/8, T2→T3 needs 95%/12 */
export const PROMOTION_RULES: Record<
  number,
  { minPassRate: number; minSamples: number; nextTier: AutonomyTier }
> = {
  1: { minPassRate: 0.9, minSamples: 8, nextTier: 2 },
  2: { minPassRate: 0.95, minSamples: 12, nextTier: 3 },
};

export function clampTier(n: number): AutonomyTier {
  if (n <= 0) return 0;
  if (n >= 3) return 3;
  return n as AutonomyTier;
}

export function passRate(ledger: Pick<AutonomyLedgerState, "successes" | "samples">): number {
  if (ledger.samples <= 0) return 0;
  return ledger.successes / ledger.samples;
}

export function applyOutcome(
  ledger: AutonomyLedgerState,
  success: boolean,
): {
  ledger: AutonomyLedgerState;
  demoted: boolean;
  promotionProposed: boolean;
} {
  const next: AutonomyLedgerState = {
    ...ledger,
    samples: ledger.samples + 1,
    successes: ledger.successes + (success ? 1 : 0),
    failures: ledger.failures + (success ? 0 : 1),
  };

  if (!success) {
    const demotedTier = clampTier(Math.max(0, next.tier - 1));
    const demoted = demotedTier < next.tier;
    next.tier = demotedTier;
    next.pendingPromotionTier = null;
    return { ledger: next, demoted, promotionProposed: false };
  }

  const rule = PROMOTION_RULES[next.tier];
  if (
    rule &&
    next.samples >= rule.minSamples &&
    passRate(next) >= rule.minPassRate &&
    next.tier < 3
  ) {
    next.pendingPromotionTier = rule.nextTier;
    return { ledger: next, demoted: false, promotionProposed: true };
  }

  return { ledger: next, demoted: false, promotionProposed: false };
}

export function approvePromotion(
  ledger: AutonomyLedgerState,
): AutonomyLedgerState {
  if (ledger.pendingPromotionTier == null) return ledger;
  return {
    ...ledger,
    tier: clampTier(ledger.pendingPromotionTier),
    pendingPromotionTier: null,
  };
}

export function effectiveTier(
  ledgerTier: number,
  agentCeiling: number,
  actionRisk: number,
): AutonomyTier {
  return clampTier(Math.min(ledgerTier, agentCeiling, 3 - Math.max(0, actionRisk - 1)));
}

/**
 * Decide whether the agent may execute immediately or must propose.
 * T0 → blocked, T1 → propose, T2 → confirm (propose), T3 → autonomous.
 */
export function gateAction(opts: {
  ledgerTier: number;
  agentCeiling: number;
  actionRiskTier: number;
  agentPaused?: boolean;
}): { allowed: boolean; mode: "blocked" | "propose" | "autonomous"; tier: AutonomyTier } {
  if (opts.agentPaused) {
    return { allowed: false, mode: "blocked", tier: 0 };
  }
  const tier = clampTier(
    Math.min(opts.ledgerTier, opts.agentCeiling, opts.actionRiskTier <= 0 ? 0 : opts.ledgerTier),
  );
  // High-risk actions (tier 2+) always need proposal unless ledger is T3 and ceiling allows
  if (opts.actionRiskTier >= 2) {
    const effective = clampTier(Math.min(opts.ledgerTier, opts.agentCeiling));
    if (effective >= 3 && opts.actionRiskTier <= 2) {
      return { allowed: true, mode: "autonomous", tier: effective };
    }
    if (effective === 0) {
      return { allowed: false, mode: "blocked", tier: 0 };
    }
    return { allowed: true, mode: "propose", tier: effective };
  }
  if (tier <= 0) return { allowed: false, mode: "blocked", tier: 0 };
  if (tier <= 2) return { allowed: true, mode: "propose", tier };
  return { allowed: true, mode: "autonomous", tier };
}
