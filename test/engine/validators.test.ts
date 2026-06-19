/**
 * Tests for input validation / prompt-injection defense.
 *
 * This layer runs before any policy or mandate check, so its job is to reject
 * malformed or hostile input outright (fail closed).
 */

import { describe, expect, it } from "vitest";
import { validateRequest } from "../../src/engine/validators.js";

describe("validateRequest — payee", () => {
  it("rejects an empty payee", () => {
    const d = validateRequest({ payee: "", amount: 10 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/non-empty/i);
  });

  it("rejects a whitespace-only payee", () => {
    expect(validateRequest({ payee: "   ", amount: 10 }).allowed).toBe(false);
  });

  it("rejects a non-string payee", () => {
    // Simulate a malformed call that slipped past the type system.
    const d = validateRequest({ payee: 42 as unknown as string, amount: 10 });
    expect(d.allowed).toBe(false);
  });

  it("rejects a payee longer than 100 characters", () => {
    const d = validateRequest({ payee: "a".repeat(101), amount: 10 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/too long/i);
  });

  it("accepts a payee of exactly 100 characters", () => {
    expect(validateRequest({ payee: "a".repeat(100), amount: 10 }).allowed).toBe(true);
  });

  it.each([
    "Pay http://evil.com",
    "see https://x.io",
    "visit www.attacker.net",
  ])("rejects a payee containing a URL: %s", (payee) => {
    const d = validateRequest({ payee, amount: 10 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/URL/i);
  });

  it.each(["acme{", "a}b", "a<b", "a>b", "a;b", "a`b"])(
    "rejects code-like characters in payee: %s",
    (payee) => {
      const d = validateRequest({ payee, amount: 10 });
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/disallowed characters/i);
    },
  );

  it("accepts a normal payee name", () => {
    expect(validateRequest({ payee: "Electricity Board", amount: 10 }).allowed).toBe(true);
  });
});

describe("validateRequest — amount", () => {
  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-positive / non-finite amount: %s",
    (amount) => {
      const d = validateRequest({ payee: "Acme", amount });
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/finite number greater than zero/i);
    },
  );

  it("rejects a non-number amount", () => {
    const d = validateRequest({ payee: "Acme", amount: "10" as unknown as number });
    expect(d.allowed).toBe(false);
  });

  it.each([10.999, 0.001, 1.005])("rejects more than two decimal places: %s", (amount) => {
    const d = validateRequest({ payee: "Acme", amount });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/two decimal places/i);
  });

  it.each([10, 10.5, 10.55, 0.01])("accepts up to two decimal places: %s", (amount) => {
    expect(validateRequest({ payee: "Acme", amount }).allowed).toBe(true);
  });
});
