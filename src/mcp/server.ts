/**
 * MCP server assembly. Creates the server and registers every tool group.
 * Transport/connection lives in index.ts so this stays importable/testable.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPaymentTools } from "./tools/payment-tools.js";
import { registerPolicyTools } from "./tools/policy-tools.js";
import { registerMandateTools } from "./tools/mandate-tools.js";
import { registerAuditTools } from "./tools/audit-tools.js";

/** Build a fully-wired PaymentGuard MCP server (not yet connected). */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "payment-guard",
    version: "0.1.0",
  });

  registerPaymentTools(server);
  registerPolicyTools(server);
  registerMandateTools(server);
  registerAuditTools(server);

  return server;
}
