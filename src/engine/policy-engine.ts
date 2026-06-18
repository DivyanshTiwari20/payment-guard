/**
 * The core brain. Pure, deterministic global-policy evaluation.
 *
 * No async, no I/O, no AI calls — data in, decision out. This purity is the
 * security guarantee: the decision cannot be influenced by anything other than
 * the explicit inputs.
 */

import type { Decision, PaymentRequest, Policy } from "./types.js";

/**
 * Normalize a payee name for robust comparison.
 *
 * Lowercases, trims, and collapses any run of whitespace / hyphens /
 * underscores into a single hyphen, then strips leading/trailing hyphens.
 * So "Electricity Board", "electricity-board", and "ELECTRICITY_BOARD" all
 * normalize to "electricity-board".
 */
export function normalizePayee(payee: string): string {
  return payee
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True if the policy has a set expiry that is now in the past. */
export function isPolicyExpired(policy: Policy, now: Date = new Date()): boolean {
  if (policy.expiresOn === null) return false;
  const expiry = Date.parse(policy.expiresOn);
  if (Number.isNaN(expiry)) return true; // fail closed on an unparseable expiry
  return now.getTime() > expiry;
}

/**
 * Evaluate a payment request against the user's GLOBAL policy.
 *
 * This runs *in addition to* mandate checks — both must pass. It is intentionally
 * pure and synchronous.
 *
 * @param request   The payment being requested.
 * @param policy    The active global policy.
 * @param spentToday Amount already spent today (for the daily-limit check).
 */
export function evaluatePayment(
  request: PaymentRequest,
  policy: Policy,
  spentToday: number,
  now: Date = new Date(),
): Decision {
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    return { allowed: false, reason: "Amount must be a finite number greater than zero." };
  }

  if (isPolicyExpired(policy, now)) {
    return { allowed: false, reason: `Policy expired on ${policy.expiresOn}.` };
  }

  if (request.amount > policy.maxAmount) {
    return {
      allowed: false,
      reason: `Amount ${request.amount} exceeds the per-payment limit of ${policy.maxAmount}.`,
    };
  }

  // The allowlist is only enforced when non-empty (see CLAUDE.md).
  if (policy.allowedPayees.length > 0) {
    const normalizedRequest = normalizePayee(request.payee);
    const allowed = policy.allowedPayees.some(
      (p) => normalizePayee(p) === normalizedRequest,
    );
    if (!allowed) {
      return {
        allowed: false,
        reason: `Payee "${request.payee}" is not on the global allowlist.`,
      };
    }
  }

  if (spentToday + request.amount > policy.dailyLimit) {
    return {
      allowed: false,
      reason: `This payment would cross the daily limit of ${policy.dailyLimit} (already spent ${spentToday}).`,
    };
  }

  return { allowed: true, reason: "All global policy checks passed." };
}
