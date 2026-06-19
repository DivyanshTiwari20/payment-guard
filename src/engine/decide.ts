/**
 * The full deterministic decision, as one pure function.
 *
 * This composes the individual engine rules (input validation -> mandate
 * selection -> global policy) into the single verdict the rest of the system
 * acts on. It is pure: data in, decision out — no I/O, no persistence, no
 * audit, no rate limiting. The MCP service, library users, and the in-browser
 * demo all call this, so there is exactly one source of truth for the question
 * "should this payment be allowed?".
 */

import { evaluatePayment, normalizePayee } from "./policy-engine.js";
import { findActiveMandates, remainingBudget, selectMandate } from "./mandate-engine.js";
import { validateRequest } from "./validators.js";
import type { Decision, Mandate, PaymentRequest, Policy } from "./types.js";

/** Everything the decision depends on, passed in explicitly (no globals). */
export interface DecisionContext {
  policy: Policy;
  mandates: Mandate[];
  /** Amount already spent today, for the daily-limit check. */
  spentToday: number;
  /** Injected clock for deterministic testing. */
  now?: Date;
}

export interface FullDecision {
  decision: Decision;
  /** The mandate that authorized (or was checked against) the payment, if any. */
  mandateId: string | null;
  /** Daily-spend total after this payment (unchanged unless allowed). */
  newSpentToday: number;
  /** Remaining budget on the chosen mandate after this payment, if allowed. */
  mandateRemaining: number | null;
}

/**
 * Decide a payment against the supplied policy + mandates + spend.
 *
 * Order is fail-closed at every step: input validation, then a valid mandate
 * must exist, then the global policy must also pass. Both layers must agree
 * before money is allowed to move.
 */
export function decidePayment(request: PaymentRequest, ctx: DecisionContext): FullDecision {
  const { policy, mandates, spentToday, now = new Date() } = ctx;

  const block = (decision: Decision, mandateId: string | null = null): FullDecision => ({
    decision,
    mandateId,
    newSpentToday: spentToday,
    mandateRemaining: null,
  });

  // 1. Input validation / prompt-injection defense.
  const validation = validateRequest(request);
  if (!validation.allowed) return block(validation);

  // 2. Mandate selection (scoped authorization).
  const normalizedPayee = normalizePayee(request.payee);
  const active = findActiveMandates(mandates, normalizedPayee, now);
  const { mandate, decision: mandateDecision } = selectMandate(active, request);
  if (!mandate) return block(mandateDecision);

  // 3. Global policy (applies on top of the mandate; both must pass).
  const policyDecision = evaluatePayment(request, policy, spentToday, now);
  if (!policyDecision.allowed) return block(policyDecision, mandate.id);

  // 4. Approved.
  const decision: Decision = {
    allowed: true,
    reason: `Payment of ${request.amount} to "${request.payee}" approved under mandate ${mandate.id} (${mandate.purpose}).`,
  };
  return {
    decision,
    mandateId: mandate.id,
    newSpentToday: spentToday + request.amount,
    mandateRemaining: remainingBudget(mandate) - request.amount,
  };
}
