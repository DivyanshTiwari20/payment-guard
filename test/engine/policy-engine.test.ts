/**
 * Tests for the global policy engine — pure, deterministic verdicts on top of
 * mandates. Both the policy and the mandate layers must pass for a payment.
 */

import { describe, expect, it } from "vitest";
import {
  evaluatePayment,
  isPolicyExpired,
  normalizePayee,
} from "../../src/engine/policy-engine.js";
import type { Policy } from "../../src/engine/types.js";

const basePolicy = (overrides: Partial<Policy> = {}): Policy => ({
  maxAmount: 5000,
  dailyLimit: 20000,
  allowedPayees: [],
  expiresOn: null,
  ...overrides,
});

describe("normalizePayee", () => {
  it.each([
    ["Electricity Board", "electricity-board"],
    ["electricity-board", "electricity-board"],
    ["ELECTRICITY_BOARD", "electricity-board"],
    ["  spaced   out  ", "spaced-out"],
    ["a__b--c  d", "a-b-c-d"],
    ["-leading-and-trailing-", "leading-and-trailing"],
  ])("normalizes %s -> %s", (input, expected) => {
    expect(normalizePayee(input)).toBe(expected);
  });
});

describe("isPolicyExpired", () => {
  const now = new Date("2026-06-20T00:00:00.000Z");

  it("is false when there is no expiry", () => {
    expect(isPolicyExpired(basePolicy({ expiresOn: null }), now)).toBe(false);
  });

  it("is false when expiry is in the future", () => {
    expect(isPolicyExpired(basePolicy({ expiresOn: "2026-12-31T00:00:00.000Z" }), now)).toBe(false);
  });

  it("is true when expiry is in the past", () => {
    expect(isPolicyExpired(basePolicy({ expiresOn: "2020-01-01T00:00:00.000Z" }), now)).toBe(true);
  });

  it("fails closed on an unparseable expiry", () => {
    expect(isPolicyExpired(basePolicy({ expiresOn: "not-a-date" }), now)).toBe(true);
  });
});

describe("evaluatePayment", () => {
  const now = new Date("2026-06-20T00:00:00.000Z");

  it("rejects a non-positive amount (fail closed)", () => {
    const d = evaluatePayment({ payee: "Acme", amount: 0 }, basePolicy(), 0, now);
    expect(d.allowed).toBe(false);
  });

  it("rejects when the policy is expired", () => {
    const policy = basePolicy({ expiresOn: "2020-01-01T00:00:00.000Z" });
    const d = evaluatePayment({ payee: "Acme", amount: 10 }, policy, 0, now);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/expired/i);
  });

  it("rejects an amount over the per-payment cap", () => {
    const d = evaluatePayment({ payee: "Acme", amount: 5001 }, basePolicy(), 0, now);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/per-payment limit/i);
  });

  it("allows an amount exactly at the per-payment cap", () => {
    expect(evaluatePayment({ payee: "Acme", amount: 5000 }, basePolicy(), 0, now).allowed).toBe(true);
  });

  describe("allowlist", () => {
    it("is ignored when empty", () => {
      const d = evaluatePayment({ payee: "Anyone", amount: 10 }, basePolicy({ allowedPayees: [] }), 0, now);
      expect(d.allowed).toBe(true);
    });

    it("allows a payee on the list (normalized match)", () => {
      const policy = basePolicy({ allowedPayees: ["Electricity Board"] });
      const d = evaluatePayment({ payee: "electricity-board", amount: 10 }, policy, 0, now);
      expect(d.allowed).toBe(true);
    });

    it("blocks a payee not on the list", () => {
      const policy = basePolicy({ allowedPayees: ["Electricity Board"] });
      const d = evaluatePayment({ payee: "Random Vendor", amount: 10 }, policy, 0, now);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/allowlist/i);
    });
  });

  describe("daily limit", () => {
    it("blocks when the payment would cross the daily limit", () => {
      const d = evaluatePayment({ payee: "Acme", amount: 1 }, basePolicy({ dailyLimit: 100 }), 100, now);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/daily limit/i);
    });

    it("allows a payment that lands exactly on the daily limit", () => {
      const d = evaluatePayment({ payee: "Acme", amount: 50 }, basePolicy({ dailyLimit: 100 }), 50, now);
      expect(d.allowed).toBe(true);
    });
  });

  it("allows a clean payment", () => {
    const d = evaluatePayment({ payee: "Acme", amount: 100 }, basePolicy(), 0, now);
    expect(d.allowed).toBe(true);
    expect(d.reason).toMatch(/passed/i);
  });
});
