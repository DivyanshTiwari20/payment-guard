/**
 * Tests for the composed decision (decidePayment) — the single pure entry point
 * used by the service, library, and the in-browser demo. Each layer's veto is
 * exercised, plus the happy path.
 */

import { describe, expect, it } from "vitest";
import { decidePayment } from "../../src/engine/decide.js";
import type { DecisionContext, Mandate, Policy } from "../../src/engine/types.js";
import type { DecisionContext as Ctx } from "../../src/engine/decide.js";

const now = new Date("2026-06-20T00:00:00.000Z");

const policy: Policy = {
  maxAmount: 5000,
  dailyLimit: 6000,
  allowedPayees: [],
  expiresOn: null,
};

const mandate = (overrides: Partial<Mandate> = {}): Mandate => ({
  id: "m1",
  payee: "electricity-board",
  maxAmount: 2000,
  totalBudget: 6000,
  spent: 0,
  purpose: "electricity bills",
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2099-12-31T00:00:00.000Z",
  revoked: false,
  revokedAt: null,
  ...overrides,
});

const ctx = (overrides: Partial<Ctx> = {}): DecisionContext => ({
  policy,
  mandates: [mandate()],
  spentToday: 0,
  now,
  ...overrides,
});

describe("decidePayment", () => {
  it("blocks on input validation before checking mandates", () => {
    const r = decidePayment({ payee: "Acme <script>", amount: 10 }, ctx());
    expect(r.decision.allowed).toBe(false);
    expect(r.decision.reason).toMatch(/disallowed characters/i);
    expect(r.mandateId).toBeNull();
    expect(r.newSpentToday).toBe(0);
  });

  it("blocks when no active mandate covers the payee", () => {
    const r = decidePayment({ payee: "Unknown Vendor", amount: 10 }, ctx());
    expect(r.decision.allowed).toBe(false);
    expect(r.decision.reason).toMatch(/no active mandate/i);
    expect(r.mandateId).toBeNull();
  });

  it("blocks on the global policy even when a mandate would allow it, citing the mandate", () => {
    const r = decidePayment(
      { payee: "Electricity Board", amount: 1000 },
      ctx({ spentToday: 5500 }), // daily limit 6000 -> 5500+1000 exceeds it
    );
    expect(r.decision.allowed).toBe(false);
    expect(r.decision.reason).toMatch(/daily limit/i);
    expect(r.mandateId).toBe("m1"); // the mandate was found; policy vetoed
    expect(r.newSpentToday).toBe(5500); // unchanged on block
  });

  it("allows a clean payment and reports the post-payment numbers", () => {
    const r = decidePayment({ payee: "ELECTRICITY_BOARD", amount: 1850 }, ctx());
    expect(r.decision.allowed).toBe(true);
    expect(r.mandateId).toBe("m1");
    expect(r.newSpentToday).toBe(1850);
    expect(r.mandateRemaining).toBe(6000 - 1850);
  });

  it("defaults the clock to now when not provided (smoke)", () => {
    const r = decidePayment({ payee: "Electricity Board", amount: 10 }, {
      policy,
      mandates: [mandate()],
      spentToday: 0,
    });
    expect(r.decision.allowed).toBe(true);
  });
});
