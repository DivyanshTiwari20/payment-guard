/**
 * Pure, deterministic mandate evaluation.
 *
 * A mandate is a scoped, expiring, revocable authorization to pay a specific
 * payee. Money only moves under a valid mandate. Like the policy engine, this
 * module is side-effect free.
 */

import type { Decision, Mandate, MandateStatus, PaymentRequest } from "./types.js";

/** Determine a mandate's lifecycle status at a given time. */
export function mandateStatus(mandate: Mandate, now: Date = new Date()): MandateStatus {
  if (mandate.revoked) return "revoked";

  const expiry = Date.parse(mandate.expiresAt);
  // Fail closed: an unparseable or past expiry counts as expired.
  if (Number.isNaN(expiry) || now.getTime() >= expiry) return "expired";

  if (mandate.spent >= mandate.totalBudget) return "exhausted";

  return "active";
}

/** Remaining spendable budget under a mandate (never negative). */
export function remainingBudget(mandate: Mandate): number {
  return Math.max(0, mandate.totalBudget - mandate.spent);
}

/**
 * All mandates for a (normalized) payee that are currently spendable.
 */
export function findActiveMandates(
  mandates: Mandate[],
  normalizedPayee: string,
  now: Date = new Date(),
): Mandate[] {
  return mandates.filter(
    (m) => m.payee === normalizedPayee && mandateStatus(m, now) === "active",
  );
}

/** Whether a single (already-active) mandate can satisfy a request. */
export function evaluateMandate(mandate: Mandate, request: PaymentRequest): Decision {
  if (request.amount > mandate.maxAmount) {
    return {
      allowed: false,
      reason: `Amount ${request.amount} exceeds the mandate's per-transaction limit of ${mandate.maxAmount}.`,
    };
  }

  const remaining = remainingBudget(mandate);
  if (request.amount > remaining) {
    return {
      allowed: false,
      reason: `Amount ${request.amount} exceeds the mandate's remaining budget of ${remaining}.`,
    };
  }

  return { allowed: true, reason: `Authorized under mandate ${mandate.id}.` };
}

/**
 * Select a mandate to satisfy a request from a payee's active mandates.
 *
 * Returns the first active mandate that can cover the request, along with an
 * allow decision. If none qualify, returns `{ mandate: null, decision }` with
 * a specific block reason (fail closed).
 */
export function selectMandate(
  activeMandates: Mandate[],
  request: PaymentRequest,
): { mandate: Mandate | null; decision: Decision } {
  if (activeMandates.length === 0) {
    return {
      mandate: null,
      decision: { allowed: false, reason: "No active mandate for this payee." },
    };
  }

  for (const mandate of activeMandates) {
    const decision = evaluateMandate(mandate, request);
    if (decision.allowed) {
      return { mandate, decision };
    }
  }

  // At least one active mandate exists but none can cover the request.
  // Surface the most permissive candidate's specific reason.
  const best = activeMandates.reduce((a, b) =>
    remainingBudget(b) > remainingBudget(a) ? b : a,
  );
  return { mandate: null, decision: evaluateMandate(best, request) };
}
