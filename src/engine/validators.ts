/**
 * Input validation and prompt-injection defense.
 *
 * Runs BEFORE any policy/mandate check. Pure and deterministic. Rejects payee
 * names and amounts that look like attempts to smuggle data, exfiltrate, or
 * abuse the engine.
 */

import type { Decision, PaymentRequest } from "./types.js";

const MAX_PAYEE_LENGTH = 100;
const URL_PATTERN = /(https?:\/\/|www\.)/i;
/** Code-like characters: braces, angle brackets, semicolons, backticks. */
const CODE_PATTERN = /[{}<>;`]/;

/** True if the number has at most two decimal places. */
function hasAtMostTwoDecimals(amount: number): boolean {
  const cents = amount * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-9;
}

/**
 * Validate a raw payment request. Returns an allow decision if the input is
 * clean, otherwise a block decision with a specific reason.
 */
export function validateRequest(request: PaymentRequest): Decision {
  const { payee, amount } = request;

  if (typeof payee !== "string" || payee.trim().length === 0) {
    return { allowed: false, reason: "Payee must be a non-empty string." };
  }

  if (payee.length > MAX_PAYEE_LENGTH) {
    return {
      allowed: false,
      reason: `Payee name is too long (max ${MAX_PAYEE_LENGTH} characters).`,
    };
  }

  if (URL_PATTERN.test(payee)) {
    return {
      allowed: false,
      reason: "Payee name must not contain a URL.",
    };
  }

  if (CODE_PATTERN.test(payee)) {
    return {
      allowed: false,
      reason: "Payee name contains disallowed characters ({ } < > ; `).",
    };
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return {
      allowed: false,
      reason: "Amount must be a finite number greater than zero.",
    };
  }

  if (!hasAtMostTwoDecimals(amount)) {
    return {
      allowed: false,
      reason: "Amount must have at most two decimal places.",
    };
  }

  return { allowed: true, reason: "Input validation passed." };
}
