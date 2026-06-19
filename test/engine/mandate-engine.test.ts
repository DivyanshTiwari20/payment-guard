/**
 * Tests for mandate evaluation — scoped, expiring, revocable authorizations.
 * Money only moves under a valid mandate, so these cases are security-critical.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateMandate,
  findActiveMandates,
  mandateStatus,
  remainingBudget,
  selectMandate,
} from "../../src/engine/mandate-engine.js";
import type { Mandate } from "../../src/engine/types.js";

const now = new Date("2026-06-20T00:00:00.000Z");
const future = "2026-12-31T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";

const mandate = (overrides: Partial<Mandate> = {}): Mandate => ({
  id: "m1",
  payee: "electricity-board",
  maxAmount: 2000,
  totalBudget: 6000,
  spent: 0,
  purpose: "electricity bills",
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: future,
  revoked: false,
  revokedAt: null,
  ...overrides,
});

describe("mandateStatus", () => {
  it("reports revoked first, even if otherwise valid", () => {
    expect(mandateStatus(mandate({ revoked: true }), now)).toBe("revoked");
  });

  it("reports expired when past its expiry", () => {
    expect(mandateStatus(mandate({ expiresAt: past }), now)).toBe("expired");
  });

  it("reports expired at the exact expiry instant (fail closed, >=)", () => {
    expect(mandateStatus(mandate({ expiresAt: now.toISOString() }), now)).toBe("expired");
  });

  it("reports expired on an unparseable expiry (fail closed)", () => {
    expect(mandateStatus(mandate({ expiresAt: "garbage" }), now)).toBe("expired");
  });

  it("reports exhausted when fully spent", () => {
    expect(mandateStatus(mandate({ spent: 6000 }), now)).toBe("exhausted");
  });

  it("reports active when within budget, unexpired, unrevoked", () => {
    expect(mandateStatus(mandate(), now)).toBe("active");
  });
});

describe("remainingBudget", () => {
  it("returns the unspent amount", () => {
    expect(remainingBudget(mandate({ spent: 1500 }))).toBe(4500);
  });

  it("never goes negative", () => {
    expect(remainingBudget(mandate({ spent: 9999 }))).toBe(0);
  });
});

describe("findActiveMandates", () => {
  it("returns only active mandates matching the normalized payee", () => {
    const mandates = [
      mandate({ id: "ok" }),
      mandate({ id: "wrong-payee", payee: "someone-else" }),
      mandate({ id: "revoked", revoked: true }),
      mandate({ id: "expired", expiresAt: past }),
    ];
    const found = findActiveMandates(mandates, "electricity-board", now);
    expect(found.map((m) => m.id)).toEqual(["ok"]);
  });
});

describe("evaluateMandate", () => {
  it("blocks an amount over the per-transaction cap", () => {
    const d = evaluateMandate(mandate(), { payee: "x", amount: 2001 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/per-transaction limit/i);
  });

  it("blocks an amount over the remaining budget", () => {
    const d = evaluateMandate(mandate({ totalBudget: 6000, spent: 5500 }), { payee: "x", amount: 600 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/remaining budget/i);
  });

  it("allows an amount within both limits", () => {
    const d = evaluateMandate(mandate(), { payee: "x", amount: 1500 });
    expect(d.allowed).toBe(true);
  });
});

describe("selectMandate", () => {
  it("blocks when there are no active mandates", () => {
    const { mandate: chosen, decision } = selectMandate([], { payee: "x", amount: 10 });
    expect(chosen).toBeNull();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/no active mandate/i);
  });

  it("returns the first mandate that can cover the request", () => {
    const a = mandate({ id: "a", maxAmount: 100 });
    const b = mandate({ id: "b", maxAmount: 5000 });
    const { mandate: chosen } = selectMandate([a, b], { payee: "x", amount: 1000 });
    expect(chosen?.id).toBe("b");
  });

  it("surfaces the most-permissive reason when none can cover", () => {
    const small = mandate({ id: "small", totalBudget: 1000, spent: 900 }); // remaining 100
    const big = mandate({ id: "big", totalBudget: 3000, spent: 2500 }); // remaining 500
    const { mandate: chosen, decision } = selectMandate([small, big], { payee: "x", amount: 800 });
    expect(chosen).toBeNull();
    // Best candidate is `big` (remaining 500), so the reason should cite 500.
    expect(decision.reason).toMatch(/remaining budget of 500/i);
  });
});
