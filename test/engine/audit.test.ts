/**
 * Tests for the audit hash primitive.
 *
 * `computeHash` is the pure core of the tamper-evident chain: it must be
 * deterministic and sensitive to every field that matters for accountability.
 * (Disk-backed append/verify are covered by integration tests.)
 */

import { describe, expect, it } from "vitest";
import { computeHash } from "../../src/engine/audit.js";
import type { AuditEntry, Policy } from "../../src/engine/types.js";

const policy: Policy = {
  maxAmount: 5000,
  dailyLimit: 20000,
  allowedPayees: [],
  expiresOn: null,
};

type HashInput = Pick<
  AuditEntry,
  "id" | "timestamp" | "request" | "decision" | "policySnapshot" | "previousHash"
>;

const entry = (overrides: Partial<HashInput> = {}): HashInput => ({
  id: "abc",
  timestamp: "2026-06-20T00:00:00.000Z",
  request: { payee: "Acme", amount: 100 },
  decision: { allowed: true, reason: "ok" },
  policySnapshot: policy,
  previousHash: "",
  ...overrides,
});

describe("computeHash", () => {
  it("is deterministic for identical input", () => {
    expect(computeHash(entry())).toBe(computeHash(entry()));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(computeHash(entry())).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each<keyof HashInput>(["id", "timestamp", "previousHash"])(
    "changes when %s changes",
    (field) => {
      const a = computeHash(entry());
      const b = computeHash(entry({ [field]: "different" } as Partial<HashInput>));
      expect(a).not.toBe(b);
    },
  );

  it("changes when the request amount changes", () => {
    const a = computeHash(entry({ request: { payee: "Acme", amount: 100 } }));
    const b = computeHash(entry({ request: { payee: "Acme", amount: 999 } }));
    expect(a).not.toBe(b);
  });

  it("changes when the decision flips", () => {
    const a = computeHash(entry({ decision: { allowed: true, reason: "ok" } }));
    const b = computeHash(entry({ decision: { allowed: false, reason: "ok" } }));
    expect(a).not.toBe(b);
  });

  it("changes when the policy snapshot changes", () => {
    const a = computeHash(entry());
    const b = computeHash(entry({ policySnapshot: { ...policy, maxAmount: 1 } }));
    expect(a).not.toBe(b);
  });

  it("chains: a different previousHash yields a different hash", () => {
    const first = computeHash(entry({ previousHash: "" }));
    const second = computeHash(entry({ previousHash: first }));
    expect(second).not.toBe(first);
  });
});
