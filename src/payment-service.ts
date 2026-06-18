/**
 * Payment orchestration — the impure shell around the pure engine.
 *
 * Wires together rate limiting, input validation, mandate selection, global
 * policy evaluation, persistence, and the audit trail. The actual decisions are
 * all made by the pure functions in `src/engine/`; this module only sequences
 * them and records the outcome. It is fail-closed throughout.
 */

import { appendAuditEntry } from "./engine/audit.js";
import { evaluatePayment, normalizePayee } from "./engine/policy-engine.js";
import {
  findActiveMandates,
  selectMandate,
} from "./engine/mandate-engine.js";
import { validateRequest } from "./engine/validators.js";
import type { AuditEntry, Decision, Mandate, PaymentRequest } from "./engine/types.js";
import {
  addSpendToday,
  loadMandates,
  loadPolicy,
  loadSpendToday,
  saveMandates,
} from "./storage/repository.js";

// ── In-memory rate limiter ───────────────────────────────────────────────────

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const requestTimestamps: number[] = [];

/** Sliding-window rate check. Records the request if allowed. */
function checkRateLimit(now: number = Date.now()): boolean {
  while (requestTimestamps.length > 0 && now - requestTimestamps[0]! > RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) return false;
  requestTimestamps.push(now);
  return true;
}

export interface PaymentResult {
  decision: Decision;
  mandateId: string | null;
  /** New daily-spend total (only changes when allowed). */
  spentToday: number;
  auditId: string;
}

/**
 * Process a payment request end to end.
 *
 * Order (fail-closed at each step): rate limit → input validation →
 * mandate selection → global policy → settle (update spend + mandate) → audit.
 * Every outcome, allowed or blocked, is written to the audit trail.
 */
export function processPayment(request: PaymentRequest): PaymentResult {
  const policy = loadPolicy();

  /** Record the outcome to the audit trail and shape the result. */
  const finalize = (
    decision: Decision,
    mandateId: string | null,
    spentToday: number,
  ): PaymentResult => {
    const entry: AuditEntry = appendAuditEntry({
      request,
      decision,
      policySnapshot: policy,
      mandateId,
    });
    return { decision, mandateId, spentToday, auditId: entry.id };
  };

  const spend = loadSpendToday();

  // 1. Rate limit.
  if (!checkRateLimit()) {
    return finalize(
      { allowed: false, reason: "Rate limit exceeded, try again later." },
      null,
      spend.spent,
    );
  }

  // 2. Input validation / prompt-injection defense.
  const validation = validateRequest(request);
  if (!validation.allowed) {
    return finalize(validation, null, spend.spent);
  }

  // 3. Mandate selection (scoped authorization).
  const normalizedPayee = normalizePayee(request.payee);
  const mandates = loadMandates();
  const active = findActiveMandates(mandates, normalizedPayee);
  const { mandate, decision: mandateDecision } = selectMandate(active, request);
  if (!mandate) {
    return finalize(mandateDecision, null, spend.spent);
  }

  // 4. Global policy (applies on top of the mandate; both must pass).
  const policyDecision = evaluatePayment(request, policy, spend.spent);
  if (!policyDecision.allowed) {
    return finalize(policyDecision, mandate.id, spend.spent);
  }

  // 5. Settle: update mandate spend and daily counter, then persist.
  applyMandateSpend(mandates, mandate.id, request.amount);
  saveMandates(mandates);
  const newSpentToday = addSpendToday(request.amount);

  const decision: Decision = {
    allowed: true,
    reason: `Payment of ${request.amount} to "${request.payee}" approved under mandate ${mandate.id} (${mandate.purpose}).`,
  };
  return finalize(decision, mandate.id, newSpentToday);
}

/** Mutate the matching mandate's spent field in place. */
function applyMandateSpend(mandates: Mandate[], mandateId: string, amount: number): void {
  const target = mandates.find((m) => m.id === mandateId);
  if (target) {
    target.spent += amount;
  }
}
