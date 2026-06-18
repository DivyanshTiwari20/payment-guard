/**
 * Typed accessors and defaults layered on top of the generic JSON store.
 *
 * Centralizes file names, default values, and the daily-spend auto-reset so the
 * tool layer stays thin.
 */

import type { Mandate, Policy, SpendTracker } from "../engine/types.js";
import { readJSON, writeJSON } from "./store.js";

const POLICY_FILE = "policy.json";
const SPEND_FILE = "spend-tracker.json";
const MANDATES_FILE = "mandates.json";

/** Sensible first-run policy: caps set, no allowlist, no expiry. */
export const DEFAULT_POLICY: Policy = {
  maxAmount: 5000,
  dailyLimit: 20000,
  allowedPayees: [],
  expiresOn: null,
};

/** Today's date as YYYY-MM-DD (local time). */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Policy ──────────────────────────────────────────────────────────────────

export function loadPolicy(): Policy {
  // Merge over defaults so older/partial files gain new fields safely.
  const stored = readJSON<Partial<Policy>>(POLICY_FILE, DEFAULT_POLICY);
  return { ...DEFAULT_POLICY, ...stored };
}

export function savePolicy(policy: Policy): void {
  writeJSON(POLICY_FILE, policy);
}

// ── Spend tracker (with daily auto-reset) ────────────────────────────────────

/**
 * Load today's spend. If the stored date is not today, the counter is reset to
 * 0 and persisted (automatic daily reset).
 */
export function loadSpendToday(now: Date = new Date()): SpendTracker {
  const fresh: SpendTracker = { date: today(now), spent: 0 };
  const stored = readJSON<SpendTracker>(SPEND_FILE, fresh);

  if (stored.date !== fresh.date) {
    writeJSON(SPEND_FILE, fresh);
    return fresh;
  }
  return stored;
}

/** Add to today's spend counter and persist; returns the new total. */
export function addSpendToday(amount: number, now: Date = new Date()): number {
  const tracker = loadSpendToday(now);
  tracker.spent += amount;
  writeJSON(SPEND_FILE, tracker);
  return tracker.spent;
}

/** Reset today's spend counter to 0. */
export function resetSpendToday(now: Date = new Date()): void {
  writeJSON(SPEND_FILE, { date: today(now), spent: 0 });
}

// ── Mandates ─────────────────────────────────────────────────────────────────

export function loadMandates(): Mandate[] {
  return readJSON<Mandate[]>(MANDATES_FILE, []);
}

export function saveMandates(mandates: Mandate[]): void {
  writeJSON(MANDATES_FILE, mandates);
}
