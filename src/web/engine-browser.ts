/**
 * Browser entry point for the live demo.
 *
 * Re-exports only the pure, Node-free parts of the engine so they can be
 * bundled and run directly in a web page — no server, no I/O, no Node APIs.
 * This is the same decision code the MCP server and library use, which is the
 * whole point: the demo shows the *real* engine making the call, in your browser.
 */

export { decidePayment } from "../engine/decide.js";
export { normalizePayee } from "../engine/policy-engine.js";
export { mandateStatus, remainingBudget } from "../engine/mandate-engine.js";
export type { DecisionContext, FullDecision } from "../engine/decide.js";
export type { Policy, Mandate, PaymentRequest, Decision } from "../engine/types.js";
