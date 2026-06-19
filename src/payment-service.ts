/**
 * Payment orchestration — the impure shell around the pure engine.
 *
 * Wires together rate limiting, input validation, mandate selection, global
 * policy evaluation, persistence, and the audit trail. The actual decisions are
 * all made by the pure functions in `src/engine/`; this module only sequences
 * them and records the outcome. It is fail-closed throughout.
 */

import { appendAuditEntry } from "./engine/audit.js";
import { decidePayment } from "./engine/decide.js";
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

  // 2-4. Deterministic decision: input validation -> mandate -> global policy.
  // All three live in the pure engine (decidePayment), so the MCP service, the
  // library, and the in-browser demo share one source of truth.
  const mandates = loadMandates();
  const result = decidePayment(request, {
    policy,
    mandates,
    spentToday: spend.spent,
  });
  if (!result.decision.allowed) {
    return finalize(result.decision, result.mandateId, spend.spent);
  }

  // 5. Settle: update the authorizing mandate's spend and the daily counter.
  const mandateId = result.mandateId;
  if (mandateId) {
    applyMandateSpend(mandates, mandateId, request.amount);
    saveMandates(mandates);
  }
  const newSpentToday = addSpendToday(request.amount);
  return finalize(result.decision, mandateId, newSpentToday);
}

/** Mutate the matching mandate's spent field in place. */
function applyMandateSpend(mandates: Mandate[], mandateId: string, amount: number): void {
  const target = mandates.find((m) => m.id === mandateId);
  if (target) {
    target.spent += amount;
  }
}
