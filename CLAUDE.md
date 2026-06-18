# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Project Overview

**PaymentGuard** is a non-custodial, rail-agnostic payment safety layer for AI
agents. It is shipped as:

1. An **MCP server** that any AI agent (Claude Code, etc.) can connect to.
2. A **standalone TypeScript library** developers can import directly.

The core idea: the user defines rules and mandates (spending caps, allowed
payees, expiry dates, scoped budgets) **in advance**. When an AI agent wants to
move money on the user's behalf, the request goes through PaymentGuard first.
PaymentGuard checks the request against the user's rules using **strict,
deterministic code — not AI opinion** — and returns `allowed`/`blocked` with a
reason. The AI can never override the hard rules. This protects against prompt
injection, runaway spending, and unauthorized transactions.

PaymentGuard is **non-custodial**: it never holds funds and never moves money
itself. It is a decision + audit layer that sits in front of whatever settlement
rail you use.

## Architecture

```
AI agent (MCP client)
        │  make_payment / set_policy / create_mandate / ...
        ▼
  MCP wrapper          src/mcp/         — tool registration + zod schemas
        │
        ▼
  Core engine          src/engine/      — PURE, deterministic decision logic
   ├─ validators.ts        input validation / prompt-injection defense
   ├─ policy-engine.ts     global policy rules (caps, daily limit, expiry)
   ├─ mandate-engine.ts    scoped, expiring, revocable authorizations
   └─ audit.ts             append-only, hash-chained audit trail
        │
        ▼
  Storage              src/storage/     — JSON persistence in data/
        │
        ▼
  Settlement adapters  (future)         — actually move money on a rail
```

## Key Design Principles

- **Deterministic rules over AI opinion.** The decision engine
  (`evaluatePayment`, mandate checks) is pure: data in, decision out. No async,
  no network, no AI calls. This purity *is* the security guarantee.
- **Fail closed.** If anything is ambiguous, corrupted, or unexpected, **block**
  the payment. Better to block a legitimate payment than to allow a fraudulent
  one.
- **Append-only audit trail.** Every decision (allowed or blocked) is recorded
  in a SHA-256 hash chain so tampering is detectable.
- **Mandate-scoped authorization.** Money only moves under an explicit,
  user-created mandate that is scoped to a payee, capped per-transaction and in
  total, and has a mandatory expiry. Mandates are revocable at any time.

## Tech Stack

- TypeScript (strict mode, ES2022, NodeNext modules)
- Node.js (>= 20)
- `@modelcontextprotocol/sdk` for the MCP server
- `zod` for all tool input validation

## How to Run

```bash
npm install
npx tsx src/index.ts      # start the MCP server over stdio
# or
npm start
```

Connect it to an MCP client (e.g. Claude Code) by pointing the client at
`npx tsx <abs-path>/src/index.ts`.

## Coding Conventions

- **Never use `console.log`** in code that runs as part of the MCP server —
  stdout is reserved for the MCP JSON-RPC protocol. Use `console.error` for all
  debug/info logging.
- **All policy/mandate/audit data persists to JSON files in `data/`** (created
  on first run, gitignored).
- **Every MCP tool returns** `content: [{ type: "text", text: JSON.stringify(result) }]`
  plus a human-readable summary so the agent can explain the outcome.
- **Use zod for every MCP tool input schema.**
- **Keep the engine pure** — no `any`, proper null checks, strict TypeScript.
- Conventional commit messages (`feat:`, `refactor:`, `docs:`, `fix:`).

## Notable Structural Notes / Judgment Calls

- `readJSON<T>(filename, fallback)` takes a `fallback` used to seed the file on
  first run and to recover from corruption (fail-closed for storage).
- `src/storage/repository.ts` holds typed accessors + defaults on top of the
  generic `store.ts`, keeping tool files thin.
- The global `allowedPayees` allowlist is only enforced when it is **non-empty**.
  With the mandate system, authorization is primarily mandate-driven; an empty
  allowlist means "rely on mandates", not "block everything".
