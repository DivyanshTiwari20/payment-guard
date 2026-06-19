/**
 * Integration tests for the disk-backed, hash-chained audit trail.
 *
 * These run against an isolated temp data directory (via PAYMENT_GUARD_DATA_DIR)
 * so they exercise the real append/verify path without touching project data.
 * The headline guarantee — tampering is detectable — is proven here.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAuditEntry,
  getRecentEntries,
  loadAuditLog,
  verifyAuditIntegrity,
} from "../../src/engine/audit.js";
import type { AuditEntry, Policy } from "../../src/engine/types.js";

const policy: Policy = {
  maxAmount: 5000,
  dailyLimit: 20000,
  allowedPayees: [],
  expiresOn: null,
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-audit-"));
  process.env.PAYMENT_GUARD_DATA_DIR = dir;
});

afterEach(() => {
  delete process.env.PAYMENT_GUARD_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const append = (amount: number, allowed: boolean) =>
  appendAuditEntry({
    request: { payee: "Acme", amount },
    decision: { allowed, reason: allowed ? "ok" : "blocked" },
    policySnapshot: policy,
    mandateId: allowed ? "m1" : null,
  });

describe("audit chain", () => {
  it("links each entry's previousHash to the prior entry's hash", () => {
    const a = append(10, true);
    const b = append(20, false);
    expect(a.previousHash).toBe("");
    expect(b.previousHash).toBe(a.hash);
    expect(loadAuditLog()).toHaveLength(2);
  });

  it("verifies a clean chain", () => {
    append(10, true);
    append(20, true);
    append(30, false);
    const result = verifyAuditIntegrity();
    expect(result).toEqual({ valid: true, entriesChecked: 3, firstCorruptedEntry: null });
  });

  it("detects tampering with a recorded decision", () => {
    append(10, true);
    const target = append(9999, false); // a blocked payment someone wants to hide
    append(30, true);

    // Forge the blocked entry into an allowed one, leaving its hash intact.
    const file = join(dir, "audit.json");
    const log = JSON.parse(readFileSync(file, "utf8")) as AuditEntry[];
    const forged = log.find((e) => e.id === target.id)!;
    forged.decision = { allowed: true, reason: "ok" };
    writeFileSync(file, JSON.stringify(log, null, 2));

    const result = verifyAuditIntegrity();
    expect(result.valid).toBe(false);
    expect(result.firstCorruptedEntry).toBe(target.id);
  });

  it("detects a deleted entry (broken chain link)", () => {
    append(10, true);
    const middle = append(20, true);
    append(30, true);

    const file = join(dir, "audit.json");
    const log = JSON.parse(readFileSync(file, "utf8")) as AuditEntry[];
    writeFileSync(file, JSON.stringify(log.filter((e) => e.id !== middle.id), null, 2));

    expect(verifyAuditIntegrity().valid).toBe(false);
  });

  it("returns the most recent N entries via getRecentEntries", () => {
    for (let i = 1; i <= 5; i++) append(i, true);
    const recent = getRecentEntries(2);
    expect(recent).toHaveLength(2);
    expect(recent.map((e) => e.request.amount)).toEqual([4, 5]);
  });

  it("treats an empty log as valid", () => {
    expect(verifyAuditIntegrity()).toEqual({
      valid: true,
      entriesChecked: 0,
      firstCorruptedEntry: null,
    });
  });
});
