#!/usr/bin/env node
/**
 * PaymentGuard entry point.
 *
 * - As an executable: starts the MCP server over stdio.
 * - As a library: re-exports the pure engine + service for direct import.
 */

import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp/server.js";

// ── Library surface ───────────────────────────────────────────────────────────
export * from "./engine/types.js";
export { evaluatePayment, normalizePayee, isPolicyExpired } from "./engine/policy-engine.js";
export {
  mandateStatus,
  findActiveMandates,
  evaluateMandate,
  selectMandate,
  remainingBudget,
} from "./engine/mandate-engine.js";
export { validateRequest } from "./engine/validators.js";
export { decidePayment } from "./engine/decide.js";
export type { DecisionContext, FullDecision } from "./engine/decide.js";
export {
  computeHash,
  appendAuditEntry,
  verifyAuditIntegrity,
  getRecentEntries,
} from "./engine/audit.js";
export { processPayment } from "./payment-service.js";
export { createServer } from "./mcp/server.js";

/** Start the MCP server over stdio. */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[payment-guard] MCP server running on stdio.");
}

// Only auto-start when run directly (not when imported as a library).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly || process.env.PAYMENT_GUARD_AUTOSTART === "1") {
  main().catch((err) => {
    console.error("[payment-guard] fatal:", err);
    process.exit(1);
  });
}
