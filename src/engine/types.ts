/**
 * Core domain types for PaymentGuard.
 *
 * These types are shared across the pure engine, the storage layer, and the
 * MCP wrapper. Keep them free of any runtime behaviour.
 */

/** The user's global spending policy. Applies on top of every mandate. */
export interface Policy {
  /** Maximum amount allowed for any single payment. */
  maxAmount: number;
  /** Maximum total amount allowed to be spent in a single calendar day. */
  dailyLimit: number;
  /**
   * Optional global allowlist of (normalized) payee names. Only enforced when
   * non-empty — see CLAUDE.md. An empty list means "rely on mandates".
   */
  allowedPayees: string[];
  /** ISO 8601 timestamp after which the whole policy is expired, or null. */
  expiresOn: string | null;
}

/** A request from the agent to move money. */
export interface PaymentRequest {
  payee: string;
  amount: number;
}

/** The deterministic verdict produced by the engine. */
export interface Decision {
  allowed: boolean;
  reason: string;
}

/** Persistent daily-spend counter with auto-reset on date change. */
export interface SpendTracker {
  /** Calendar date (YYYY-MM-DD) the counter applies to. */
  date: string;
  /** Amount spent so far on that date. */
  spent: number;
}

/**
 * A scoped, expiring, revocable authorization to pay a specific payee.
 * Inspired by Google's AP2 mandate concept.
 */
export interface Mandate {
  id: string;
  /** Normalized payee name this mandate authorizes payments to. */
  payee: string;
  /** Maximum amount allowed per transaction under this mandate. */
  maxAmount: number;
  /** Total amount allowed to be spent across the mandate's lifetime. */
  totalBudget: number;
  /** Amount already spent under this mandate. */
  spent: number;
  /** Human-readable purpose, e.g. "electricity bills". */
  purpose: string;
  createdAt: string;
  /** ISO 8601 expiry. A mandate MUST have an expiry. */
  expiresAt: string;
  revoked: boolean;
  revokedAt: string | null;
}

/** Lifecycle status of a mandate at a point in time. */
export type MandateStatus = "active" | "expired" | "revoked" | "exhausted";

/** A single tamper-evident entry in the append-only audit chain. */
export interface AuditEntry {
  id: string;
  timestamp: string;
  request: PaymentRequest;
  decision: Decision;
  /** The policy in effect at decision time, for accountability. */
  policySnapshot: Policy;
  /** The mandate used, if any. */
  mandateId: string | null;
  /** SHA-256 hash of the previous entry ("" for the first entry). */
  previousHash: string;
  /** SHA-256 hash of this entry's contents (see audit.ts). */
  hash: string;
}
