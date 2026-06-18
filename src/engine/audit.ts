/**
 * Append-only, hash-chained audit trail.
 *
 * Every decision (allowed or blocked) is recorded. Each entry's hash is derived
 * from its contents plus the previous entry's hash, forming a tamper-evident
 * chain: changing any past entry breaks every subsequent hash.
 */

import { createHash, randomUUID } from "node:crypto";
import type { AuditEntry, Decision, PaymentRequest, Policy } from "./types.js";
import { readJSON, writeJSON } from "../storage/store.js";

const AUDIT_FILE = "audit.json";

/**
 * Compute the SHA-256 hash of an entry.
 *
 * Hash input (per spec):
 *   id + timestamp + JSON(request) + JSON(decision) + JSON(policySnapshot) + previousHash
 */
export function computeHash(
  entry: Pick<
    AuditEntry,
    "id" | "timestamp" | "request" | "decision" | "policySnapshot" | "previousHash"
  >,
): string {
  const payload =
    entry.id +
    entry.timestamp +
    JSON.stringify(entry.request) +
    JSON.stringify(entry.decision) +
    JSON.stringify(entry.policySnapshot) +
    entry.previousHash;
  return createHash("sha256").update(payload).digest("hex");
}

export function loadAuditLog(): AuditEntry[] {
  return readJSON<AuditEntry[]>(AUDIT_FILE, []);
}

/** Append a new decision to the audit chain and persist it. */
export function appendAuditEntry(params: {
  request: PaymentRequest;
  decision: Decision;
  policySnapshot: Policy;
  mandateId: string | null;
}): AuditEntry {
  const log = loadAuditLog();
  const previous = log.at(-1);
  const previousHash = previous ? previous.hash : "";

  const base = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    request: params.request,
    decision: params.decision,
    policySnapshot: params.policySnapshot,
    mandateId: params.mandateId,
    previousHash,
  };

  const entry: AuditEntry = { ...base, hash: computeHash(base) };
  log.push(entry);
  writeJSON(AUDIT_FILE, log);
  return entry;
}

/** Return the last `count` audit entries (most recent last). */
export function getRecentEntries(count = 10): AuditEntry[] {
  const log = loadAuditLog();
  return log.slice(-count);
}

export interface IntegrityResult {
  valid: boolean;
  entriesChecked: number;
  firstCorruptedEntry: string | null;
}

/**
 * Walk the entire chain, recomputing every hash and verifying the links.
 * Returns the id of the first corrupted entry, or null if the chain is intact.
 */
export function verifyAuditIntegrity(): IntegrityResult {
  const log = loadAuditLog();
  let previousHash = "";

  for (const entry of log) {
    if (entry.previousHash !== previousHash) {
      return { valid: false, entriesChecked: log.length, firstCorruptedEntry: entry.id };
    }
    if (computeHash(entry) !== entry.hash) {
      return { valid: false, entriesChecked: log.length, firstCorruptedEntry: entry.id };
    }
    previousHash = entry.hash;
  }

  return { valid: true, entriesChecked: log.length, firstCorruptedEntry: null };
}
